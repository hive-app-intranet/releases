#!/usr/bin/env node
// Read-only — doesn't touch git, doesn't build, doesn't prompt. Just
// answers "what would the next version be" for each bump level, so you can
// decide the right one yourself and write the matching CHANGELOG.md
// heading by hand before ever running: node .github/scripts/publish.mjs

import kleur from 'kleur';
import { getLatestReleasedVersion, bumpVersion, getPendingUnreleasedLines } from './release-config.mjs';

console.log(kleur.bold('\nHIVE next version\n'));

const pendingLines = getPendingUnreleasedLines();
if (pendingLines.length > 0) {
  console.log(kleur.red('✖ CHANGELOG.md still has pending entries under "## [Unreleased]":'));
  for (const line of pendingLines) console.log(kleur.dim(`    ${line}`));
  console.log('');
  console.log('  Move them into a proper version heading yourself before checking the next version.');
  console.log('');
  process.exit(1);
}

const latestReleasedVersion = getLatestReleasedVersion();
const currentVersion = latestReleasedVersion ?? '0.0.0';
const today = new Date().toISOString().slice(0, 10);

console.log(`  Current version (latest tag): ${kleur.cyan(currentVersion)}`);
console.log(`  Today:                        ${kleur.cyan(today)}`);
console.log('');
console.log(kleur.bold('  Next version by level:'));
console.log(`    ${kleur.bold('patch')}    ${kleur.cyan(bumpVersion(currentVersion, 'patch'))}   bug fix, no behavior/contract change`);
console.log(`    ${kleur.bold('minor')}    ${kleur.cyan(bumpVersion(currentVersion, 'minor'))}   new feature, backwards compatible`);
console.log(`    ${kleur.bold('major')}    ${kleur.cyan(bumpVersion(currentVersion, 'major'))}   breaking change (contract, migration, config)`);
console.log('');
console.log('  Pick one and write it in CHANGELOG.md, e.g.:');
console.log('');
console.log(kleur.dim(`    ## [${bumpVersion(currentVersion, 'minor')}] - ${today}`));
console.log('');
console.log(kleur.dim('    ### Added'));
console.log(kleur.dim('    - ...'));
console.log('');
