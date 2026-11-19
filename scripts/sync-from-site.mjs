#!/usr/bin/env node
// Re-copies kits-src/geo-skill-kit from the Red Center Studio site repo into skills/geo-audit,
// so the public repo and the site never drift. Zero dependencies.
//
// Usage: node scripts/sync-from-site.mjs <path-to-site-repo> [--check]
//   --check  Copy nothing. Exit 1 if skills/geo-audit differs from the site copy.

import {
  readdirSync, readFileSync, statSync, mkdirSync, rmSync, copyFileSync, existsSync, writeFileSync,
} from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const check = args.includes('--check');
const siteRepo = args.find((a) => !a.startsWith('--'));
if (!siteRepo) {
  console.error('Usage: node scripts/sync-from-site.mjs <path-to-site-repo> [--check]');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(siteRepo, 'kits-src', 'geo-skill-kit');
const dest = join(root, 'skills', 'geo-audit');

if (!existsSync(join(src, 'SKILL.md'))) {
  console.error(`No SKILL.md in ${src}. Is "${siteRepo}" the site repo root?`);
  process.exit(2);
}

function list(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...list(p, base));
    else out.push(relative(base, p).split('\\').join('/'));
  }
  return out.sort();
}

const srcFiles = list(src);
const destFiles = existsSync(dest) ? list(dest) : [];
const same = (a, b) => readFileSync(a).equals(readFileSync(b));

const diffs = [];
for (const f of srcFiles) {
  if (!destFiles.includes(f)) diffs.push(`new      ${f}`);
  else if (!same(join(src, f), join(dest, f))) diffs.push(`changed  ${f}`);
}
for (const f of destFiles) if (!srcFiles.includes(f)) diffs.push(`removed  ${f}`);

if (check) {
  if (diffs.length) {
    console.error('skills/geo-audit differs from the site copy:\n' + diffs.join('\n'));
    process.exit(1);
  }
  console.log('In sync.');
  process.exit(0);
}

if (!diffs.length) {
  console.log('Already in sync.');
} else {
  rmSync(dest, { recursive: true, force: true });
  for (const f of srcFiles) {
    mkdirSync(dirname(join(dest, f)), { recursive: true });
    copyFileSync(join(src, f), join(dest, f));
  }
  copyFileSync(join(src, 'LICENSE'), join(root, 'LICENSE'));
  console.log(diffs.join('\n'));
}

// Keep the plugin version equal to the version in the site's kits.json.
try {
  const kits = JSON.parse(readFileSync(resolve(siteRepo, 'kits-src', 'kits.json'), 'utf8')).kits;
  const kit = kits.find((k) => k.slug === 'geo-skill-kit');
  const pj = join(root, '.claude-plugin', 'plugin.json');
  const manifest = JSON.parse(readFileSync(pj, 'utf8'));
  if (kit && manifest.version !== kit.version) {
    manifest.version = kit.version;
    writeFileSync(pj, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`plugin.json version set to ${kit.version}. Add a CHANGELOG.md entry.`);
  }
} catch (e) {
  console.error('Could not read kits.json: ' + e.message);
}
