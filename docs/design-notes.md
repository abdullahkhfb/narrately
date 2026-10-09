# Design notes

Why the code looks the way it does. Most of these decisions exist because a
browser restriction made the obvious approach fail. Read the relevant note before
"simplifying" something.

## Decisions and the problems behind them

| Decision | Problem it solves |
| --- | --- |
| Content and background scripts are built as **self-contained IIFE** bundles (`scripts/build-ts.mjs`) | Manifest content scripts are classic scripts. ES-module output with shared chunks throws `SyntaxError` the moment the browser injects `content.js` |
| A hidden **extension-origin iframe** (`host.html` + `host.ts`) owns the inference worker, the Rust core and the audio cache | Content scripts run with the page's origin and cannot construct `new Worker(chrome-extension://…)` (`SecurityError`); an IndexedDB cache in the page origin would also not be shared across sites. Audio `ArrayBuffer`s are transferred back zero-copy |
| Debug reports are stored locally and capped at 100 records | Browser extensions cannot read arbitrary DevTools output; Narrately captures its own uncaught errors and console warnings/errors in each extension context |
| Inference runs in a separate worker, not the background | Model loading and long generation are not tied to the MV3 background event lifetime |
| **Neutral manifest, per-browser derivation** (`scripts/manifest.mjs`) | Chrome rejects `background.scripts` in MV3; Firefox does not run `background.service_worker` |
| Beta number becomes the 4th version component, name goes in `version_name` | Browsers accept only numeric versions |
| `rustCore.ts` passes the absolute extension URL of the `.wasm` to `init()` | The generated glue defaults to `new URL(…, import.meta.url)`, unusable in a classic content script |
| `extensionUrl()` helper instead of `webextension-polyfill` in worker and host | The polyfill throws outside a normal extension API context ("should only be loaded in a browser extension") |
| `kokoro-js` is a **static** import in the worker | Vite's dynamic-import preload helper needs `document`, which workers lack |
| ONNX Runtime loader and WASM bundled with `?url`, `env.useWasmCache = false` | transformers.js defaults to a CDN URL (blocked by the guard); blob-URL factories would violate the extension CSP |
| The fetch guard patches both `globalThis.fetch` and `env.fetch` | transformers.js binds its own fetch at import time |
| Downloads use a local `<a download>` click in the panel | `browser.downloads` is not exposed to content scripts, and an `ArrayBuffer` sent through `runtime.sendMessage` arrives empty in Chrome. The `downloads` permission is not requested |
| Worker errors always carry the `jobId` | Without it the host could never settle the pending request |
| `crypto.randomUUID()` with a fallback generator | It is undefined on plain `http://` pages |
| Model files cached under a synthetic `https://narrately.invalid/…` key | The Cache API rejects `chrome-extension://` keys |
| Model files are stored only **after** verification | A partial or corrupt download is never served |
| `wasm-pack --out-dir ../../src/wasm/pkg` | `wasm-pack` resolves the path relative to the crate, not the repo root |
| Real wasm-pack type bindings are checked in (`narrately_core.d.ts`) | A hand-written stub once masked real type errors |
| Whole chapter is prepared before playback | Streaming playback was tried during development and reverted; preparation continues in the background if the panel is closed |
| Late-render observer on the content script (800 ms debounce, 60 s limit) | Reader sites often render chapters after load |
| Per-site **adapters** behind one `SiteAdapter` interface (`src/content/sites/`) | New sites are added as one file plus a registry line; the panel and narration pipeline only see `Book` and `Chapter` |
| Panel lives in a **Shadow DOM** | Page styles cannot leak in, ours cannot leak out |

## Security posture

- No telemetry, no analytics, no remote text processing.
- Permissions: `storage`, `unlimitedStorage`, `clipboardWrite` (for copying
  debug reports), and Hugging Face host permissions used only by the model
  download. No `downloads`, `activeTab` or `<all_urls>`.
- Extension-page CSP: `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`.
- The inference worker blocks every `http(s)` request that is not a cached model
  file. An unexpected dependency request therefore fails loudly instead of leaking.
- `host.html` is web-accessible to `http(s)` pages (needed for the iframe). Host
  and content check `event.source` against the expected window and validate
  message `type` before acting.
- Dependencies are pinned exactly and `npm audit` is expected to report zero
  vulnerabilities. `@huggingface/transformers` is forced to one version for
  `kokoro-js` through an npm `override`.

## Known limits

- **Site support:** Lnori, Cyrisia and Novel Archive have dedicated adapters.
  Cyrisia renders its book in frames; the adapter reads same-origin frame
  content where available. It reads a snapshot of sections present when the
  panel mounts. Other sites go through the generic fallback, which is
  best-effort: it yields a single chapter, can choose the wrong element, and is
  not tested against real sites.
  To officially support another site, add a dedicated adapter under
  `src/content/sites/`; see [Adding a supported site](adding-a-site.md).

- Inside a web page the extension frame cannot be cross-origin isolated, so the
  WASM engine runs on one CPU thread.
- Cancellation granularity is one chunk.
- The audio cache has no eviction policy and is keyed without model or device.
- Output format is WAV only (`OutputFormat = 'wav'`).
- Firefox shows the numeric version only; `version_name` is Chrome-only.
- The Firefox `gecko.id` is a placeholder (not needed while distribution is GitHub-only).
- Beta builds are not store-listed; Firefox builds are unsigned and load only as temporary add-ons.
- `validate_voice_embedding` and the `local_embedding` voice kind are
  scaffolding for future work and are not wired into the UI.
- Debug stores up to 100 captured Narrately warnings/errors in
  `browser.storage.local`. The browser does not expose unrelated DevTools
  console output to extensions.

## Future extension points

- Local speaker encoder for reference-audio cloning (via `local_embedding`).
- More Kokoro languages and voices.
- Chapter-aware pronunciation dictionaries.
- EPUB import.
- Reader progress sync through local storage only.
- An optional native desktop accelerator using the same Rust crate.
