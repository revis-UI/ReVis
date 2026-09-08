# Gallery reference audit — 2026-09-08

All 40 images were compared against their reference renderings. This pass changes
32 canonical DSL documents and their stored reference data, and switches iForest
back from a saved random sample to its existing reference. No application,
renderer, generator, or server code was changed. Earlier uncommitted code changes
in this checkout belong to previous work.

These values are **manually constructed, image-guided representative data**, not
recovered original measurements or outputs of the automatic reproduction method.
Do not include these edited references as unedited/automatic evaluation results.
The original image assets remain unchanged. Document histories retain earlier
states; working backups are under the ignored `work/patterns/audit-proposed`.

## Changes

| Collection | Case | Correction |
| --- | --- | --- |
| basic_charts | 02_radial_bar_chart | Correct concentric ring order, thickness, hole and sweeps |
| basic_charts | 03_stacked_bar_chart | Monthly seasonal proportions and bounded stack totals |
| basic_charts | 04_radial_stacked_bar_chart | Descending radial totals with seven age-group proportions |
| basic_charts | 05_horizontal_stacked_bar | Recover paired category proportions in each horizontal row |
| basic_charts | 07_scatter_plot | Increase outline contrast while retaining recovered point coordinates |
| basic_charts | 08_bubble_plot_1 | Increase outline contrast while retaining recovered point coordinates |
| basic_charts | 09_bubble_plot_2 | Category-ordered bubbles with early-year mortality peaks |
| basic_charts | 10_2d_histogram_scatterplot | Count bubbles follow a positive diagonal density |
| basic_charts | 11_2d_histogram_heatmap | Sparse positive diagonal heatmap instead of independent random colors |
| basic_charts | 12_strip_plot | Five cylinder groups with group-specific horsepower ranges |
| basic_charts | 13_dot_plot | Restore peaked count distribution with a sparse right tail |
| basic_charts | 17_parallel_coordinates | Representative correlated automotive records across seven axes |
| basic_charts | 18_stacked_area | Continuous rising series with bounded stack heights |
| basic_charts | 19_radar_chart | Use seven scalar radii, a zero baseline and the original axis orientation |
| basic_charts | 20_mosaic_chart | Unequal category widths and within-column proportions |
| composite | 01_grid_bar_chart | Match per-panel horizontal bars and top-to-bottom color order |
| composite | 03_marginal_histograms | Derive both marginal distributions from the same heatmap density |
| composite | 04_line_with_highlight | Align shared line/dot trend and shaded intervals to image |
| composite | 05_box_plot | Align quartiles, medians and whiskers, and reverse panel color order |
| composite | 06_OpinionSeer | Smaller triangular scatter, a partial inner sector, and structured grayscale rings |
| composite | 08_bitextract | Thin category rings, grouped node colors, and radial rather than spiral center marks |
| composite | 09_DropoutSeer | Place three pies on the upper row and two gray nodes plus a pie on the lower row |
| composite | 10_CloudDet | Recover right-aligned bar lengths, palette order and pale heatmap bands |
| composite | 11_node_link | Representative community clusters and explicit local/bridge graph edges |
| composite | 13_line_and_dot | Group point values around a matching mean trend |
| composite | 14_line_and_area | Restore upward trend and narrow band using existing shared data_ref |
| composite | 15_multiple_bar_charts | Four distinct facet distributions instead of independent random heights |
| composite | 16_multiple_stacked_bar | Bounded per-facet stacks with skewed and bell-shaped distributions |
| composite | 17_multiple_areas | Restore panel colors and continuous time-series profiles |
| composite | 18_line_up | Bound stack totals and recover sorted rows and top distributions |
| composite | 19_NameClarifier | Thin peripheral rings and clustered interior node positions |
| composite | 20_EnsembleLens | Larger ring nodes, visible central nodes and shared spoke/perimeter heights |

## Reference versus generation

The edited files open in reference mode. **New sample remains available**, and
**Restore reference** returns the revised saved reference geometry and colors.
Explicit axis values describe the reference; generated mode continues to use the
existing generators. The shared `trend` fields in composite 04/14 and `outerRing`
fields in composite 20 retain their existing `data_ref` bindings. Numeric stack
ranges were bounded so the edited stacks cannot exceed their local 0–100 extent.

Per-instance histograms/areas/box quartiles and heatmap colors use the existing
stored view/cache format where the DSL does not express that conditional pattern.
Consequently a new random sample is not guaranteed to retain every reference
trend or cluster. This pass does not add distribution-fitting or graph-layout
algorithms. Composite 11's explicit edges are an illustrative community graph,
not the original network. Its topology persists while generated node positions
can vary independently. The two marginal histograms in composite 03 are summed
from the same representative bin counts that determine the heatmap colors.

## Remaining differences / intentionally unchanged

Basic 01, 06, 14, 15, 16 and composite 02, 07, 12 retain their earlier references
(composite 07 is switched back to reference mode):
the main shape/pattern was already reasonable. Fine point coordinates, labels,
original-unit ticks, legends and exact source measurements are not reconstructed.

OpinionSeer, bitextract, iForest, NameClarifier and EnsembleLens remain partial
reproductions. Their special grid/annotation layers, exact cluster backdrops,
decorative rings, and edge routing are not completely represented by the current
specifications. These require separate review of DSL expressiveness or rendering;
no supporting code was changed here. The radar now uses scalar radii and the
source orientation, but its specialized labeled polygon grid remains different.

## Validation

- All 40 canonical documents validate and render through the existing renderer.
- Each of the 32 edits was saved/reloaded and checked with three generated seeds;
  numerical coordinates remain finite and reference-mode restoration is exact.
- Bounded stack totals and existing line/dot/band shared coordinates were checked.
- Offline preview links use exact SVG circle bounds in a scratch-only jsdom shim;
  this is not a renderer modification or a substitute for full browser QA.

Browser spot-check: composite 11 loads the revised reference and renders both
its nodes and explicit edge paths. The production build also passes.
