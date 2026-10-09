# Narrately

**Listen to novels and web chapters read aloud — privately, on your own computer.**

Narrately is a browser add-on for Chrome and Firefox. Open a chapter on
**Lnori**, click the small Narrately bubble, and it reads the text to you in a
natural-sounding voice.

> [!WARNING]
> **Beta software.** Expect bugs; feedback is welcome.

## Why Narrately?

- **Private.** The voice runs on your computer. The text you read is never sent anywhere.
- **No accounts, no keys, no subscription.** Nothing to sign up for.
- **Works offline.** After a one-time download of the voice (see below), it works without internet for narration.
- **Your choice of voice.** Eleven voices, American and British, male and female.
- **Save the audio.** Download any chapter as a WAV audio file.

## Supported websites

| Site | Status |
| --- | --- |
| <a href="https://lnori.com"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/sites/lnori-white.svg"><img src="docs/assets/sites/lnori.svg" alt="Lnori logo" width="20"></picture></a> &nbsp;**[Lnori](https://lnori.com)** | Officially supported. |
| <a href="https://cyrisia.com/"><img src="docs/assets/sites/cyrisia.png" alt="Cyrisia logo" width="20"></a> &nbsp;**[Cyrisia](https://cyrisia.com/)** | Officially supported. |
| <a href="https://novelarchive.cc/"><img src="docs/assets/sites/novelarchive.png" alt="Novel Archive logo" width="20"></a> &nbsp;**[Novel Archive](https://novelarchive.cc/)** | Officially supported. |

**Other sites may work, but are not guaranteed.** On other pages Narrately makes
its best guess at the main text. It often works on simple article-style pages,
but it may read the wrong part, include extra text, or not appear at all. It
treats the page as a single chapter, with no chapter list.

If a site doesn't work well, that is expected for now. More sites are planned.
Developers can add one by following
[Adding a supported site](docs/adding-a-site.md).

## Install

You install Narrately from this project's **Releases** page.

### Chrome (also Edge and Brave)

1. Open the **Releases** page of this project and download the file ending in `-chrome.zip`.
2. Unzip it into a folder you will keep (Chrome reads the add-on from that folder, so don't delete it).
3. Go to `chrome://extensions` and turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the unzipped folder.

### Firefox

1. Download the file ending in `-firefox.zip` from the **Releases** page and unzip it.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and choose the `manifest.json` file inside the unzipped folder.

Firefox removes temporary add-ons when it closes, so you will need to repeat these
steps after restarting Firefox.

**Requirements:** Chrome 121 or newer, or Firefox 128 or newer.

## First-time setup: download the voice

The first time you open the Narrately panel, it asks you to **Download model**.
This is the voice itself.

- It is a one-time download of about **88 MB**.
- It is saved on your computer, so you only do it once.
- This is the only time Narrately uses the internet.

## How to use it

1. Open a chapter on Lnori (other sites may work, but are not guaranteed).
2. Click the round **Narrately bubble** that appears on the page.
3. Pick a **chapter**, a **voice** and a **speed**.
4. Click **Generate narration**. Narrately prepares the whole chapter first, then you can press play.
5. Use the player to pause, skip back or forward 15 seconds, restart, or **download** the audio.

You can close the panel while a chapter is being prepared. It keeps working in
the background and shows a green dot on the bubble when it is ready.

You can also click the Narrately icon in your browser toolbar to change your
voice and speed, or to open the panel on the current page.

**No bubble?** Narrately only appears on pages with enough readable text. Reload
the page, or check that you are on a chapter page. On sites other than Lnori,
this can simply mean the page isn't supported yet.

## Voices

| Voice | Style |
| --- | --- |
| Heart | Warm American female |
| Bella | Expressive American female |
| Nicole | Clear American female |
| Sarah | Gentle American female |
| Sky | Light American female |
| Adam | Neutral American male |
| Michael | Steady American male |
| Emma | British female |
| Isabella | Polished British female |
| George | British male |
| Lewis | Measured British male |

These are ready-made voices. Narrately cannot copy your own voice or anyone else's.

## Settings

Open them from the toolbar icon.

- **Voice** and **Speed** — your defaults.
- **Device** — *WASM* works on nearly every computer. *WebGPU* can be faster on a
  computer that supports it, but needs a separate, larger download (about 312 MB).
  If you are unsure, leave it on WASM.
- **Cache generated audio** — keeps finished audio on your computer so replaying a
  chapter is instant. Turn it off if you would rather not store it.

## Your privacy

- Narrately has no analytics and no tracking.
- It never sends the text you read to any server.
- It asks for very little permission. It stores your settings, voice files, and
  up to 100 captured Narrately diagnostic logs on your computer. Logs may
  include page URLs; review them before sharing.
- The voice download comes from Hugging Face. The main voice file is checked to
  make sure it is the right one before it is used.

## Something wrong?

| Problem | Try this |
| --- | --- |
| The bubble doesn't appear | Reload the page and make sure you are on a chapter page. Sites other than Lnori are not guaranteed to work. |
| "Narrately cannot run here" | Reload the page. Browser settings pages can't be narrated. |
| The first narration is slow | Normal. The voice loads once; later chapters start faster. |
| The download fails or stops | Click **Retry download**. A partly downloaded file is never used. |
| Firefox lost the add-on | Temporary add-ons disappear on restart. Load it again. |

Still stuck? Open an issue on this project's page and tell us your browser and
what you saw.

## For developers

Building from source, how it works, testing and releasing are covered in the
[developer documentation](docs/README.md). To help out, see
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

See [LICENSE](LICENSE).
