# Local Kokoro assets

Bundled in every build: the 11 curated voice packs (`npm run sync-voices`, run
automatically by `npm run package`).

The ONNX model (about 88 MB) is not bundled by default. Users download it from
the panel's "Download model" button into the extension's own cache, pinned to
the revision in `src/inference/modelStore.ts` and verified by SHA-256. For a
fully offline build, run `npm run sync-model` before packaging and the files
under `onnx-community/Kokoro-82M-ONNX/` are used directly.

The runtime blocks all other remote requests. Inference needs no TTS service,
cloud endpoint, or API key.

See [docs/model-and-voices.md](../docs/model-and-voices.md) for how these files are stored and loaded.
