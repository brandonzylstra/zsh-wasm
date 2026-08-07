// Guard that runs automatically before `npm publish` (via the prepublishOnly
// script in package.json).
//
// Two things can go wrong when publishing this package by hand, and npm will
// happily do both without complaint:
//
//   1. Publishing before running the build at all, so the tarball is missing
//      the wasm binary or the loader.
//   2. Publishing after editing web/zsh-runtime.js but before re-running
//      `bin/build --out npm/`, so the published runtime is a version older
//      than the one in the repository.
//
// The second is the nastier one: everything is present, the publish succeeds,
// and the package silently ships stale JavaScript. This checks for both, plus
// the license files that have to travel with the binary.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(packageDirectory, '..');
const webDirectory = join(repositoryRoot, 'web');

const problems = [];

// Files the build produces. Each must exist and be non-empty.
const builtFiles = ['zsh.js', 'zsh.wasm', 'zsh-runtime.js', 'zsh-worker.js'];

// Files that carry the license notices for the six bundled codebases. Without
// these the published tarball fails to pass on notices it is obliged to.
const licenseFiles = ['LICENSE', 'THIRD_PARTY_LICENSES.md'];

for (const fileName of [...builtFiles, ...licenseFiles]) {
    const path = join(packageDirectory, fileName);
    if (!existsSync(path)) {
        problems.push(`missing: ${fileName}`);
    } else if (statSync(path).size === 0) {
        problems.push(`empty: ${fileName}`);
    }
}

// Anything under 500 KB is not a real build of this shell — most likely a
// truncated copy or a placeholder.
const wasmPath = join(packageDirectory, 'zsh.wasm');
if (existsSync(wasmPath)) {
    const kilobytes = Math.round(statSync(wasmPath).size / 1024);
    if (kilobytes < 500) {
        problems.push(`zsh.wasm is only ${kilobytes} KB — that is not a complete build`);
    }
}

// Staleness check: the two hand-written runtime files live in web/ and are
// copied here by the build. If the copies differ from their originals, this
// package is about to publish something older than the repository.
for (const fileName of ['zsh-runtime.js', 'zsh-worker.js']) {
    const staged = join(packageDirectory, fileName);
    const original = join(webDirectory, fileName);
    if (!existsSync(staged) || !existsSync(original)) continue;
    if (!readFileSync(staged).equals(readFileSync(original))) {
        problems.push(
            `stale: ${fileName} differs from web/${fileName} — ` +
            `re-run \`bin/build --out npm/\` before publishing`
        );
    }
}

// The license field must point at the file rather than name a license, because
// the published binary combines six differently-licensed codebases.
const manifest = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'));
if (manifest.license !== 'SEE LICENSE IN LICENSE') {
    problems.push(
        `package.json "license" is ${JSON.stringify(manifest.license)}; ` +
        `expected "SEE LICENSE IN LICENSE" (see LICENSE and THIRD_PARTY_LICENSES.md)`
    );
}

if (problems.length > 0) {
    console.error(`\nRefusing to publish ${manifest.name}@${manifest.version}:\n`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('');
    process.exit(1);
}

console.log(`${manifest.name}@${manifest.version}: build outputs and license files present.`);
