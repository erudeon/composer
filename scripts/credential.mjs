#!/usr/bin/env node
/**
 * ONE CLICK, ONCE, IN A BROWSER — and then never again.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────────────────────────────────
 *
 * The file doors (`push.mjs`, `images.mjs`) read `PTY_MCP_TOKEN` out of the environment. An environment
 * variable dies with the terminal that set it, so EVERY session started with no credential, and the
 * author was asked to go and mint one again: open the Hub, find the MCP tab, scroll, click Create token,
 * copy a secret, and get it into a shell they have no reason to know how to use. They are an author,
 * usually a student. Nothing about that is their job, and asking it once a session made the cheap upload
 * path the one that stalls.
 *
 * Worse, the only places a copied secret can go are a terminal and a chat, and both are wrong: a command
 * typed with a token in it lands in shell history in plain text, and a token pasted into a chat is in a
 * transcript forever. That has already happened here twice.
 *
 * ── WHAT THIS DOES INSTEAD ───────────────────────────────────────────────────────────────────────────
 *
 * The Hub runs a full OAuth authorization server for its MCP, and it already supports every piece this
 * needs: open dynamic client registration, PKCE, loopback redirects and refresh tokens. So:
 *
 *   1. we register ourselves as a client, once, and remember the id;
 *   2. we open the author's OWN default browser at the Hub's consent page — no extension, no automation,
 *      no browser the author has to have set up, just `open`;
 *   3. they click Approve on a page served by the Hub they are already signed into;
 *   4. the answer comes back to a short-lived listener on 127.0.0.1, so the secret never passes through
 *      a screen, a clipboard, a shell history or a chat;
 *   5. we keep the refresh token and renew silently from then on.
 *
 * The author sees one page and one button, and only sees it again if they go a month without using the
 * Composer, or if they revoke it themselves.
 *
 * ── WHY THERE IS NO EXPIRY WRITTEN DOWN ──────────────────────────────────────────────────────────────
 *
 * The obvious design is to record when the credential lapses and ask again on that date. It is wrong in
 * both directions: a credential can stop working long before its expiry (revoked, or the account
 * changed), and a recorded date is a second copy of a fact the server already owns. So nothing here
 * predicts. It TRIES, and the only thing that decides whether the author is asked again is whether the
 * renewal actually worked. That is also the answer to a revoked credential, at no extra cost.
 *
 * ── WHAT IS DELIBERATELY STILL SUPPORTED ─────────────────────────────────────────────────────────────
 *
 * `PTY_MCP_TOKEN` in the environment still wins over everything, unchanged. A machine with no browser
 * (CI, a box over SSH) cannot do any of the above, and that is exactly the case a hand-minted token is
 * for. It is now the exception rather than the only way in.
 *
 * Plain Node, no dependencies, so it runs anywhere the other scripts do.
 */
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { pathToFileURL } from "node:url";

export const PRODUCTION_HUB = "https://hub.passtheyear.com";

/**
 * NOT in the Composer workspace. That lives in `~/Documents`, which on most Macs is synced to iCloud,
 * and a credential belongs on ONE machine. `~/.config` is the boring, local, unsynced place for it.
 */
const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "erudeon", "composer");
const STORE = join(CONFIG_DIR, "credentials.json");

/** Renew this long before the access token lapses, so a slow upload cannot start on a dying one. */
const RENEW_BEFORE_MS = 2 * 60 * 1000;

/** How long the author has to click Approve before the listener gives up and the port is released. */
const CONSENT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * The narrowest scope that covers what the file doors do (lessons, questions, glossary, figures). It is
 * REQUESTED, never assumed: if the Hub stops advertising it we ask for nothing and take whatever the
 * consent screen grants, rather than sending a scope name this repo made up.
 */
const WANTED_SCOPE = "content";

// ── The store ────────────────────────────────────────────────────────────────────────────────────────

