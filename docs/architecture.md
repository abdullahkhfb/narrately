# Architecture

Narrately extracts chapter text in the page, generates speech on the device with
Kokoro-82M, and plays it back inside the page. The browser layer is TypeScript;
the deterministic domain core is Rust compiled to WebAssembly.

## Runtime contexts

Six extension contexts cooperate. Each exists because of a browser restriction
(see [Design notes](design-notes.md)).

```mermaid
flowchart TB
    subgraph PageOrigin["Page origin (the website)"]
        page["Page DOM"]
        content["content.js<br/>classic script<br/>site adapters, panel UI, host client"]
        iframe["hidden iframe<br/>src = host.html"]
    end

    subgraph ExtOrigin["Extension origin"]
        host["host.js<br/>narration orchestrator<br/>Rust/WASM core, IndexedDB audio cache, model store"]
        worker["inference_worker.js<br/>module worker<br/>kokoro-js + transformers.js, fetch guard"]
        bg["background.js<br/>service worker (Chrome)<br/>event page (Firefox)"]
        popup["popup page<br/>settings UI"]
        debug["debug page<br/>captured Narrately logs"]
        storage[("storage.local<br/>settings + debug logs")]
    end

    page -->|"reads text"| content
    content -->|"embeds"| iframe
    iframe -.->|"is"| host
    content <-->|"postMessage<br/>HostRequest / WorkerMessage"| host
    host <-->|"Worker messages<br/>InferenceMessage / WorkerMessage"| worker
    popup -->|"tabs.sendMessage<br/>open_panel"| content
    bg --- storage
    popup --- storage
    content --- storage
    debug -->|"get_debug_errors<br/>runtime.sendMessage"| bg
    content -->|"report_debug_error"| bg
    host -->|"postMessage<br/>narrately_debug_error"| content
    worker -->|"debug_error"| host
```

| Context | Entry | Bundle format | Responsibilities |
| --- | --- | --- | --- |
| Content script | `src/content/index.ts` | IIFE (classic) | Detect chapters, render the Shadow DOM panel, drive playback, embed the host iframe |
| Host page | `src/inference/host.ts` | ES module | Own the worker, the Rust/WASM core, the audio cache and the model store |
| Inference worker | `src/inference/worker.ts` | ES module worker | Load Kokoro, synthesize one chunk at a time, enforce the local-only fetch guard |
| Background | `src/background/index.ts` | IIFE (classic) | Seed default settings on install; handle settings, panel, and debug-log messages; retain up to 100 local diagnostic records |
| Popup | `src/popup/index.ts` | ES module | Edit settings (reads and writes `storage.local` directly), ask the active tab to open its panel |
| Debug page | `src/popup/debug.ts` | ES module | Display captured Narrately warnings/errors and copy the report; cannot read unrelated browser or page console output |

The manifest declares both Chrome's and Firefox's background style in neutral
form; [`scripts/manifest.mjs`](../scripts/manifest.mjs) emits only the key each
browser accepts. See [Building and packaging](building.md).

## Narrating a chapter

```mermaid
sequenceDiagram
    actor User
    participant Panel as Panel (content.js)
    participant Host as Host page (host.js)
    participant Rust as Rust core (WASM)
    participant DB as IndexedDB audio_cache
    participant Worker as Inference worker

    User->>Panel: Generate narration
    Panel->>Host: narrate {text, voiceId, speed, device, cacheEnabled}
    Host->>Rust: validate_synthesis_request
    Rust-->>Host: "" or error message
    Host->>Rust: chunk_text(text, 480)
    Rust-->>Host: chunks[]
    loop each chunk, in order
        Host->>Rust: build_cache_key(chunk, voice, speed)
        Rust-->>Host: nr-sha256 key
        Host->>DB: get(key)
        alt cache hit
            DB-->>Host: audio + duration
        else miss
            Host->>Worker: synthesize {chunk, voice, speed, device}
            Worker-->>Host: WAV ArrayBuffer + duration
            Host->>DB: put(key, audio)
        end
        Host-->>Panel: progress {completed, total}
    end
    Host->>Host: merge WAV chunks
    Host-->>Panel: result {audio, durationMs} (ArrayBuffer transferred)
    Panel->>User: player ready (blob URL)
```

