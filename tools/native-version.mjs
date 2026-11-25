#!/usr/bin/env node
// package.json "version" is the single source of truth for the native apps.
//
//   versionName / MARKETING_VERSION        = "1.14.10"
//   versionCode / CURRENT_PROJECT_VERSION  = major * 1_000_000 + minor * 1_000 + patch = 1014010
//
// The build number grows with every release (as long as minor and patch stay
// below 1000), so a store upload never reuses one.
//
// Android reads package.json itself in android/app/build.gradle (same formula).
// iOS can't, so this script writes the two version lines into project.pbxproj:
//
//   node tools/native-version.mjs          rewrite project.pbxproj from package.json
//   node tools/native-version.mjs --check  exit 1 when project.pbxproj is out of date (CI)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** "1.14.10" → 1014010. Throws on anything but plain MAJOR.MINOR.PATCH. */
export function buildNumber(version) {
    const m = SEMVER.exec(String(version));
    if (!m) {
        throw new Error(
            `package.json version "${version}" is not plain semver MAJOR.MINOR.PATCH ` +
                '(no pre-release or build tags) — the native build number is derived from it.',
        );
    }
    const [major, minor, patch] = m.slice(1).map(Number);
    if (minor > 999 || patch > 999) {
        throw new Error(`package.json version "${version}": minor and patch must stay below 1000.`);
    }
    return major * 1_000_000 + minor * 1_000 + patch;
}

const MARKETING = /^(\s*MARKETING_VERSION = )[^;]*;$/gm;
const BUILD = /^(\s*CURRENT_PROJECT_VERSION = )[^;]*;$/gm;

/** Rewrite only the MARKETING_VERSION / CURRENT_PROJECT_VERSION lines of a pbxproj. */
export function applyVersion(pbxproj, version) {
    const build = buildNumber(version);
    return pbxproj.replace(MARKETING, `$1${version};`).replace(BUILD, `$1${build};`);
}

function main(argv) {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const pkgPath = join(root, 'package.json');
    const pbxPath = join(root, 'ios/App/App.xcodeproj/project.pbxproj');

    const { version } = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const build = buildNumber(version);
    const before = readFileSync(pbxPath, 'utf8');

    if ((before.match(MARKETING) ?? []).length === 0 || (before.match(BUILD) ?? []).length === 0) {
        throw new Error(`${pbxPath}: no MARKETING_VERSION / CURRENT_PROJECT_VERSION lines found.`);
    }

    const after = applyVersion(before, version);

    if (argv.includes('--check')) {
        if (after !== before) {
            console.error(
                `iOS project version is out of date with package.json (${version} / ${build}).\n` +
                    'Run `corepack yarn native:version` and commit ios/App/App.xcodeproj/project.pbxproj.',
            );
            process.exit(1);
        }
        console.log(`Native versions match package.json: ${version} (${build}).`);
        return;
    }

    if (after !== before) writeFileSync(pbxPath, after);
    console.log(`iOS project.pbxproj → ${version} (${build})${after === before ? ', already up to date' : ''}.`);
    console.log('Android reads package.json at build time (android/app/build.gradle).');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    try {
        main(process.argv.slice(2));
    } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
    }
}
