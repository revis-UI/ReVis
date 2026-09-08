# GitHub Pages readiness review

Reviewed on 2026-09-09 against the current working tree. This review does not
publish or push the repository.

## Interaction fixes

- Gallery manual DSL edits now regenerate affected view data before applying.
  Save and export validate the latest textarea contents even before the debounce
  fires. Invalid edits keep the last valid drawing and show an error.
- Gallery avoids repeated preparation/history work for sample generation and
  ignores superseded loads. Saved Gallery selection carries into Editor.
- Editor instance-coordinate edits are committed to view data and support undo.
  Numeric primary counts, `2d_flatten`, zero coordinates, link references and
  the Y stacking control now use the correct values/fields.
- Data Control failures remain visible and retain the user's draft. Loading,
  saving, rendering and history failures have visible feedback.
- SVG previews fit the drawing bounds with padding. SVG export preserves hidden
  container styling. These are generic changes, without chart-specific DSL keys.
- Static mode disables AI controls without probing a nonexistent AI backend.
  Image upload explicitly describes its reference-image-only behavior.
- Dialog initial focus no longer steals focus after the user starts typing.

OpinionSeer's current primary count was the string `"18"`, but its explicit
radial values contained eight rows. The count is now numeric and the existing
three-segment radial profile is linearly interpolated to 18 rows. Historical
snapshots are retained; no chart-specific renderer behavior was introduced.

## Verification

- `npm test`: 237 frontend/model tests passed, one live AI smoke test skipped;
  21 API tests passed.
- `VITE_BASE_PATH=/ReVis/ npm run build`: TypeScript and production build passed.
- Static preview at `/ReVis/`: all 40 Gallery charts selected, generated and
  restored without error alerts or non-finite SVG geometry.
- Browser checks: Gallery color edit visibly changes bars; immediate Save uses
  the latest edit; invalid immediate Save preserves the prior drawing; saved
  edits open in Editor; undo/redo visibly restores/reapplies color; coordinate
  Apply changes actual geometry; axis checkboxes remove/restore the actual axis;
  Editor generation/restoration and refresh preserve the intended selected file.
- Representative wide and polar previews checked visually for centering.
- SVG export validity/visibility and failed Data Control edits covered by tests.

These checks do not establish pixel-perfect recovery for every example or equal
performance on every device. Large examples, particularly the scatterplot
matrix, still have meaningful download and rendering costs. The build reports
large data chunks. The live AI provider and an actual GitHub deployment were not
exercised by this static review.

## Deployment

The workflow uses GitHub's Pages artifact deployment with Node 22, `npm ci`,
regression tests and a repository-prefix-aware production build. It uses the
workflow token permissions rather than a custom personal token.

1. In the repository, choose **Settings → Pages → Source → GitHub Actions**.
2. Push the reviewed changes to `main`, or manually run the workflow on the
   intended branch when ready to publish.
3. Open the deployment URL and verify Gallery, images and `#/editor` navigation.

The base path comes from `configure-pages`. See GitHub's official
[custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Public demo behavior

Gallery and Editor use bundled data and an in-memory editing session. Gallery
Save makes the edit available to Editor in the current tab; save before switching
charts. Refresh resets session edits. Download DSL JSON to retain a copy; this
does not write to the public repository. Local development can still persist
through its file API.

GitHub Pages cannot host the AI/file API. Static mode keeps manual editing,
generation/restoration, axes, undo/redo and exports available, with AI disabled.
Uploading an image only changes the reference image; it does not infer a DSL.
A deployment with the existing same-origin backend can opt into
`VITE_DSL_API=true`; that server must be hosted separately from GitHub Pages.