Details worth knowing:

- Cancellation is checked **between chunks**; a chunk that is already
  synthesizing finishes first.
- The worker serializes jobs through a promise chain, so only one chunk runs at a time.
- The cache is skipped entirely when `cacheEnabled` is false.
- Download-to-file is a local `<a download>` click in the panel (file name
  `<book> - <chapter>.wav`). No `downloads` permission is used.

## Panel readiness

```mermaid
stateDiagram-v2
    [*] --> Checking: panel opens
    Checking --> NeedsModel: model_status installed=false
    Checking --> Ready: model_status installed=true
    NeedsModel --> Downloading: Download model
    Downloading --> NeedsModel: cancelled or failed
    Downloading --> Ready: all files verified and cached
    Ready --> Preparing: Generate narration
    Preparing --> Ready: cancelled or failed
    Preparing --> Playable: result received
    Playable --> Preparing: Generate again
```

When the panel opens and the model is already installed, it is also pre-loaded
(`warmup`) so the first narration starts sooner. `device` (`wasm` or `webgpu`) selects which model files
are required; see [Model and voices](model-and-voices.md).

## Message contracts

All message types are declared in [`src/shared/messages.ts`](../src/shared/messages.ts).
Receivers validate `type` at runtime before narrowing.

```mermaid
flowchart LR
    subgraph rt["browser.runtime / tabs messages"]
        direction TB
        gs["get_settings"]
        ss["set_settings"]
        gv["get_voice_catalog"]
        op["open_panel"]
    end

    subgraph hostreq["Content to host (postMessage)"]
        direction TB
        nar["narrate"]
        can["cancel"]
        ms["model_status"]
        md["model_download"]
        wu["warmup"]
    end

    subgraph wm["Host to content (postMessage)"]
        direction TB
        prog["progress"]
        res["result"]
        err["error"]
        mst["model_status"]
    end

    subgraph infm["Host and worker"]
        direction TB
        syn["synthesize"]
        can2["cancel"]
        wu2["warmup"]
        rdy["ready"]
    end
```

| Channel | Direction | Types |
| --- | --- | --- |
| `runtime.sendMessage` | popup/content/debug page to background | settings and panel messages; `report_debug_error`, `get_debug_errors` |
| `tabs.sendMessage` | popup to content | `open_panel` |
| `postMessage` | content to host iframe | `narrate`, `cancel`, `model_status`, `model_download`, `warmup` |
| `postMessage` | host iframe to content | `progress`, `result`, `error`, `model_status`, `narrately_debug_error` |
| `Worker.postMessage` | host to worker | `synthesize`, `cancel`, `warmup` |
| `Worker.postMessage` | worker to host | `progress`, `result`, `error`, `ready`, `debug_error` |

Every request carries a `jobId`. The content-side `HostClient` keeps a
`Map<jobId, listener>`; progress messages keep the listener, while `result`,
`model_status` and `error` settle and remove it. Errors from the worker must
carry the `jobId`, otherwise the request would stay pending forever.

## Data model

```mermaid
classDiagram
    class NarrationSettings {
        string voiceId
        number speed
        InferenceDevice device
        boolean cacheEnabled
    }
    class VoiceProfile {
        string id
        string name
        string description
        string language
        VoiceKind kind
        string assetPath
    }
    class Book {
        string title
        string source
    }
    class Chapter {
        string id
        string title
        string text
        Element element
    }
    class AudioCacheEntry {
        string key
        ArrayBuffer audio
        number createdAt
        number durationMs
    }

    Book "1" --> "1..*" Chapter : chapters
    NarrationSettings ..> VoiceProfile : voiceId selects
    AudioCacheEntry ..> NarrationSettings : key hashes text, voice, speed
```

