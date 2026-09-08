# ReVis

Visual DSL gallery and desktop editor built with React, Vite, D3, and
TypeScript.

- Gallery: `/`
- Editor: `/#/editor` (GitHub Pages: `/ReVis/#/editor`)

## Local development

Use the latest Node.js 22 LTS release, or Node.js 24.15 or newer.
Install the locked dependencies and start the frontend together with the loopback-only
API:

```bash
npm ci
npm run dev:full
```

Open `http://localhost:5173/editor`. The Vite app proxies `/api` to the local
Express service at `http://127.0.0.1:3000`.

The editor needs the local API for atomic DSL saves and AI requests. The API
only accepts local browser origins and only listens on `127.0.0.1`.

## AI semantic editor

Use the sparkle button in the editor's lower-right corner.

1. Expand **API configuration**.
2. Enter an OpenAI-compatible API root, API key, and model.
3. Adjust temperature, output-token limit, timeout, context window, and vision
   support when needed. The default maximum output is 65,536 tokens. There is
   no built-in upper limit or required relationship between output and context
   values. The default request timeout is 600 seconds; an active request can
   still be cancelled explicitly.
4. Choose **Save & test**. Configuration is saved even if the connection test
   fails.
5. Enter a modification instruction and optionally attach the current preview
   or one reference image.

The API key is written to the ignored project-local `.env.local` file with
restricted permissions. It is never returned to the browser after saving.
Changing the Base URL without entering a replacement key clears the previous
key, so credentials are never silently reused for a different destination.
Remote Base URLs must use HTTPS; plain HTTP is accepted only for loopback
providers.
Before sending DSL or view data to a new Base URL, the editor asks for explicit
consent and remembers that choice locally for that URL.

The configured service must expose an OpenAI-compatible Chat Completions API.
Enter the API root, such as `https://provider.example/v1`; the local service
appends `/chat/completions`.

AI responses use a structured envelope containing an RFC 6902 JSON Patch and
an optional semantic summary over:

```json
{
  "dsl": {},
  "viewData": {}
}
```

Patch paths must begin with `/dsl` or `/viewData`. The semantic summary contains
a short title, overview, and bounded DSL/view-data change descriptions. It is
treated as explanatory text only; responses are validated and dry-rendered
before any file or UI change. Invalid patches are rejected atomically and may
be sent back to the model for up to three repair attempts. Provider and network
failures are not automatically retried. A model response that echoes the
configured API key into Patch content is rejected before it can reach the
editor or a saved DSL file.

After each AI edit is validated and saved, the conversation shows the semantic
explanation together with deterministic, verified JSON details derived from the
final persisted history entry. The verified section reports added, changed, and
removed operations, groups them by DSL and view data, and lists a bounded set of
affected JSON paths. If a provider omits or malforms the optional explanation,
the editor derives a safe semantic fallback from that same persisted entry.
Empty, cancelled, rejected, or failed edits do not produce a saved-change
summary. Switching DSL files clears the prior file's conversation, draft,
attachments, and recent-instruction context.

## DSL persistence

`src/datav3/basic_charts` and `src/datav3/composite` are the canonical DSL
directories. Legacy documents are upgraded lazily when edited.

An upgraded document includes:

- `metadata`: schema version, generator version, deterministic generation seed,
  and update time;
- `view_data`: authoritative marks, expanded containers, and renderer cache;
- `history`: at most 20 reversible forward/inverse JSON Patch entries and a
  cursor.

Form, JSON, Data Control, and AI edits use one transaction path. Each successful
edit, undo, redo, or history jump is validated and atomically saved before it is
installed in the UI. Saves use a SHA-256 expected hash. If the file changed on
disk, the editor offers either external reload or an explicit force overwrite.

The file-diff button in the lower-right toolbar compares the current history
position with its immediate previous version. It shows path-level added,
removed, and changed JSON values without mutating the document; persisted
history metadata and `metadata.updated_at` are omitted from the comparison.

JSON mode is a draft editor: changes are not applied until **Apply Changes** is
selected.

## Commands

```bash
npm run dev:full       # Vite + local API
npm run build          # TypeScript and production build
npm run lint           # ESLint
npm test               # Vitest unit/integration + Node API tests
npm run test:unit      # Core and React tests
npm run test:api       # Loopback API integration tests
npm run test:e2e       # Mocked desktop Playwright flow
npm run test:coverage  # Vitest coverage
```

Install Playwright Chromium once with `npx playwright install chromium`, or use
an installed Chrome with
`PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`.

An opt-in live provider smoke test is also available:

```bash
RUN_LIVE_AI_SMOKE=1 npm run test:smoke
```

It uses the project-local AI configuration and is disabled by default.

## Reviewed gallery data

Thirteen reference-pattern reconstructions have been selectively imported and
corrected. See [case-by-case provenance, decisions, and limitations](docs/recovery/README.md)
for the source artifacts, data semantics, comparison images, and validation.
These curated examples are approximate image-based reconstructions, not
original datasets or new automated evaluation measurements.

Gallery and Editor support **Generate sample**, **New sample**, and **Restore reference**.
Shared `data_sources` and `data_ref` bindings keep linked marks aligned across samples;
see the recovery documentation for the DSL contract.

If port 5173 is occupied, select a matching frontend/API origin for both processes:

```sh
REVIS_DEV_PORT=5174 npm run dev:full
```

Then open `http://127.0.0.1:5174/` (gallery) or `/editor`.
