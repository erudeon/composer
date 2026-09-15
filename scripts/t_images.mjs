/**
 * THE UPLOADER'S TWO SILENT FAILURES, driven end to end against a throwaway server.
 *
 *   node scripts/t_images.mjs
 *
 * Both bugs this pins cost pictures without saying so, which is the only kind worth a check here:
 *
 *   1. It packed requests to the route's documented 20 MB ceiling, and production refuses long before
 *      that. Every course worth batching failed on its first request.
 *   2. On a refusal it tested `!response.ok` BEFORE looking for the per-file answer, so a 207 or a 422
 *      carrying `uploaded` and `failed` per file was overwritten with the status code. The operator got
 *      a wall of identical lines and no way to tell which picture was at fault.
 *
 * A real `node:http` server rather than a stub, because the thing under test is what the script does
 * with an ANSWER, and a stub would be the author's belief about that answer rather than one.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import {
  FRAMING_ALLOWANCE_BYTES,
  HUB_BODY_LIMIT_BYTES,
} from "./figure-batches.mjs";

let failed = 0;
let ran = 0;
const check = (what, got, expected) => {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  ran += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok)
    console.log(
      `       expected ${JSON.stringify(expected)}\n       got      ${JSON.stringify(got)}`,
    );
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t_images-"));

/*
 * A CREDENTIAL FOR THE TEST'S OWN HUB, in the test's own config directory.
 *
 * `bearerFor` returns `PTY_MCP_TOKEN` for the PRODUCTION hub and NOTHING for any other, so a token
 * cannot be sent to whatever `--hub` somebody puts on a command line. That rule is the point, so this
 * does not route around it: it stores a sign-in for the throwaway hub, which is the per-hub credential
 * the design intends.
 *
 * `XDG_CONFIG_HOME` is set BEFORE the import because `credential.mjs` reads the config directory when it
 * loads, and `rememberSignIn` is its own seam, so the store's path and shape stay known to one module.
 * Without both of those, this would write a fake credential into the author's real store.
 */
const configHome = path.join(dir, "config");
process.env.XDG_CONFIG_HOME = configHome;
const { rememberSignIn } = await import("./credential.mjs");

const signIn = (hub) =>
  rememberSignIn(hub, {
    refreshToken: "test-refresh",
    accessToken: "test-access",
    accessExpiresAt: Date.now() + 60 * 60 * 1000,
  });

function figures(n, mb) {
  const list = [];
  for (let i = 1; i <= n; i += 1) {
    const name = `pic${i}.png`;
    fs.writeFileSync(
      path.join(dir, name),
      Buffer.alloc(Math.round(mb * 1024 * 1024), 7),
    );
    list.push({ file: name, alt: `Picture ${i}` });
  }
  const file = path.join(dir, "figures.json");
  fs.writeFileSync(file, JSON.stringify(list));
  return file;
}

/** A server that answers however the test says, and records the size of each request it was sent. */
function serve(answer) {
  const sizes = [];
  const server = http.createServer((req, res) => {
    let bytes = 0;
    req.on("data", (c) => {
      bytes += c.length;
    });
    req.on("end", () => {
      sizes.push(bytes);
      const { status, body } = answer(sizes.length);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, sizes, port: server.address().port }),
    );
  });
}

function run(file, port) {
  signIn(`http://127.0.0.1:${port}`);
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [
        path.join(import.meta.dirname, "images.mjs"),
        file,
        "--course",
        "c1",
        "--hub",
        `http://127.0.0.1:${port}`,
      ],
      {
        env: { ...process.env, PTY_MCP_TOKEN: "", XDG_CONFIG_HOME: configHome },
      },
      (_err, stdout, stderr) => resolve(`${stdout}\n${stderr}`),
    );
  });
}

// ── 1. Packing, which decides whether a course uploads at all.
{
  const file = figures(12, 1); // 12 MB in total: more than one request at the derived budget.
  const { server, sizes, port } = await serve(() => ({
    status: 200,
    body: { uploaded: [], failed: [] },
  }));
  await run(file, port);
  server.close();
  check(
    "A REQUEST WAS ACTUALLY SENT. `[].every(...)` is true, so every size assertion below passes on a run that sent nothing at all: one bad credential and the whole packing check goes quietly green.",
    sizes.length > 0,
    true,
  );
  check(
    `NO REQUEST BODY REACHES THE HUB'S MEASURED LIMIT. A body of ${HUB_BODY_LIMIT_BYTES} bytes arrives whole and one ten bytes larger does not, so this asserts the thing that actually refuses rather than a number somebody picked.`,
    sizes.every((n) => n < HUB_BODY_LIMIT_BYTES),
    true,
  );
  /*
   * AND THE ALLOWANCE COVERS WHAT IT IS AN ALLOWANCE FOR. The budget above is the measured limit MINUS
   * this, so if the framing ever outgrew it, every picture would be inside budget and the body would
   * still cross the limit -- which is the failure this whole file exists to prevent, arriving silently.
   */
  const framing = sizes.reduce((sum, n) => sum + n, 0) - 12 * 1024 * 1024;
  check(
    `THE FRAMING ALLOWANCE IS ENOUGH FOR THE FRAMING. Measured here: ${framing} bytes over ${sizes.length} requests, against ${FRAMING_ALLOWANCE_BYTES} allowed EACH.`,
    framing <= FRAMING_ALLOWANCE_BYTES * sizes.length,
    true,
  );
  check(
    "and 12 MB of pictures is therefore more than one request",
    sizes.length > 1,
    true,
  );
}

