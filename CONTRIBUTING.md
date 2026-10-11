# Contributing

Developer documentation lives in [`docs/`](docs/README.md). Start with
[Getting started](docs/getting-started.md) and [Architecture](docs/architecture.md).

Keep browser behavior in TypeScript and deterministic domain behavior in Rust.
Do not add network calls to inference code.

## TypeScript

Follow `docs/TYPESCRIPT_STYLE.md`, which is based on the supplied Google
TypeScript Style Guide. Keep exported APIs small, use named exports, prefer
interfaces for object-shaped APIs, and add short JSDoc to public symbols.

## Supporting a new site

Add a site adapter under `src/content/sites/`; see
[docs/adding-a-site.md](docs/adding-a-site.md).

## Issues and pull requests

Open issues from the templates: **Bug report**, **Question**, or **Blank issue**
for anything else. Pull requests start from a checklist in
`.github/PULL_REQUEST_TEMPLATE.md`; UI changes need screenshots.

## Checks

Before opening a PR (details in [docs/testing.md](docs/testing.md)):

```bash
npm run typecheck
npm run lint:rust
npm run test:rust
```

Use small modules and short comments. Prefer pure functions for extraction,
chunking, validation, and cache-key generation.
