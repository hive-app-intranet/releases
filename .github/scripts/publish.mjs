#!/usr/bin/env node
// Run as:
//
//   node .github/scripts/publish.mjs
//
// The version is never an argument — it's whatever's written at
// CHANGELOG.md's own top heading, the single source of truth (see: node
// .github/scripts/next-version.mjs to help pick and write it). Then build
// from the sibling hive repo (`npm run build` there — see BUILD_PATH in its
// .env), and only then run this.
//
// Each release is an ISOLATED commit, built directly from build/'s
// contents via `git commit-tree` — it never touches `main`'s working tree
// or history at all. `main` stays forever just this repo's own
// housekeeping (README.md, CHANGELOG.md, LICENSE.md, .github/); nothing
// here ever runs `git commit`/`git checkout` against it, so there's no way
// for a publish to leave stray build files sitting in this repo's actual
// tracked working directory again.
//
// What this does, in order: verify CHANGELOG.md is clean and has a version
// heading, verify that version isn't already tagged on origin, verify
// build/ actually has something in it -> confirm once -> fill in
// <GIT_RELEASE_TAG> across build/'s own files -> stage build/'s contents
// into a throwaway index (GIT_INDEX_FILE, never the repo's real one) ->
// write that as a tree object -> commit-tree it, parented to the previous
// release's own commit if there is one (so `git log v<version>` shows a
// lineage across releases, even though none of this is ever on `main`) ->
// tag v<version> at that new commit -> push just the tag (never a branch)
// -> create the GitHub release (notes from CHANGELOG.md's own section).
//
// Installing a release is `git clone --branch v<version> --depth 1 ...`
// (see this repo's own README.md) — a tag, not `main`, is what actually
// has the product in it.
//
// Same tools/shape as the hive repo's own scripts/build.mjs (kleur +
// labeled steps) — one release toolchain, not a different style per repo.

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import kleur from 'kleur';
import {
  rootDir,
  buildDir,
  getPendingUnreleasedLines,
  getTopChangelogVersion,
  getChangelogSection,
  versionAlreadyReleased,
  getLatestReleasedTagCommit
} from './release-config.mjs';

function run(cmd, env) {
  return execSync(cmd, { cwd: rootDir, encoding: 'utf-8', env: env ? { ...process.env, ...env } : process.env }).trim();
}

function runInherit(cmd) {
  execSync(cmd, { cwd: rootDir, stdio: 'inherit' });
}