function readStore() {
  try {
    const parsed = JSON.parse(readFileSync(STORE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {}; /** absent, unreadable or corrupt are the same thing here: no credential. */
  }
}

/**
 * 0700 on the directory and 0600 on the file, set on every write: an inherited umask is not a permission,
 * and `mode` is ignored for a file that already exists, so the `chmod` is not belt and braces.
 *
 * WRITTEN BESIDE AND RENAMED OVER, because a rename is atomic and a truncating write is not. A reader
 * that catches a half-written file treats it as "never signed in" (`readStore` collapses corrupt into
 * absent on purpose), so a torn write is a silent sign-out, and two doors running at once can tear one.
 */
function writeStore(store) {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  chmodSync(CONFIG_DIR, 0o700);
  const beside = `${STORE}.${process.pid}.tmp`;
  writeFileSync(beside, JSON.stringify(store, null, 2), { mode: 0o600 });
  chmodSync(beside, 0o600);
  renameSync(beside, STORE);
}

function recordFor(hub) {
  const record = readStore()[hub];
  return record && typeof record === "object" ? record : null;
}

function saveRecord(hub, record) {
  const store = readStore();
  store[hub] = { ...(store[hub] ?? {}), ...record };
  writeStore(store);
}

/**
 * Forget the credential, KEEP the registration.
 *
 * `clientId` is not a secret and not a credential: it is this machine's name for itself, and a loopback
 * registration stays valid on tomorrow's port (RFC 8252 matches everything but the port). Deleting it
 * with the credential meant every re-approval registered a brand new client, so a run of them would
 * leave a drawer of identical rows on the Hub that nobody can tell apart or clean up.
 */
function forgetCredential(hub, onlyIfRefreshToken = null) {
  const store = readStore();
  if (!(hub in store)) return;
  /*
   * COMPARE, THEN DELETE. Two doors can renew at once: the first spends the shared refresh token and
   * writes the replacement, the second presents the token now spent and is told 400. Deleting on that
   * 400 would throw away the replacement the FIRST one just earned, and sign the author out a moment
   * after a renewal that worked. So a caller says which token it was refused for, and the record is only
   * forgotten while that is still the token on disk.
   */
  if (onlyIfRefreshToken && store[hub].refreshToken !== onlyIfRefreshToken) return;
  const kept = store[hub].clientId;
  delete store[hub];
  if (kept) store[hub] = { clientId: kept };
  writeStore(store);
}

// ── Discovery ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every URL and every capability is READ from the Hub, never written down here. The endpoints, the
 * scope vocabulary and the resource identifier are the server's to change, and a copy of them in this
 * repo is a copy that goes stale silently.
 */
async function discover(hub) {
  const [as, protectedResource] = await Promise.all([
    fetchJson(`${hub}/.well-known/oauth-authorization-server/api/mcp`),
    fetchJson(`${hub}/.well-known/oauth-protected-resource/api/mcp`),
  ]);
  if (!as?.authorization_endpoint || !as?.token_endpoint || !as?.registration_endpoint)
    throw new Error(`${hub} did not answer with the sign-in details.`);
  if (!protectedResource?.resource) throw new Error(`${hub} did not say what it calls itself.`);
  return {
    authorizeUrl: as.authorization_endpoint,
    tokenUrl: as.token_endpoint,
    registerUrl: as.registration_endpoint,
    resource: protectedResource.resource,
    scopes: Array.isArray(as.scopes_supported) ? as.scopes_supported : [],
  };
}

/** Nothing here waits forever. `bearerFor` runs at the top of every upload and promises not to stall, and
 * a socket that is accepted and never answered (a captive portal, a hung edge) is the shape that breaks
 * that promise: the platform default is minutes, per request, and a renewal can make three. */
const REACH_TIMEOUT_MS = 15 * 1000;

async function fetchJson(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REACH_TIMEOUT_MS) });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* an HTML body is a login page or a proxy, and it is reported by the caller as a failed step */
  }
  if (!response.ok) {
    const detail = body?.error_description ?? body?.error ?? `HTTP ${response.status}`;
    const error = new Error(String(detail));
    error.status = response.status;
    throw error;
  }
  return body;
}

