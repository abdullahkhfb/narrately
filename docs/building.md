# Building and packaging

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run build:wasm` | `wasm-pack` builds `crates/narrately-core` into `src/wasm/pkg/` |
| `npm run build:ts` | Runs [`scripts/build-ts.mjs`](../scripts/build-ts.mjs) and writes `dist/` |
| `npm run build` | `build:wasm` then `build:ts` |
| `npm run sync-voices` | Copies the 11 curated voice packs from `kokoro-js` into `models/` |
| `npm run sync-model` | Same, plus downloads the pinned model (checksum-verified) for offline builds |
| `npm run package:chrome` | `prepare-assets` + `build` + copy `dist/` to `release/chrome` |
| `npm run package:firefox` | Same, to `release/firefox` with the Firefox manifest |
| `npm run zip` | Zips `release/<browser>` into `release/narrately-<version>-<browser>.zip` |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint:rust` | `cargo fmt --check` and `clippy -D warnings` |
| `npm run test:rust` | `cargo test --workspace` |
| `npm run smoke:model` | Offline synthesis test in Node (see [Testing](testing.md)) |

`wasm-pack` resolves `--out-dir` relative to the crate, which is why the script
targets `../../src/wasm/pkg`.

## Build pipeline

```mermaid
flowchart TD
    voices["sync-voices<br/>(prepare-assets)"] --> models[("models/.../voices/*.bin")]
    rust["crates/narrately-core"] -->|"wasm-pack build"| pkg["src/wasm/pkg<br/>JS glue + .wasm"]

    subgraph buildts["scripts/build-ts.mjs"]
        p1["Pass 1: background<br/>IIFE, empties dist/"]
        p2["Pass 2: content<br/>IIFE (bundles panel.html, panel.css, UI SVGs)"]
        p3["Pass 3: ES modules<br/>inference_worker, popup, debug, host<br/>then copies static assets"]
        p1 --> p2 --> p3
    end

    pkg --> buildts
    ts["src/**/*.ts + UI assets"] --> buildts
    manifest["manifest.json<br/>package.json version"] --> buildts
    models --> buildts
    buildts --> dist["dist/<br/>Chrome flavoured"]

    dist --> pkgchrome["package-extension.mjs<br/>--browser=chrome"]
    dist --> pkgff["package-extension.mjs<br/>--browser=firefox"]
    pkgchrome --> rchrome["release/chrome"]
    pkgff --> rff["release/firefox"]
    rchrome --> zip["zip-release.mjs"]
    rff --> zip
    zip --> zips["release/narrately-VERSION-chrome.zip<br/>release/narrately-VERSION-firefox.zip"]
```

### Why three passes

Manifest-declared content and background scripts are **classic scripts**, so
their bundles cannot contain `import`, `export` or `import.meta`. Each is built
alone as a self-contained IIFE with dynamic imports and raw UI assets (`panel.html?raw`,
`panel.css?inline`, `src/icons/ui/*.svg?raw`) inlined. The popup, the debug window,
the host page and the inference worker run in module-capable extension contexts
and share one code-splitting ES-module build.

The last pass copies the manifest, toolbar PNG icons (`src/icons/toolbar/`), the
`models/` folder and the compiled WASM package into `dist/`.

## `dist/` layout

```text
dist/
├── manifest.json
├── assets/                  hashed assets incl. the ONNX Runtime .wasm and popup/debug CSS
├── models/                  voice packs (+ model files if you ran sync-model)
└── src/
    ├── background.js        classic: Chrome service worker / Firefox event page
    ├── content.js           classic: content script (with panel.html, panel.css, UI SVGs inlined)
    ├── inference_worker.js  ES module worker (Kokoro inference)
    ├── host.js, inference/host.html   extension-origin bridge iframe
    ├── popup.js, debug.js, popup/     popup and debug window pages
    ├── chunks/              shared module chunks (worker, popup, debug, host only)
    ├── wasm/pkg/            compiled Rust core (glue JS + .wasm)
    └── icons/toolbar/       toolbar PNG icons (16, 48, 128)
```

The ONNX Runtime WebAssembly binary ships as a Vite asset inside `dist/assets/`.
transformers.js resolves it relative to its own module URL, which stays on the
extension origin, so no CDN fetch ever happens and the local-only fetch guard
stays intact.

## Per-browser manifests

`manifest.json` is browser-neutral. `manifestFor(base, target, version)` in
[`scripts/manifest.mjs`](../scripts/manifest.mjs) adapts it.

```mermaid
flowchart LR
    base["manifest.json<br/>background.service_worker"] --> fn{"manifestFor(target)"}
    ver["package.json version"] --> fn
    fn -->|chrome| c["version + version_name<br/>background.service_worker<br/>minimum_chrome_version 121"]
    fn -->|firefox| f["version only<br/>background.scripts<br/>Desktop Firefox 140+<br/>data_collection_permissions: none"]
```

- Chrome rejects `background.scripts` in MV3; Firefox does not run `background.service_worker`.
- Browsers accept only numeric `version`. `0.1.0-beta.5` becomes version `0.1.0.5`
  and `version_name` `0.1.0-beta.5` (Chrome shows it; Firefox drops the key).
  See [Releasing](releasing.md#version-mapping).
- The Firefox `gecko.id` in `manifest.mjs` is
  `narrately@github.io`. Use this exact ID for the AMO listing and
  keep it unchanged for future updates.
- Firefox declares `data_collection_permissions.required: ["none"]` because
  the extension does not collect or transmit user data; model files are fetched
  from Hugging Face, while page text and narration are processed locally.
- The Firefox manifest sets `gecko_android.strict_min_version` to an unreachable
  value so the add-on is treated as incompatible with Firefox for Android.
- Firefox 140 is the minimum version, matching support for
  `data_collection_permissions`.

## Distribution

Narrately is in beta and is distributed through GitHub Releases. Firefox Add-ons
publishing still needs to be configured.

- **Chrome:** users unzip `narrately-<version>-chrome.zip` and use *Load unpacked*.
- **Firefox:** users unzip `narrately-<version>-firefox.zip` and load `manifest.json`
  as a temporary add-on. The build is unsigned, so Firefox removes it on restart.

Source maps are excluded from the zips. Re-run the [automated checks](testing.md#automated-checks)
and the manual checklist on a clean browser profile before cutting a release.
