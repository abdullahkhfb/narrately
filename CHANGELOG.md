# Changelog

## 0.1.0-beta.5

- Fixed narration failing for the rest of the session after a WebGPU device loss (for example `Out of Memory`). The engine is now rebuilt on a fresh device and the failed chunk is retried once (`src/inference/kokoro.ts`).
- On WebGPU, Narrately now requests the high-performance adapter and logs which GPU was selected. `powerPreference` is no longer stripped on Firefox, only on Chromium for Windows (`src/shared/webgpu.ts`).
- Firefox manifest now marks the add-on incompatible with Firefox for Android (`gecko_android` in `scripts/manifest.mjs`); removed the related notes from the README and build docs.

## 0.1.0-beta.4

- Optimized the Rust chunking algorithm (`crates/narrately-core/src/chunker.rs` and `lib.rs`) with zero-copy `Cow<'_, str>` slice borrowing, denser sentence/word packing across paragraph boundaries, punctuation and quote grouping, and UTF-8 character-boundary splitting.
- Improved narration pipeline throughput (`src/core/rustCore.ts` and `src/core/narration.ts`) with synchronous WASM readiness checks, batched SHA-256 key generation (`cacheKeys`), upfront chunk deduplication, single-connection IndexedDB reuse per chapter, and single-pass WAV merging.
- Extracted each UI asset into its own dedicated file: added `src/content/panel.html`, `src/popup/debug.css`, `src/icons/ui/prev.svg`, and `src/icons/ui/next.svg`, replaced the inline `<svg>` in `src/popup/debug.html` with `src/icons/ui/logo.svg`, and removed unused `src/content.css`, `src/icons/ui/gear.svg`, and `src/icons/ui/minimize.svg`.
- Consolidated shared DOM, cached SVG prototype cloning, and storage meter/clear controllers into `src/shared/dom.ts` and `src/shared/storageView.ts`, and unified multi-part chapter merging (`mergeChapterPart`) in `src/content/sites/text.ts`.
- Reduced runtime memory footprint across contexts: lazily mount the hidden host `<iframe>` on first panel open, lazily spawn the inference `Worker` on warmup/synthesis, release raw PCM `ArrayBuffer` references in `panel.ts` once the `Blob` URL is created, and clear streamed model chunks before SHA-256 verification in `modelStore.ts`.
- Silenced the Chromium Windows WebGPU `requestAdapter()` `powerPreference` warning (`https://crbug.com/369219127`) via `src/shared/webgpu.ts` while preserving `powerPreference` on macOS and Linux.

## 0.1.0-beta.3

- Redesigned the in-page panel as a fixed-size card with chapter, voice, speed, text preview, and playback controls; text preview and Storage open as views within the card.
- Redesigned the toolbar popup as a single screen with **Narrate this page**, voice, speed, engine, remember-chapters, and storage summary; **Manage** opens storage actions.
- Added storage management for narrated audio and the voice model, with **Clear**, **Delete**, and **Clear everything** actions.
- Rebuilt the Debug window as a fixed-size window with color-coded logs, collapsed repeats, and **Copy logs** / **Clear** actions.
- Added new logo and toolbar icons, plus screenshots of the panel, popup, and Debug window.
- Improved WebGPU narration with shader warmup, queued chunks, batched cache reads, non-blocking cache writes, chunk de-duplication, byte-level WAV merging, and per-chunk timing.
- Added GitHub templates: question, blank issue, and pull request. Blank issues now go through the Blank issue template, and the issue chooser links to the troubleshooting guide.
- Shared the cache names in `src/shared/storageManager.ts`.

## 0.1.0-beta.2

- Added a site adapter for [Cyrisia](https://cyrisia.com/). It reads EPUB sections rendered in same-origin frames, or inline text.
- Added a site adapter for [Novel Archive](https://novelarchive.cc/), including novel/chapter titles and chapter text from its reader page.
- Grouped sequential named chapter parts into one chapter on Lnori volumes and in readable Cyrisia frames.
- Added the Novel Archive logo to the supported-sites list.
- Added a separate Debug window that automatically collects Narrately warnings and errors from extension contexts for review and copying.
- Speed slider: the mouse wheel now adjusts it, dragging no longer scrolls the panel on touch screens, and arrow keys no longer reach the page's own key handlers (`keyup`/`keypress` were not blocked). Changing speed after a chapter is prepared now applies to playback immediately.
- Single root `.gitignore`: `npm run build:wasm` removes the nested one wasm-pack generates, and editor, environment and tooling files are ignored.
- Removed the unused `src/content/extractor.ts`, a stale copy of the site-adapter logic.

## 0.1.0-beta.1

First beta. The UI shows a Beta badge for pre-releases.

- Local narration with Kokoro-82M (Rust/WASM core, TypeScript, no cloud service or API key).
- In-page panel: chapter picker, voice, speed, text preview, progress with time estimate, player with seek/skip/download. The whole chapter is prepared first; preparation continues in the background if the panel is closed.
- One-click in-panel model download (checksum-verified, stored on the device); optional WebGPU mode with its own model.
- Chrome and Firefox builds. Publishing a GitHub release builds and attaches them (see [docs/releasing.md](docs/releasing.md)).
