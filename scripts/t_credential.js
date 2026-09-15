/**
 * THE AUTHOR IS ASKED ONCE, AND THE THING THAT DECIDES IS WHETHER A RENEWAL WORKED.
 *
 * This drives the whole sign-in against a FAKE hub: discovery, registration, the consent redirect, the
 * loopback listener, the exchange and the store. Nothing here reaches the network and no browser opens,
 * because `signIn` takes the opener as an argument and this hands it the fake author.
 *
 * The parts worth pinning, each of which has a real failure behind it:
 *   - the proof sent with the exchange really is the SHA-256 of the secret kept back (get this wrong and
 *     the whole flow is an open redirect with extra steps);
 *   - a reply carrying somebody else's `state` is refused and the real one is still accepted after it;
 *   - the file holding the credential is readable by its owner and nobody else;
 *   - a renewal that fails because the credential is FINISHED forgets it, and one that fails because the
 *     machine is offline does not.
 */
const assert = require("node:assert");
const http = require("node:http");
const { createHash } = require("node:crypto");
const { mkdtempSync, statSync, existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

/* Set BEFORE the module loads: it reads the config location once, at import. */
const config = mkdtempSync(join(tmpdir(), "composer-cred-"));
process.env.XDG_CONFIG_HOME = config;
delete process.env.PTY_MCP_TOKEN;

const STORE = join(config, "erudeon", "composer", "credentials.json");

/** A hub that answers the four requests a sign-in makes, and checks the proof on the last one. */
function fakeHub({ tokenStatus = 200 } = {}) {
  let challenge = null;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const json = (status, body) =>
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    const origin = `http://127.0.0.1:${server.address().port}`;

    if (url.pathname === "/.well-known/oauth-authorization-server/api/mcp")
      return json(200, {
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/api/oauth/token`,
        registration_endpoint: `${origin}/api/oauth/register`,
        scopes_supported: ["content", "crm"],
      });
    if (url.pathname === "/.well-known/oauth-protected-resource/api/mcp")
      return json(200, { resource: `${origin}/api/mcp` });
    if (url.pathname === "/api/oauth/register") return json(201, { client_id: "client-1" });
    if (url.pathname === "/api/oauth/token") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const form = new URLSearchParams(body);
        if (tokenStatus !== 200) return json(tokenStatus, { error: "invalid_grant" });
        if (form.get("grant_type") === "authorization_code") {
          const proof = createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url");
          assert.strictEqual(proof, challenge, "the exchange did not prove it started the sign-in");
        }
        json(200, { access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600, scope: "content" });
      });
      return;
    }
    json(404, {});
  });
  server.setChallenge = (c) => (challenge = c);
  return server;
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

(async () => {
  const { bearerFor, signIn, noCredentialMessage } = await import("./credential.mjs");

  /* Nothing stored, nothing in the environment: no credential, and the message names the author's page. */
  assert.strictEqual(await bearerFor("https://hub.example.com"), null);
  assert.match(
    noCredentialMessage("https://hub.example.com"),
    /https:\/\/hub\.example\.com\/account\?tab=mcp/,
    "the message does not say where to go",
  );

  const hub = fakeHub();
  const origin = await listen(hub);

  /* The fake author: they read the consent page, then their browser follows the redirect home. */
  let sawAuthorize = null;
  const approve = async (url) => {
    sawAuthorize = new URL(url);
    hub.setChallenge(sawAuthorize.searchParams.get("code_challenge"));
    const back = new URL(sawAuthorize.searchParams.get("redirect_uri"));
    back.searchParams.set("code", "code-1");

    /* Somebody else's reply first. It must be refused, and must not consume the sign-in. */
    const wrong = new URL(back);
    wrong.searchParams.set("state", "not-the-state");
    const refused = await fetch(wrong);
    assert.strictEqual(refused.status, 400, "a reply with the wrong state was accepted");

    back.searchParams.set("state", sawAuthorize.searchParams.get("state"));
    const accepted = await fetch(back);
    assert.strictEqual(accepted.status, 200, "the real reply was not accepted");
  };

  await signIn(origin, { open: approve });

  assert.strictEqual(sawAuthorize.searchParams.get("code_challenge_method"), "S256");
  assert.strictEqual(sawAuthorize.searchParams.get("resource"), `${origin}/api/mcp`);
  assert.strictEqual(sawAuthorize.searchParams.get("scope"), "content", "a wider scope than needed was asked for");
  assert.match(sawAuthorize.searchParams.get("redirect_uri"), /^http:\/\/127\.0\.0\.1:\d+\/callback$/);

  /* Stored, and readable by nobody else. */
  assert.strictEqual(statSync(STORE).mode & 0o777, 0o600, "the credential file is readable by others");
  assert.doesNotMatch(readFileSync(STORE, "utf8"), /code-1/, "the spent code was written down");

  /* And now it is silent: a fresh access token is returned with no request at all. */
  hub.close();
  assert.strictEqual(await bearerFor(origin), "access-1", "a stored sign-in did not answer on its own");

  /* Stale, and the hub is unreachable: temporary, so the credential is KEPT and the run just has none. */
  const store = JSON.parse(readFileSync(STORE, "utf8"));
  store[origin].accessExpiresAt = Date.now() - 1;
  require("node:fs").writeFileSync(STORE, JSON.stringify(store));
  assert.strictEqual(await bearerFor(origin), null, "an unreachable hub did not fail closed");
  assert.ok(existsSync(STORE) && JSON.parse(readFileSync(STORE, "utf8"))[origin], "an offline machine was signed out");

  /* Stale, and the hub says the credential is finished: forgotten, so the next run asks for a click. */
  const dead = fakeHub({ tokenStatus: 400 });
  await new Promise((r) => dead.listen(new URL(origin).port, "127.0.0.1", r));
  assert.strictEqual(await bearerFor(origin), null);
  assert.ok(!JSON.parse(readFileSync(STORE, "utf8"))[origin], "a finished credential was kept");
  dead.close();

  console.log("t_credential: the author is asked once, and only a failed renewal asks again");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