// ── The bearer, with no questions asked ──────────────────────────────────────────────────────────────

/**
 * The credential to send, or null if the author has to approve one first.
 *
 * NEVER INTERACTIVE. It does not open a browser and it cannot hang waiting for a person: the doors call
 * it in the middle of an upload, where a stall is worse than a refusal. Signing in is `login`, which is
 * its own deliberate step.
 */
export async function bearerFor(hub) {
  /*
   * THE ENVIRONMENT'S TOKEN IS FOR ONE PLACE. It is a bearer for pass the year and nothing else, and it
   * is not keyed by anything, so returning it whatever `hub` says would send it to any host somebody puts
   * on the command line. That somebody is usually an agent, and this repo's history is two credentials
   * lost to an agent doing something reasonable-looking with one. The stored sign-in never had this
   * problem: it is filed under its hub and cannot be handed to another.
   */
  const fromEnv = process.env.PTY_MCP_TOKEN;
  if (fromEnv) return hub === PRODUCTION_HUB ? fromEnv : null;

  const record = recordFor(hub);
  if (!record?.refreshToken) return null; /** a bare clientId is a registration, not a sign-in */

  const stillFresh =
    record.accessToken &&
    typeof record.accessExpiresAt === "number" &&
    record.accessExpiresAt - Date.now() > RENEW_BEFORE_MS;
  if (stillFresh) return record.accessToken;

  return await renew(hub, record);
}

/**
 * Rotate-on-use: the answer carries a NEW refresh token and the old one is spent, so a failure to write
 * the new one down locks the author out until they approve again. It is written before it is used.
 *
 * A KILLED PROCESS MID-RENEWAL LOOKS LIKE A STOLEN TOKEN, and that is expected rather than broken. If
 * this process dies between the Hub consuming the old token and the write below, the store keeps a token
 * the server has already spent; presenting it next time is the signal for a stolen credential, so the
 * Hub revokes the connection and the author approves once more. It costs one click and a log line, and
 * it is not worth carrying crash-recovery state to avoid: every alternative either throws away a working
 * credential whenever the network is slow, or keeps two live tokens to guess between. It has happened
 * exactly once here, when the whole application was quit mid-run.
 */
async function renew(hub, record) {
  const tokenUrl = record.tokenUrl ?? (await discover(hub).then((d) => d.tokenUrl).catch(() => null));
  if (!tokenUrl) return null;
  try {
    const body = await fetchJson(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: record.refreshToken,
        client_id: record.clientId,
        /*
         * RFC 8707 asks for `resource` on a token request and a refresh IS one. This Hub does not require
         * it today (renewals verified working without it, and the renewed token is still accepted by the
         * audience check on the import door), so this is here for the day it does: without it a tightened
         * server answers 400, which reads here as "finished" and sends the author to the browser hourly.
         */
        ...(record.resource ? { resource: record.resource } : {}),
      }).toString(),
    });
    saveRecord(hub, {
      refreshToken: body.refresh_token ?? record.refreshToken,
      accessToken: body.access_token,
      accessExpiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000,
    });
    return body.access_token ?? null;
  } catch (cause) {
    /*
     * 400 and 401 ONLY, which are the two the token endpoint answers when the credential itself is
     * finished: spent, revoked, or expired past renewal. Keeping one of those would make every later run
     * pay a doomed request and report a network problem instead of the truth, which is that the author
     * has to approve once more.
     *
     * NOT every 4xx. A 429 is a rate limiter saying "later", and forgetting a working credential because
     * the Hub was busy for a second would send the author back to the browser for nothing. Everything
     * else — offline, a gateway, a 500, a 429 — is temporary, and the credential is left where it is.
     */
    const finished = cause?.status === 400 || cause?.status === 401;
    if (finished) forgetCredential(hub, record.refreshToken);
    /*
     * SAY WHY, to the agent, on stderr. A renewal that fails silently is indistinguishable from one that
     * was never attempted, and the difference decides what the author is told: "press Approve again" is
     * right for a finished credential and wrong for a laptop that is offline. Never the credential
     * itself, and never on stdout, which some callers parse.
     */
    console.error(
      finished
        ? `Sign-in refused (${cause?.status}: ${cause?.message ?? "no reason given"}). Asking for a new one.`
        : `Could not renew the sign-in right now (${cause?.message ?? "no reason given"}). Keeping it.`,
    );
    return null;
  }
}

