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
  MAX_ALT_CHARS,
  MAX_BATCH_FILES,
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

function figures(n, mb, altChars = 0) {
  const list = [];
  for (let i = 1; i <= n; i += 1) {
    const name = `pic${i}.png`;
    fs.writeFileSync(
      path.join(dir, name),
      Buffer.alloc(Math.round(mb * 1024 * 1024), 7),
    );
    const alt = `Picture ${i}`;
    list.push({ file: name, alt: altChars ? alt.padEnd(altChars, " x") : alt });
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
  check(
    "and 12 MB of pictures is therefore more than one request",
    sizes.length > 1,
    true,
  );
}

/*
 * ── 1b. THE WORST CASE THE FRAMING ALLOWANCE IS SIZED FOR, which is the half of the budget nothing else
 * exercises. The budget is the measured limit MINUS that allowance, so if the framing ever outgrew it
 * every picture would be inside budget and the body would still cross the limit -- the exact failure this
 * file exists to prevent, arriving silently. A full batch with every alt at the route's cap is as big as
 * the framing can legally get.
 *
 * MEASURED PER REQUEST. Summing and dividing by the count lets one fat request hide behind a thin one.
 */
{
  const perFile = Math.round(0.001 * 1024 * 1024);
  const file = figures(MAX_BATCH_FILES, 0.001, MAX_ALT_CHARS);
  const { server, sizes, port } = await serve(() => ({
    status: 200,
    body: { uploaded: [], failed: [] },
  }));
  await run(file, port);
  server.close();
  check(
    "THE WHOLE BATCH WENT IN ONE REQUEST, or the framing measured below is not the worst case at all",
    sizes.length,
    1,
  );
  const worst = Math.max(...sizes.map((n) => n - MAX_BATCH_FILES * perFile));
  check(
    `THE ALLOWANCE COVERS IT: ${MAX_BATCH_FILES} parts, every alt at the route's ${MAX_ALT_CHARS}-character cap, framing ${worst} bytes against ${FRAMING_ALLOWANCE_BYTES} allowed. Raise the alt cap or add a manifest field past this and it goes red here instead of on the hub.`,
    worst <= FRAMING_ALLOWANCE_BYTES,
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
    body: {
      uploaded: [],
      failed: [{ name: "./pic1.png", error: "not an image" }],
    },
  }));
  const out = await run(file, port);
  server.close();
  check(
    "A FILE THE ANSWER NAMES DIFFERENTLY IS STILL COUNTED ONCE. Pushing the server's rows wholesale and then adding the unmentioned ones counted `pic1.png` twice, made `failed` longer than the batch, and turned the one line whose job is to prove the run added up into `BUG: -1 figures unaccounted for`.",
    [
      (out.match(/FAILED/g) ?? []).length,
      out.includes("2 failed"),
      out.includes("BUG"),
    ],
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
  const { server, port } = await serve(() => ({
    status: 200,
    body: { ok: true },
  }));
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
  const file = figures(6, 2); // 12 MB: more than one batch at the derived budget
  const { server, sizes, port } = await serve(() => ({
    status: 401,
    body: { error: "no" },
  }));
  const out = await run(file, port);
  server.close();
  check(
    "A DELIBERATE STOP IS NOT AN UNACCOUNTED FILE. The run stops because every remaining batch would be refused identically, and the batches never sent are named — otherwise the count reports them as figures that vanished and prints BUG at somebody who did nothing wrong.",
    [
      sizes.length,
      out.includes("not attempted: the run stopped after request 1"),
      out.includes("BUG"),
    ],
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