- `InferenceDevice` is `'wasm' | 'webgpu'`; `VoiceKind` is `'preset' | 'local_embedding'`.
- `Book.source` is a `SiteId`: the id of the adapter that produced the book (`'lnori'`, `'cyrisia'`, `'novelarchive'`, or `'generic'` for the best-effort fallback). Add a member per new site.
- Defaults: voice `af_heart`, speed `1`, device `wasm`, cache on.

## Chapter detection

Detection is a small plugin system. Each supported website has a **site adapter**
in `src/content/sites/`; `detectBook()` in `sites/index.ts` picks the first adapter
that recognizes the page and falls back to a generic one. The full guide for
adding a site is in [Adding a supported site](adding-a-site.md).

```mermaid
flowchart TD
    start["detectBook()"] --> order["adapters for this host first,<br/>then the other registered adapters"]
    order --> lnori["Lnori adapter (official)<br/>section.chapter elements<br/>chapter headings label entries<br/>untitled text selectors continue the prior chapter; image-only selectors are skipped"]
    order --> cyrisia["Cyrisia adapter (official)<br/>host cyrisia.com only<br/>main.ch-page/#ch-text, then readable iframes<br/>sequential same-name Part One/Two iframe sections are joined"]
    order --> novelarchive["Novel Archive adapter (official)<br/>#reader-article and reader title selectors<br/>one current chapter per reader URL"]
    order --> future["future site adapters"]
    lnori --> hit{"Book found?"}
    future --> hit
    hit -- yes --> filter["readParagraphs()<br/>keep p, blockquote, pre<br/>drop navigation and boilerplate lines"]
    hit -- no --> generic["generic fallback (best effort)<br/>score article, main, role=main,<br/>content-like and body elements"]
    generic --> enough{"at least 400 chars of paragraphs<br/>and link density 0.4 or less?"}
    enough -- yes --> best["highest score wins<br/>article gets x1.25"]
    enough -- no --> none["null: no panel"]
    best --> filter
    filter --> book["Book"]
```

| Adapter | `Book.source` | Support level |
| --- | --- | --- |
| `lnori.ts` (`section.chapter` markup, host `lnori.com`) | `'lnori'` | **Official.** Multi-chapter books, real chapter titles, chapter navigation; untitled text selectors continue the prior chapter and image-only selectors are skipped |
| `cyrisia.ts` (`main.ch-page` and `#ch-text`, host `cyrisia.com`) | `'cyrisia'` | **Official.** Reads the chapter title and story from the live reader, with iframe fallback; sequential selectors for named chapter parts are joined |
| `novelarchive.ts` (`#reader-article`, host `novelarchive.cc`) | `'novelarchive'` | **Official.** One chapter per reader URL, with novel and chapter titles |
| `generic.ts` (scored article or main element) | `'generic'` | **Best effort.** One synthetic chapter named after the first heading; no chapter list; may pick the wrong block on unfamiliar layouts |

Only registered adapters are maintained against a real site. Behaviour on other
sites is not guaranteed and bug reports for them are low priority.

Adapters whose `hosts` match the current page are tried first. The remaining
adapters still run afterwards because they match on page markup, so a mirror or
a local test page imitating a supported site keeps working.

If nothing is found at load, `content/index.ts` watches DOM mutations (debounced
800 ms, up to 60 s) so reader sites that render late still get a panel.

## Storage

| What | Where | Owner |
| --- | --- | --- |
| Settings | `browser.storage.local` key `settings` | background, popup, panel |
| Captured Narrately logs | `browser.storage.local` key `debugErrors` (latest 100) | background, debug page |
| Generated audio | IndexedDB `narrately` / `audio_cache` (extension origin, shared across sites) | host page |
| Model files | Cache API `narrately-model-v1` (extension origin) | host page, worker |
| Voice packs | Bundled in the package under `models/.../voices/` | build |

Permissions requested: `storage`, `unlimitedStorage`, `clipboardWrite` (copy
captured debug logs), and host permissions for Hugging Face (used only for the
model download).

Debug stores up to 100 captured Narrately warnings and errors locally. The
browser does not expose unrelated DevTools console output to extensions.
