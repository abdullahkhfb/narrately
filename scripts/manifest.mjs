/**
 * @fileoverview Derives a per-browser manifest from the neutral source one.
 *
 * - Chrome rejects `background.scripts` in MV3, while Firefox does not run
 *   `background.service_worker`, so each target gets only its own key.
 * - Browsers only accept numeric `version` strings, so a pre-release such as
 *   `0.1.0-beta.2` becomes version `0.1.0.2` plus a human-readable
 *   `version_name` (Chrome shows it; Firefox does not support the key).
 */

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/;

/** Maps a package.json version to the manifest version fields. */
export function versionFields(packageVersion) {
  const match = SEMVER.exec(packageVersion);
  if (!match) {
    throw new Error(
      `Unsupported version "${packageVersion}". Use X.Y.Z or X.Y.Z-beta.N.`,
    );
  }
  const [, major, minor, patch, beta] = match;
  const base = `${major}.${minor}.${patch}`;
  return beta === undefined
    ? {version: base}
    : {version: `${base}.${beta}`, version_name: packageVersion};
}

/** Returns the manifest object adapted for `target` ('chrome' | 'firefox'). */
export function manifestFor(base, target, packageVersion) {
  const manifest = {...structuredClone(base), ...versionFields(packageVersion)};
  if (target === 'firefox') {
    delete manifest.version_name;
    manifest.background = {scripts: [manifest.background.service_worker]};
    delete manifest.minimum_chrome_version;
    manifest.browser_specific_settings = {
      gecko: {id: 'narrately@example.invalid', strict_min_version: '128.0'},
    };
  }
  return manifest;
}
