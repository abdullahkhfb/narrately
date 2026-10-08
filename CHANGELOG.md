# Changelog

## 0.1.0-beta.1

First beta. The UI shows a Beta badge for pre-releases.

- Local narration with Kokoro-82M (Rust/WASM core, TypeScript, no cloud service or API key).
- In-page panel: chapter picker, voice, speed, text preview, progress with time estimate, player with seek/skip/download. The whole chapter is prepared first; preparation continues in the background if the panel is closed.
- One-click in-panel model download (checksum-verified, stored on the device); optional WebGPU mode with its own model.
- Chrome and Firefox builds. Publishing a GitHub release builds and attaches them (see [docs/releasing.md](docs/releasing.md)).
