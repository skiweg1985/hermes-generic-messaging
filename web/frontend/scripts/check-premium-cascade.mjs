#!/usr/bin/env node
/**
 * Guard against accidental premium.css cascade regressions.
 *
 * premium.css is intentionally loaded last, but that makes later rules in the
 * same file dangerous. Critical user-owned message selectors must be finalized
 * in the last "User ownership hardening" block, and no later rule may override
 * them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const cssPath = resolve("src/styles/premium.css");
const css = readFileSync(cssPath, "utf8");
const marker = "User ownership hardening";
const markerIndex = css.lastIndexOf(marker);

if (markerIndex < 0) {
  fail(`Missing final \"${marker}\" block in ${cssPath}.`);
}

const afterMarker = css.slice(markerIndex);
const mobileDockMarker = "Mobile composer glass dock";
const mobileDockIndex = css.lastIndexOf(mobileDockMarker);
const mobileDockBlock = mobileDockIndex >= 0 ? css.slice(mobileDockIndex, markerIndex) : "";

const requiredFragments = [
  ".turn-user {",
  "width: 100%;",
  ".turn-user .message-action-surface",
  ".turn-user .msg-user-bubble",
  ".turn-user .audio-card .waveform",
  ".audio-card-user .waveform",
  "color-mix(in srgb, var(--surface-4) 92%",
];

const errors = [];
for (const fragment of requiredFragments) {
  if (!afterMarker.includes(fragment)) {
    errors.push(`Final user hardening block is missing required fragment: ${fragment}`);
  }
}

const mobileDockFragments = [
  ".transcript-jump,",
  ".transcript-toast {",
  "bottom: calc(var(--composer-clearance, 96px) + 10px);",
];

if (mobileDockIndex < 0) {
  errors.push(`Missing \"${mobileDockMarker}\" block in ${cssPath}.`);
} else {
  for (const fragment of mobileDockFragments) {
    if (!mobileDockBlock.includes(fragment)) {
      errors.push(`Mobile composer dock block is missing required fragment: ${fragment}`);
    }
  }
}

const criticalSelectors = [
  ".turn-user",
  ".turn-user-row",
  ".msg-user-bubble",
  ".message-action-surface-right",
  ".audio-card-user",
  ".audio-card-right",
];

for (const selector of criticalSelectors) {
  const lastIndex = css.lastIndexOf(selector);
  if (lastIndex >= 0 && lastIndex < markerIndex) {
    errors.push(
      `Last occurrence of ${selector} is before the final user hardening block; ` +
        "a later premium.css rule may override user-owned layout.",
    );
  }
}

const nextSectionIndex = css.indexOf("/* ──", markerIndex + marker.length);
if (nextSectionIndex >= 0) {
  errors.push("Another premium.css section starts after the final user hardening block.");
}

const lastNonWhitespace = css.trimEnd();
if (!lastNonWhitespace.endsWith("}\n") && !lastNonWhitespace.endsWith("}")) {
  errors.push("premium.css does not end cleanly after the final cascade block.");
}

if (errors.length > 0) fail(errors.join("\n"));

console.log("PASS  premium.css final user/audio cascade guard");

function fail(message) {
  console.error(`FAIL  premium.css cascade guard\n${message}`);
  process.exit(1);
}