async function confirm(message) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${message} `);
  rl.close();
  return answer.trim().toLowerCase() === 'y';
}

// Same "label... ok/failed" shape as the hive repo's build.mjs.
async function step(label, fn) {
  process.stdout.write(`  ${label}... `);
  try {
    const result = await fn();
    console.log(kleur.green('ok'));
    return result;
  } catch (error) {
    console.log(kleur.red('failed'));
    console.error(kleur.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

// The hive repo's build has no idea what version it'll become (see its own
// build.mjs) — it ships README.md/package.json with a literal
// "<GIT_RELEASE_TAG>" placeholder instead. This is the one place that
// actually knows the real tag, so it's the one place that fills it in,
// mutating build/'s own files in place (harmless — hive's build.mjs wipes
// and regenerates that folder fresh on every run anyway, nothing here is
// meant to persist between publishes). Skips anything binary (images,
// fonts) since those can't contain the placeholder and aren't safe to
// read as utf-8.
const TEXT_EXTENSIONS = new Set(['.md', '.json', '.js', '.html', '.css', '.txt', '.yml', '.yaml']);

function replacePlaceholderInBuildDir(fullPath, tag) {
  if (statSync(fullPath).isDirectory()) {
    for (const entry of readdirSync(fullPath)) {
      replacePlaceholderInBuildDir(path.join(fullPath, entry), tag);
    }
    return;
  }

  if (!TEXT_EXTENSIONS.has(path.extname(fullPath))) return;

  const content = readFileSync(fullPath, 'utf-8');
  if (content.includes('<GIT_RELEASE_TAG>')) {
    writeFileSync(fullPath, content.replaceAll('<GIT_RELEASE_TAG>', tag));
  }
}

console.log(kleur.bold('\nHIVE publish\n'));

const pendingLines = getPendingUnreleasedLines();
if (pendingLines.length > 0) {
  console.log(kleur.red('✖ CHANGELOG.md still has pending entries under "## [Unreleased]":'));
  for (const line of pendingLines) console.log(kleur.dim(`    ${line}`));
  console.log(kleur.dim('\n  Move them into a proper version heading first — see: node .github/scripts/next-version.mjs\n'));
  process.exit(1);
}

const topEntry = getTopChangelogVersion();
if (!topEntry) {
  console.log(kleur.red('✖ CHANGELOG.md has no version heading yet.'));
  console.log(kleur.dim('  Write one at the top (below "## [Unreleased]") — see: node .github/scripts/next-version.mjs\n'));
  process.exit(1);
}
const { version } = topEntry;

if (versionAlreadyReleased(version)) {
  console.log(kleur.red(`✖ v${version} is already tagged on origin.\n`));
  process.exit(1);
}

if (!existsSync(buildDir) || readdirSync(buildDir).length === 0) {
  console.log(kleur.red('✖ build/ is empty — run "npm run build" from the hive repo first (see BUILD_PATH in its .env).\n'));
  process.exit(1);
}

console.log(`  Version:  ${kleur.bold(kleur.green(`v${version}`))}`);
console.log(`  From:     ${kleur.cyan('build/')}`);
console.log(`  main:     ${kleur.dim('untouched — this only ever creates an isolated tag')}`);
console.log('');

if (!(await confirm(kleur.bold(`Publish v${version} now? (y/N)`)))) {
  console.log(kleur.yellow('Cancelled.'));
  process.exit(0);
}
console.log('');

await step('Filling in <GIT_RELEASE_TAG> in build/', async () => {
  for (const entry of readdirSync(buildDir)) {
    replacePlaceholderInBuildDir(path.join(buildDir, entry), `v${version}`);
  }
});

const parentCommit = getLatestReleasedTagCommit();

const commitSha = await step('Building the release commit from build/', async () => {
  // A throwaway index file, not this repo's real one (.git/index, which is
  // main's) — --work-tree points `git add` at build/ instead of rootDir,
  // so what gets staged is exactly build/'s contents, nothing from main's
  // own working directory.
  const tmpIndex = path.join(os.tmpdir(), `hive-publish-index-${Date.now()}`);
  const env = { GIT_INDEX_FILE: tmpIndex };
  try {
    run(`git --work-tree="${buildDir}" add -A`, env);
    const tree = run('git write-tree', env);
    const parentFlag = parentCommit ? `-p ${parentCommit}` : '';
    return run(`git commit-tree ${tree} ${parentFlag} -m "Release v${version}"`);
  } finally {
    rmSync(tmpIndex, { force: true });
  }
});

await step(`Tagging v${version}`, async () => {
  // -f: versionAlreadyReleased() above already confirmed origin has no
  // such tag — a same-named *local* tag can still exist (leftover from an
  // earlier aborted attempt), and would otherwise make plain `git tag`
  // refuse to recreate it. Safe to force here specifically because origin
  // is what was actually checked, not this local ref.
  run(`git tag -f v${version} ${commitSha}`);
});

await step('Pushing the tag to origin', async () => run(`git push origin v${version}`));

await step('Creating the GitHub release', async () => {
  const notes = getChangelogSection(version) || `Release ${version}.`;
  const notesFile = path.join(os.tmpdir(), `hive-release-notes-${version}.tmp`);
  writeFileSync(notesFile, notes);
  try {
    // Requires the gh CLI, authenticated, run from inside this repo (gh
    // infers the repo from the current directory's git remote).
    runInherit(`gh release create v${version} --title v${version} --notes-file ${notesFile} --discussion-category "Q&A"`);
  } finally {
    rmSync(notesFile, { force: true });
  }
});

console.log(kleur.green(kleur.bold(`\n✔ Published v${version} — main was never touched\n`)));
