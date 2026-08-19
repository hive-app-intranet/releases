// Shared between next-version.mjs and publish.mjs — one place for anything
// those scripts would otherwise each duplicate.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Two levels up: .github/scripts/ -> .github/ -> repo root.
export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const changelogPath = path.join(rootDir, 'CHANGELOG.md');
export const buildDir = path.join(rootDir, 'build');

function run(cmd) {
  return execSync(cmd, { cwd: rootDir, encoding: 'utf-8' }).trim();
}

// The source of truth for "what's actually released" is origin, not this
// local clone — a local tag can exist without ever having been pushed
// (leftover from an aborted attempt, a rebase, whatever), and trusting it
// would either hide a real published version or, worse, block a publish
// that was never actually shipped. `git ls-remote` always hits the network,
// so this is never stale local state.
function listRemoteTags() {
  const output = run('git ls-remote --tags origin');
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, ref] = line.split('\t');
      return { sha, tag: ref.split('refs/tags/')[1] };
    })
    // Annotated tags list twice, the second entry pointing at the tag
    // object itself (suffixed "^{}") — same tag name, skip the duplicate.
    .filter(({ tag }) => tag && !tag.endsWith('^{}'));
}

function sortByVersionDescending(entries, getVersion) {
  return [...entries].sort((a, b) => {
    const [aMajor, aMinor, aPatch] = getVersion(a).split('.').map(Number);
    const [bMajor, bMinor, bPatch] = getVersion(b).split('.').map(Number);
    return bMajor - aMajor || bMinor - aMinor || bPatch - aPatch;
  });
}

// `null` means nothing's been published yet.
export function getLatestReleasedVersion() {
  const versions = sortByVersionDescending(
    listRemoteTags()
      .filter(({ tag }) => /^v\d+\.\d+\.\d+$/.test(tag))
      .map(({ tag }) => tag.slice(1)),
    (v) => v
  );
  return versions[0] ?? null;
}

// The commit sha the latest release tag points at — used as the parent of
// the next release's own commit (see publish.mjs), purely so `git log` on
// a release tag shows a lineage across versions. `null` means nothing's
// been published yet (the next release's commit has no parent, same as
// any repo's very first commit).
export function getLatestReleasedTagCommit() {
  const tags = sortByVersionDescending(
    listRemoteTags().filter(({ tag }) => /^v\d+\.\d+\.\d+$/.test(tag)),
    ({ tag }) => tag.slice(1)
  );
  return tags[0]?.sha ?? null;
}

// Whether v<version> already exists as a tag on origin — the one thing
// that has to be false before tagging+pushing a new release.
export function versionAlreadyReleased(version) {
  return listRemoteTags().some(({ tag }) => tag === `v${version}`);
}

export function bumpVersion(current, kind) {
  const [major, minor, patch] = current.split('.').map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// The one rule CHANGELOG.md has to follow: "## [Unreleased]" must be
// empty at publish time. Returns the pending lines (trimmed, blank ones
// dropped) — empty array means clean, safe to publish.
export function getPendingUnreleasedLines() {
  const raw = readFileSync(changelogPath, 'utf-8');
  const heading = '## [Unreleased]';
  const startIndex = raw.indexOf(heading);
  if (startIndex === -1) return [];

  const rest = raw.slice(startIndex + heading.length);
  const nextHeadingIndex = rest.indexOf('\n## ');
  const body = nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex);

  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

// The version to release is whatever's written at the top of
// CHANGELOG.md — not asked interactively. Returns null if there isn't one
// yet, which callers treat as "go write one first — see npm run
// next-version".
export function getTopChangelogVersion() {
  const raw = readFileSync(changelogPath, 'utf-8');
  const match = raw.match(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})/m);
  return match ? { version: match[1], date: match[2] } : null;
}

// The prose under one version's own heading — used as the GitHub release's
// notes, so it shows the same write-up that's already in CHANGELOG.md,
// without maintaining it twice.
export function getChangelogSection(version) {
  const raw = readFileSync(changelogPath, 'utf-8');
  const escapedVersion = version.replace(/\./g, '\\.');
  const match = raw.match(new RegExp(`^## \\[${escapedVersion}\\][^\n]*\n`, 'm'));
  if (!match) return null;

  const rest = raw.slice(match.index + match[0].length);
  const nextHeadingIndex = rest.indexOf('\n## ');
  const body = nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex);
  return body.trim();
}