// ── Signing in ───────────────────────────────────────────────────────────────────────────────────────

const base64url = (buffer) => buffer.toString("base64url");

/** RFC 7636 S256: the verifier is the secret, the challenge is what travels. */
function pkce() {
  const verifier = base64url(randomBytes(32));
  return { verifier, challenge: base64url(createHash("sha256").update(verifier).digest()) };
}

/**
 * The author's own default browser, through the platform's own opener, with the URL as an ARGUMENT and
 * never as part of a command line: no shell is involved anywhere in this repo and this is not the place
 * to start.
 */
function openBrowser(url) {
  const [command, args] =
    platform() === "darwin"
      ? ["open", [url]]
      : platform() === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  /*
   * It REPORTS. A machine with no `xdg-open` is exactly the headless case a hand-minted token exists for,
   * and swallowing the error there printed "Opening the window now", waited five minutes, and then blamed
   * the author for not pressing a button nobody had shown them.
   */
  return new Promise((resolve) => execFile(command, args, (error) => resolve(!error)));
}

const CLOSE_TAB_PAGE = `<!doctype html><meta charset="utf-8"><title>Composer</title>
<body style="font:16px/1.6 -apple-system,system-ui,sans-serif;display:grid;place-items:center;height:90vh;margin:0;color:#111">
<main style="text-align:center"><p style="font-size:20px">You are all set.</p>
<p style="color:#666">You can close this tab and go back to the Composer.</p></main>`;

/**
 * Open the consent page and wait for the answer.
 *
 * The listener is on 127.0.0.1 with a port the operating system picks, it answers exactly one request,
 * and it is closed on every path out of here including the failures. A redirect that carries the wrong
 * `state` is not the one we started and is refused without being exchanged.
 */
export async function signIn(hub, { timeoutMs = CONSENT_TIMEOUT_MS, onUrl, open = openBrowser } = {}) {
  const found = await discover(hub);
  const { verifier, challenge } = pkce();
  const state = base64url(randomBytes(16));

  const { server, port } = await listen();
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  try {
    /*
     * The client id is reused across sign-ins: loopback redirects match on everything but the PORT
     * (RFC 8252), so yesterday's registration is still valid on today's port, and registering afresh
     * every time would leave a drawer of identical clients behind.
     */
    let clientId = recordFor(hub)?.clientId;
    if (!clientId) {
      const registered = await fetchJson(found.registerUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Composer",
          redirect_uris: [redirectUri],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        }),
      });
      clientId = registered?.client_id;
      if (!clientId) throw new Error(`${hub} would not register the Composer.`);
      saveRecord(hub, { clientId });
    }

    const authorize = new URL(found.authorizeUrl);
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("code_challenge", challenge);
    authorize.searchParams.set("code_challenge_method", "S256");
    authorize.searchParams.set("resource", found.resource);
    if (found.scopes.includes(WANTED_SCOPE)) authorize.searchParams.set("scope", WANTED_SCOPE);

    /*
     * THE LISTENER IS ARMED BEFORE THE BROWSER IS OPENED. A server with no `request` handler drops the
     * event rather than queueing it, and a browser that is already running answers fast enough to land
     * in that gap.
     */
    const code = awaitCode(server, { state, timeoutMs });
    /*
     * OBSERVED THE MOMENT IT EXISTS. Between arming it and awaiting it below sits the opener, which can
     * take its time; a timeout or a stranger's `?error=` landing in that window rejected a promise nobody
     * held, which in Node is not an exception the caller can catch but a stack trace and a dead process.
     */
    code.catch(() => {});

    /*
     * THE LINK IS PRINTED ONLY IF NO WINDOW OPENED.
     *
     * It carries `state` and `code_challenge`, which are the two things protecting this request, and
     * printing them put both into the agent's transcript on every single sign-in. Anybody who could read
     * that could open the same page, approve it with THEIR account, and have the reply land here with the
     * right state and a challenge our verifier matches: the Composer would then be signed in as a stranger
     * and the author's course would publish under somebody else's name. So it is a fallback, not a habit.
     */
    const opened = await open(authorize.toString());
    if (!opened && onUrl) onUrl(authorize.toString());

    const body = await fetchJson(found.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: await code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
        resource: found.resource,
      }).toString(),
    });
    if (!body?.access_token || !body?.refresh_token)
      throw new Error(`${hub} approved the Composer but sent nothing to sign requests with.`);

    saveRecord(hub, {
      clientId,
      tokenUrl: found.tokenUrl,
      resource: found.resource,
      refreshToken: body.refresh_token,
      accessToken: body.access_token,
      accessExpiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000,
      approvedAt: new Date().toISOString(),
    });
    return { scope: body.scope ?? null };
  } finally {
    server.closeAllConnections?.(); /** the browser holds the socket open, and close() alone waits for it */
    server.close();
  }
}

