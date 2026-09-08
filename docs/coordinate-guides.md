# Container coordinate guides

In the Editor's **Visualization Result Panel**, expand **Coordinate axes & grid**.
Selecting a runtime container automatically enables **Show system**. Selecting
a container in the Editor tree also selects its coordinate guide. Toggle the
individual axes or grid, or disable **Show system** to hide it.
Each container has independent settings. Turning off the system retains the
individual toggles for the next time it is shown. Changes use the usual DSL save
and undo/redo transaction; they do not regenerate data.

The root DSL stores settings by runtime container ID:

```json
{
  "coordinate_guides": {
    "0-1": {"visible": true, "x": true, "y": false, "grid": true},
    "0-2": {"visible": false, "radius": true, "angle": true, "grid": false}
  }
}
```

Without saved settings, the root’s direct children show their axes (grid off);
if there are no children, the root shows its axes. Deeper descendants are hidden
by default. The tree determines depth, including template containers.
Selecting another container enables its frame.
Explicitly enabled frames are retained, allowing multiple coordinate systems.
Explicitly saved visibility settings take precedence. References to removed container instances
are ignored. For repeated templates, select the individual runtime instance.
Saved settings also render in the Gallery and exported SVG.

The renderer exposes three helpers in
`src/pages/ChartV2/model/coordinateGuides.ts`:

- `drawCartesianAxes`: maps local X/Y axes and rectangular grid to the
  container's resolved x1/x2/y1/y2 coordinates.
- `drawPolarAxes`: uses its resolved angular/radial extent and the renderer's
  polar center convention, including Cartesian-parent center offsets. The
  grid uses concentric arcs and spokes; a declared angular data dimension of
  3–36 determines the spoke count, otherwise eight divisions are used.
- `drawCoordinateGuides`: renders independently configured containers and
  replaces the previous guide layer without accumulating duplicates.

Ticks describe normalized local coordinates (0–100), and angular ticks are
degrees. They do not infer original units, categories, or recovered labels.
Guides are visual annotations behind the marks and do not change their geometry.
The polar grid is circular, not a categorical polygon radar grid.

## Radar area correction

Polar area boundaries are already transformed into screen coordinates.
The old area generator replaced their inner Y coordinates with zero and
duplicated the first observation, producing an artificial path at the top
of the SVG. Polar radar areas now close a single outer contour with `Z`; polar bands
retain both inner and outer contours. Neither mutates input observations. Cartesian areas retain their baseline.
The radar's existing DSL/data are unchanged; this fixes the rendering artifact,
not the approximation to the reference image.