// ── 2. A refusal that names each file.
{
  const file = figures(2, 0.01);
  const { server, port } = await serve(() => ({
    status: 422,
    body: {
      uploaded: [],
      failed: [
        { name: "pic1.png", error: "not an image this route accepts" },
        { name: "pic2.png", error: "larger than 5 MB" },
      ],
    },
  }));
  const out = await run(file, port);
  server.close();
  check(
    "A 422 CARRYING A REASON PER FILE KEEPS THAT REASON. Testing `!response.ok` first replaced both with the status code, so the operator could not tell which picture was at fault.",
    [
      out.includes("not an image this route accepts"),
      out.includes("larger than 5 MB"),
    ],
    [true, true],
  );
  check(
    "and every file gets exactly one verdict, its own. Asserting the ABSENCE of the status code passes on empty output too, which is the same vacuum as above.",
    [
      (out.match(/FAILED\s+pic1\.png/g) ?? []).length,
      (out.match(/FAILED\s+pic2\.png/g) ?? []).length,
      out.includes("2 failed"),
    ],
    [1, 1, true],
  );
}

// ── 2b. A name the answer spells differently.
{
  const file = figures(2, 0.01);
  const { server, port } = await serve(() => ({
    status: 207,
    body: { uploaded: [], failed: [{ name: "./pic1.png", error: "not an image" }] },
  }));
  const out = await run(file, port);
  server.close();
  check(
    "A FILE THE ANSWER NAMES DIFFERENTLY IS STILL COUNTED ONCE. Pushing the server's rows wholesale and then adding the unmentioned ones counted `pic1.png` twice, made `failed` longer than the batch, and turned the one line whose job is to prove the run added up into `BUG: -1 figures unaccounted for`.",
    [(out.match(/FAILED/g) ?? []).length, out.includes("2 failed"), out.includes("BUG")],
    [2, true, false],
  );
  check(
    "and the name it volunteered but was never sent is reported rather than swallowed",
    out.includes('answered about "./pic1.png", which it was not sent'),
    true,
  );
}

// ── 2c. A 200 that answers about nothing.
{
  const file = figures(1, 0.01);
  const { server, port } = await serve(() => ({ status: 200, body: { ok: true } }));
  const out = await run(file, port);
  server.close();
  check(
    "A 200 CARRYING NO ARRAYS STILL NAMES THE REQUEST. It marks every file failed, and hiding the line behind `!response.ok` alone left the operator a batch of failures with no request to attribute them to.",
    [out.includes("request 1 of 1 failed: 200"), out.includes("1 failed")],
    [true, true],
  );
}

// ── 2d. A refusal that stops the run.
{
  const file = figures(6, 2); // more than one batch at 8 MB
  const { server, sizes, port } = await serve(() => ({ status: 401, body: { error: "no" } }));
  const out = await run(file, port);
  server.close();
  check(
    "A DELIBERATE STOP IS NOT AN UNACCOUNTED FILE. The run stops because every remaining batch would be refused identically, and the batches never sent are named — otherwise the count reports them as figures that vanished and prints BUG at somebody who did nothing wrong.",
    [sizes.length, out.includes("not attempted: the run stopped after request 1"), out.includes("BUG")],
    [1, true, false],
  );
}

// ── 3. A refusal that names nothing is still a loss of everything in it.
{
  const file = figures(2, 0.01);
  const { server, port } = await serve(() => ({
    status: 500,
    body: { error: "boom" },
  }));
  const out = await run(file, port);
  server.close();
  check(
    "A 500 CARRYING NO ARRAYS IS A LOSS OF THE WHOLE BATCH. Appending nothing would report fewer pictures than were given, with not one failure named.",
    out.includes("2 failed"),
    true,
  );
}

// ── 4. Silence about one declared file is a loss of that file.
{
  const file = figures(2, 0.01);
  const { server, port } = await serve(() => ({
    status: 200,
    body: {
      uploaded: [
        {
          name: "pic1.png",
          key: "a".repeat(48),
          markdown: "![Picture 1](" + "a".repeat(48) + ")",
          bytes: 10,
        },
      ],
      failed: [],
    },
  }));
  const out = await run(file, port);
  server.close();
  check(
    "A FILE THE ANSWER NEVER MENTIONS IS COUNTED AS FAILED. It was declared and sent; silence about it is not success, and the old count would simply not add up.",
    out.includes("without naming this file"),
    true,
  );
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${ran - failed}/${ran} passed`);
process.exit(failed === 0 ? 0 : 1);