function listen() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function awaitCode(server, { state, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      /*
       * FOUR CAUSES, ONE MESSAGE, so the message has to name more than one. Nothing reaches this listener
       * unless the Hub actually redirects, so a refused client, a rejected redirect and an unknown scope
       * all arrive here as silence, exactly like an author who walked away.
       */
      reject(new Error("Nothing came back within five minutes: either it was not approved, or the page never got that far."));
    }, timeoutMs);
    timer.unref?.();

    server.on("request", (request, response) => {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        response.writeHead(404).end();
        return;
      }
      const answer = (status, page) => response.writeHead(status, { "content-type": "text/html; charset=utf-8" }).end(page);
      /*
       * THE STATE IS CHECKED BEFORE ANYTHING ELSE, INCLUDING THE FAILURE BRANCH.
       *
       * This port is open to everything on the machine, and for the minutes a sign-in is pending a page in
       * any browser tab can reach it too (an <img> against the loopback range costs the attacker nothing).
       * Reading `error` first meant one unauthenticated GET, with no state at all, cancelled the sign-in.
       * Checking state first makes every one of those a stranger's reply: answered, ignored, and the real
       * one still welcome.
       */
      if (url.searchParams.get("state") !== state) {
        answer(400, `<!doctype html><meta charset="utf-8"><p>That reply did not belong to this sign-in.</p>`);
        return;
      }
      /*
       * And what comes back is a CODE from a closed list, never the far end's sentence. `error_description`
       * is free text from whatever answered, and it was being put verbatim into the context of an agent
       * that reads its tool output as instruction. In this repo, whose history is two credentials lost to
       * an agent following something plausible, that is a door, not a diagnostic.
       */
      const error = url.searchParams.get("error");
      if (error) {
        answer(400, `<!doctype html><meta charset="utf-8"><p>That was not approved. You can close this tab.</p>`);
        clearTimeout(timer);
        reject(new Error(/^[a-z_]{1,64}$/.test(error) ? error : "it was refused"));
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        answer(400, `<!doctype html><meta charset="utf-8"><p>That reply was incomplete.</p>`);
        return;
      }
      answer(200, CLOSE_TAB_PAGE);
      clearTimeout(timer);
      resolve(code);
    });
  });
}

// ── What the doors say when there is nothing to send ─────────────────────────────────────────────────

