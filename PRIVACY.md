# Narrately Privacy Policy

**Last updated: October 12, 2026**

Narrately reads chapters aloud using a voice model that runs on your device. It
does not send the text you read to Narrately's developer or to a text-to-speech
service.

## In brief

- Narrately has no account, analytics, advertising, or tracking.
- Chapter text is read and narrated on your device. It is not uploaded.
- Your settings, downloaded voice model, optional saved narration audio, and
  technical error logs are stored locally in your browser.
- Narrately contacts Hugging Face only to download model files when you choose
  to download the voice model.
- You choose whether to copy diagnostic logs or share them in a support request.

## Information Narrately uses

### Chapter text and page details

When you open a web page, Narrately looks for readable chapter text so it can
offer its narration panel. This check happens on your device. If you choose to
narrate a chapter, Narrately processes its text on your device; it is not sent
to a Narrately server or a cloud narration service.

The text is kept in memory while it is being prepared and narrated. Narrately
may also save generated audio on your device if audio caching is enabled in
Settings. The saved audio is for replaying that chapter; it is not uploaded.

### Settings and downloaded files

Narrately stores your voice, playback speed, selected device (WASM or WebGPU),
and audio-cache preference in the browser's local extension storage.

If you choose to download the voice model, Narrately downloads the required
model files from Hugging Face and stores them in the browser's local extension
cache. The files are checked before they are saved. The download may reveal your
IP address and ordinary connection information to Hugging Face, as with other
downloads from that service. Narrately does not send chapter text with this
request.

### Technical error logs

Narrately can save its own warnings and errors to help you troubleshoot. It
keeps up to 100 recent records on your device. A record can include the time,
which part of Narrately reported it, the error message, and technical details
such as a stack trace or file location. Error details can sometimes contain
page URLs or other information included by the browser or an error message, so
review the logs before sharing them.

Logs are not sent automatically. You can view, copy, or clear them from
Narrately's Debug page. Copying requires your action; after copying, you decide
whether and where to share the text.

## Where information is stored and how to remove it

Narrately's settings, model files, cached narration audio, and error logs are
stored by your browser for the extension. They are not stored on Narrately
developer servers.

From Narrately's Storage screen, you can delete cached narration audio, the
downloaded model, or both. From the Debug page, you can clear error logs.
Uninstalling the extension or clearing its browser data may remove locally
stored information.

## Network connections and third parties

Narrately does not make analytics, advertising, or chapter-text upload requests.
The extension contacts Hugging Face to download the voice model when you request
it. Hugging Face's handling of connection information is governed by its own
privacy policy.

## Permissions

Narrately requests browser permissions to:

- store settings, model files, cached audio, and diagnostic logs locally;
- access web pages so it can find chapter text and show the narration panel;
- download the voice model from Hugging Face; and
- copy diagnostic logs only when you use the copy action.

## Changes and questions

If this policy changes, the updated version will be published with Narrately.
For questions or privacy concerns, contact the project maintainers through the
[Narrately GitHub repository](https://github.com/abdullahkhfb/narrately).
