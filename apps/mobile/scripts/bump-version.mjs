#!/usr/bin/env node
/**
 * Bumps `expo.version` in app.json — the user-facing version *name*.
 *
 * Why a script: the name is the one release number nothing bumps on its own.
 * EAS increments the Android versionCode on every build (`autoIncrement`, with
 * the counter held remotely), so codes 3, 4 and 5 all shipped as "1.0.0" — three
 * releases the update check could not tell apart. Running this before each build
 * keeps the two in step.
 *
 * The rule is an odometer: each segment runs 0-9 and carries into the one to its
 * left.
 *
 *     1.0.0 → 1.0.1 → … → 1.0.9 → 1.1.0 → … → 1.9.9 → 2.0.0
 *
 * Usage (from apps/mobile):
 *     pnpm version:bump              # 1.0.0 → 1.0.1
 *     pnpm version:bump --minor      # 1.0.4 → 1.1.0
 *     pnpm version:bump --major      # 1.4.4 → 2.0.0
 *     pnpm version:bump --set 2.0.0  # exact value, still validated
 *     pnpm version:bump --dry-run    # print, change nothing
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_JSON = join(dirname(fileURLToPath(import.meta.url)), '..', 'app.json');

/** Highest value a segment may hold before it carries. */
const MAX_SEGMENT = 9;

export function parseVersion(version) {
  const parts = String(version).trim().split('.');
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) {
    throw new Error(`Expected a three-part numeric version like 1.0.0, got "${version}"`);
  }
  return parts.map(Number);
}

/**
 * Applies the odometer.
 *
 * A segment already above 9 (hand-edited at some point) still carries rather
 * than climbing to 1.0.13 — the point of the rule is that no segment ever shows
 * two digits.
 */
export function bumpVersion(version, level = 'patch') {
  let [major, minor, patch] = parseVersion(version);

  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') {
    minor += 1;
    if (minor > MAX_SEGMENT) return `${major + 1}.0.0`;
    return `${major}.${minor}.0`;
  }

  patch += 1;
  if (patch <= MAX_SEGMENT) return `${major}.${minor}.${patch}`;

  patch = 0;
  minor += 1;
  if (minor <= MAX_SEGMENT) return `${major}.${minor}.0`;

  return `${major + 1}.0.0`;
}

function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const setIndex = argv.indexOf('--set');
  const level = argv.includes('--major') ? 'major' : argv.includes('--minor') ? 'minor' : 'patch';

  const raw = readFileSync(APP_JSON, 'utf8');
  const config = JSON.parse(raw);
  const current = config.expo?.version;
  if (!current) throw new Error('app.json has no expo.version');

  let next;
  if (setIndex !== -1) {
    next = argv[setIndex + 1];
    parseVersion(next); // validate shape
    if (parseVersion(next).some((n) => n > MAX_SEGMENT)) {
      throw new Error(`"${next}" has a segment above ${MAX_SEGMENT} — that breaks the odometer rule`);
    }
  } else {
    next = bumpVersion(current, level);
  }

  console.log(`app.json expo.version: ${current} → ${next}`);

  if (dryRun) {
    console.log('(--dry-run: nothing written)');
    return;
  }

  config.expo.version = next;
  // app.json is 2-space JSON with a trailing newline; keep it byte-comparable
  // so the diff is one line.
  writeFileSync(APP_JSON, `${JSON.stringify(config, null, 2)}\n`);

  console.log('');
  console.log('Next: build, submit, then point the API at this release:');
  console.log(`  MOBILE_ANDROID_LATEST_VERSION=${next}`);
  console.log('  MOBILE_ANDROID_LATEST_BUILD=$(eas build:version:get --platform android)');
}

// Only run when invoked directly, so the pure functions above stay importable.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`bump-version: ${err.message}`);
    process.exit(1);
  }
}