/**
 * WHAT TO DO, IN ORDER. Read by an agent, never by the author.
 *
 * It does not carry the sentence the author hears. That lives in `skills/composer/reference/voice.md`
 * under "The one-time sign-in", which is read at the start of every run and is the one place tone is
 * decided; a second copy of those words here would be the copy that goes stale. This file owns the
 * mechanics: what runs, in what order, and where a token is made when there is no browser to open.
 *
 * The address is DERIVED from the place being written to, so it is right on any deployment.
 */
export function noCredentialMessage(hub, { pluginRoot = "${CLAUDE_PLUGIN_ROOT}" } = {}) {
  return (
    `Not signed in to pass the year yet. The author approves this once, in their browser.\n\n` +
    `1. TELL THEM FIRST what is about to happen and why, in their words: voice.md, "The one-time\n` +
    `   sign-in". A browser window nobody warned them about is alarming.\n` +
    `2. Then run this, and allow five minutes, because a person has to press a button:\n` +
    `     node ${pluginRoot}/scripts/credential.mjs login\n` +
    `3. Then run what you were running again.\n\n` +
    `No browser on this machine? Set PTY_MCP_TOKEN, made at ${hub}/account?tab=mcp under MCP tokens.\n` +
    `Never look for a credential anywhere else: twice that has ended with an unrelated service's\n` +
    `secret being sent to this API.`
  );
}

// ── The command line ─────────────────────────────────────────────────────────────────────────────────

const HELP = `
Usage: node scripts/credential.mjs <login | status | forget> [--hub <url>]

  login    open the author's browser so they can approve this once
  status   say whether anything here can reach the Hub, without asking anybody
  forget   remove the stored credential from this machine
`.trim();

async function main(argv) {
  const hubFlag = argv.indexOf("--hub");
  /**
   * The value after `--hub` is not the command: `--hub <url> login` used to read the URL as one. Guarded
   * on `hubFlag !== -1`, because with no flag at all `hubFlag + 1` is 0, which is the command itself.
   */
  const command = argv.find((a, i) => !a.startsWith("--") && !(hubFlag !== -1 && i === hubFlag + 1));
  const hub = hubFlag !== -1 ? argv[hubFlag + 1] : PRODUCTION_HUB;
  if (hubFlag !== -1 && !hub) {
    console.error(`--hub needs a URL.\n\n${HELP}`);
    return 1;
  }
  if (!command || argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return command ? 0 : 1;
  }

  if (command === "forget") {
    forgetCredential(hub);
    console.log(`Forgotten. The next upload will ask the author for one click.`);
    return 0;
  }

  if (command === "status") {
    if (process.env.PTY_MCP_TOKEN) {
      console.log(`Ready. Ask the author for nothing.`);
      return 0;
    }
    if (await bearerFor(hub)) {
      const approved = recordFor(hub)?.approvedAt;
      console.log(`Ready. Ask the author for nothing.${approved ? ` (Approved ${approved.slice(0, 10)}.)` : ""}`);
      return 0;
    }
    console.log(noCredentialMessage(hub, { pluginRoot: "." }));
    return 1;
  }

  if (command !== "login") {
    console.error(`Unknown command: ${command}\n\n${HELP}`);
    return 1;
  }

  if (process.env.PTY_MCP_TOKEN) {
    console.log(`Already set up on this machine. Ask the author for nothing.`);
    return 0;
  }

  console.log(
    `Opening the window now. They press Approve, and that is the whole of it.\n` +
      `If they ask why, or worry about what it reaches: voice.md, "The one-time sign-in".`,
  );
  try {
    await signIn(hub, {
      onUrl: (url) => console.log(`\nIf no window appears, give them this link to open:\n  ${url}\n`),
    });
  } catch (cause) {
    console.error(
      `\nNot approved: ${cause instanceof Error ? cause.message : String(cause)}\n` +
          `No harm done and nothing was approved. Say you will open it again, then run this again.`,
    );
    return 1;
  }
  console.log(`\nSigned in. Tell them they will not be asked again, then run what you were running.`);
  return 0;
}

/** Run only when invoked directly: the doors IMPORT this file and must not trip the command line. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)));
}
