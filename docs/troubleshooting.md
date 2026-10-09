# Troubleshooting

## Build problems

| Symptom | Likely cause and fix |
| --- | --- |
| `Cannot find module '../wasm/pkg/narrately_core.js'` during `build:ts` | Run `npm run build:wasm` first (needs Rust and the wasm32 target) |
| `cargo: command not found` | Rust was installed with rustup but the shell `PATH` is stale: `source "$HOME/.cargo/env"` |
| `wasm-pack` cannot find the target | `rustup target add wasm32-unknown-unknown` |
| `Missing Kokoro voice asset: node_modules/kokoro-js/voices/…` | `npm install` did not finish; reinstall |
| `Checksum mismatch for onnx/model_quantized.onnx` | Corrupted download. Delete `models/onnx-community/Kokoro-82M-ONNX/` and run `npm run sync-model` again |
| `Unsupported version "…". Use X.Y.Z or X.Y.Z-beta.N.` | `package.json` version (or the release tag) is not in the accepted format; see [Releasing](releasing.md#version-mapping) |
| `zip: command not found` in `npm run zip` | Install the system `zip` tool |
| Release workflow fails at the first job with a tag error | The tag must look like `v1.2.3` or `v1.2.3-beta.4` |

## Runtime problems

| Symptom | Likely cause and fix |
| --- | --- |
| Panel never appears | The page may not have enough readable text, or its site may not be supported. Test a supported [sample page](testing.md#prepare-a-test-page) and check the extension's *Errors* page |
| Popup says "Narrately cannot run here" | The tab has no content script (browser-internal page, or the tab was open before the extension loaded). Reload the page |
| Popup says "No readable chapter text found on this page" | The detector found nothing to narrate (expected on unsupported sites); see [chapter detection](architecture.md#chapter-detection) |
| Generate is disabled | The voice model is not installed. Use **Download model** in the panel |
| Model download ends with "Checksum mismatch… discarded" | Corrupt transfer; retry. Nothing was stored |
| Generate fails with `Blocked remote inference request` | A dependency tried to reach the network. The guard is working: inspect the URL in the message and report it |
| First generation is slow | Expected. The model loads into an ONNX Runtime session once per page; later runs reuse it and the chunk cache |
| Replaying a chapter is not instant | Cache is turned off in settings, or the voice or speed changed (both are part of the cache key) |
| Switching to WebGPU asks for another download | WebGPU uses a separate full-precision model (about 312 MB) |
| Firefox unloads the add-on after a restart | Temporary add-ons are session-scoped. Reload via `about:debugging`. Beta builds are unsigned, so they cannot be installed permanently |

## Reading errors in the right place

- **Debug button:** automatically collects Narrately's uncaught errors and
  console warnings/errors from its content, popup, background, inference host,
  and worker contexts. Open Debug and select **Copy captured logs** to copy the
  report. It cannot read other extensions' logs or unrelated browser/page
  console messages.
- **Content script and panel:** the page's DevTools console.
- **Host page and inference worker:** Chrome, `chrome://extensions` then
  *Inspect views* or the Errors button; Firefox, `about:debugging` then **Inspect**.
- **Background:** the same extension inspector (service worker in Chrome, event
  page in Firefox).
