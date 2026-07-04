#!/usr/bin/env node
/**
 * Mobile layout invariant check for the chat UI.
 *
 * Drives the Playwright CLI wrapper against a running dev server and asserts:
 *  - the composer is fully inside the viewport,
 *  - the transcript does not overlap the composer,
 *  - the last message is reachable at the bottom of the transcript.
 *
 * Usage:
 *   node scripts/check-layout-invariants.mjs [url]
 *   URL env / first arg default: http://localhost:5173/
 *
 * Requires npx (the wrapper uses `npx --package @playwright/cli playwright-cli`).
 */
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const url = process.argv[2] || process.env.APP_URL || "http://localhost:5173/";
const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
const pwcli = join(codexHome, "skills", "playwright", "scripts", "playwright_cli.sh");

const MOBILE_WIDTH = 390;
const MOBILE_HEIGHT = 844;
const SENTINEL = "INVARIANTS";

function run(args) {
  const result = spawnSync("bash", [pwcli, ...args], { encoding: "utf8" });
  if (result.error) {
    console.error(`Failed to run playwright-cli: ${result.error.message}`);
    process.exit(2);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

// Scroll to the bottom, wait for late image reflow, re-pin, then measure.
const evalExpr = `(async () => {
  const t = document.querySelector('.transcript');
  const region = document.querySelector('.composer-region');
  if (!t || !region) return '${SENTINEL} ' + JSON.stringify({ error: 'missing elements' });
  t.scrollTop = t.scrollHeight + 4000;
  await new Promise((r) => setTimeout(r, 700));
  t.scrollTop = t.scrollHeight + 4000;
  const vh = window.innerHeight;
  const cr = region.getBoundingClientRect();
  const tr = t.getBoundingClientRect();
  const msgs = document.querySelectorAll('.transcript-content > *');
  const last = msgs[msgs.length - 1];
  const lr = last ? last.getBoundingClientRect() : { top: 0, bottom: 0 };
  const inv = {
    composerInViewport: cr.top >= -0.5 && cr.bottom <= vh + 0.5,
    noOverlap: cr.top >= tr.bottom - 0.5,
    lastMsgVisible: !last || (lr.bottom <= tr.bottom + 0.5 && lr.bottom > tr.top),
  };
  return '${SENTINEL} ' + JSON.stringify(inv);
})()`;

run(["resize", String(MOBILE_WIDTH), String(MOBILE_HEIGHT)]);
run(["open", url]);
const out = run(["eval", evalExpr]);

const line = out.split("\n").find((l) => l.includes(SENTINEL));
if (!line) {
  console.error("Could not read invariants from page output:\n" + out);
  process.exit(2);
}

// The CLI prints the eval result JSON-encoded, so inner quotes arrive escaped.
const jsonSlice = line.slice(line.indexOf("{"), line.lastIndexOf("}") + 1).replace(/\\"/g, '"');
let parsed;
try {
  parsed = JSON.parse(jsonSlice);
} catch (err) {
  console.error("Failed to parse invariants: " + err.message + "\n" + line);
  process.exit(2);
}

if (parsed.error) {
  console.error("Invariant check error: " + parsed.error);
  process.exit(2);
}

const failed = Object.entries(parsed).filter(([, ok]) => !ok);
for (const [name, ok] of Object.entries(parsed)) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} layout invariant(s) failed.`);
  process.exit(1);
}
console.log("\nAll mobile layout invariants hold.");
