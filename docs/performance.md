# Demo loading and interaction performance

This pass changes application loading/rendering, not the DSL schema or canonical
chart data. It applies to every chart; there are no chart-name rendering branches.

## Changes

- Resolve data categories from an import manifest without first downloading and
  parsing a JSON module. Local development continues to load current disk data.
- Gallery previews omit the author's undo history. Save reads the latest full
  document and commits the preview against it, retaining the original history
  and using the API hash for conflict detection.
- The large Gallery JSON textarea mounts on request (Show JSON). Parsing during
  typing is debounced. Superseded chart loads cannot overwrite a later selection.
- Selected container objects exclude the document envelope and global data maps;
  selecting root no longer clones every historical snapshot.
- A drawing indexes SVG endpoints once and caches bounds per node. This replaces
  the previous whole-SVG search for every edge. Each redraw rebuilds the cache.
- Old hierarchy context menus are removed on redraw/unmount.
- Production assets omit only `history`, preserving metadata, current geometry,
  reference state, data patterns and generators. Source JSON files are unchanged.
- Gallery and Editor load as separate entry chunks.

## Measurements

On this development machine, a scratch jsdom benchmark measured stringify,
parse/migration, model hydration, and SVG drawing. These are single-run CPU
samples, not network-inclusive browser latency or a cross-device benchmark.

| Case | Before (ms) | After (ms) |
| --- | ---: | ---: |
| OpinionSeer | 271 | 68 |
| Parallel coordinates | 350 | 136 |
| Scatterplot matrix | 211 | 152 |
| bitextract | 163 | 19 |

The 40 serialized canonical documents total 23,466,724 bytes. Production versions
without authoring history total 4,378,940 bytes (81.3% smaller, before compression).
All 40 production module exports were compared against their source document
with only `history` replaced by an empty log. The largest remaining case is the
scatterplot matrix, with thousands of marks; rendering and data transfer still
have a cost, especially on slower devices.

## Static hosting

The workflow builds with Node 22 and `npm ci`. `VITE_BASE_PATH` supplies the GitHub
repository prefix. Image URLs come from Vite's emitted asset URLs, and hash-based
Editor navigation avoids deep-link 404s on GitHub Pages. A `/ReVis/` preview was
checked in the browser for Gallery, image loading, Editor navigation, node
selection, Generate sample and Restore reference.

Production uses bundled data and in-memory session edits by default, without
probing nonexistent `/api/dsl` routes. Export/download JSON to keep changes;
refreshing ends the editing session. Local development retains the file API and
persistent authoring history. A production server that provides the existing
same-origin API can build with `VITE_DSL_API=true`. AI requests still require the
AI backend; GitHub Pages cannot host that server or its credentials.

## Validation notes

The subsequent interaction and Pages readiness pass now passes 237 frontend/model
tests and 21 API tests; one live AI smoke test is skipped without its explicit
opt-in. The production build passes under `/ReVis/`. All 40 Gallery examples were
exercised for generation and reference restoration in the static browser preview.

The earlier two stale fixture assertions now check the current DSL's explicit
values. OpinionSeer's 18-bar configuration now has a matching 18-row radial
profile. See [GitHub Pages readiness](github-pages-readiness.md) for that repair,
interaction checks, and static-hosting limitations.
