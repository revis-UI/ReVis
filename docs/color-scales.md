# Colors across repeated containers

Color rules live in `data_specification[containerId].non_layout_specification`.
Existing `fix`, `linear`, `ordinal_primary`, `ordinal_secondary`, and per-mark
random `categorical` rules remain supported.

Two additional modes express the scope of color assignment:

- `ordinal_instance`: one palette entry per instance of the nearest template
  ancestor. All descendant marks using this rule share the instance index.
- `categorical_instance`: one seeded random palette choice per instance and
  style property, rather than a separate choice for each mark. Colors can repeat.

Instance indices follow template expansion order (zero-based), not screen order
or category labels. Nested templates introduce a new local index. A container
without a template ancestor has index zero. When the palette is too short,
`ordinal_instance` cycles; use enough entries when all instances must differ.

## Shared palettes

Declare ordered palettes at the document root:

```json
"color_scales": {
  "metrics": ["#F28E85", "#9CCCE3", "#98D2A3", "#F7B483"]
}
```

The LineUp top histogram template uses:

```json
"fill": { "scale": "ordinal_instance", "ref": "metrics" }
```

The lower stacked rows use:

```json
"fill": { "scale": "ordinal_secondary", "ref": "metrics" }
```

Thus top instances 0–2 match lower items 0–2. The fourth entry remains available
for the lower chart's extra series. These are shared **color indices**, not shared
numeric data: the histogram and lower rows do not thereby acquire a data relation.
`data_ref` continues to bind numerical fields separately.

`ref` is supported on palette-based `fill` and `stroke` rules. It names a
`color_scales` entry and replaces inline `options`; combining it with `options`,
`fix`, or `linear` is rejected. References with `ordinal_primary` or
`ordinal_secondary` also cycle when their index exceeds the shared palette.
A shared reference alone does not infer categories, reorder records, or ensure
that a primary index in one container means the same thing as a secondary index
in another. The DSL author establishes that correspondence.

For coherent random instance colors, change `ordinal_instance` to
`categorical_instance`. Matching instance indices using the same ref get the
same random choice, even across fill/stroke and separate containers. A new sample
seed can change these choices; the same seed reproduces them. Per-mark
`categorical` remains independent even when using a shared palette. Ordinal
mappings stay stable across new samples, which is the default in the curated
05 box plot, 17 multiple areas, and 18 LineUp examples.

The new instance-color RNG is independent of numerical generation, so changing
between ordinal and categorical instance colors does not alter sampled geometry.
Saved snapshots and reference restoration retain their colors. In the Editor,
Apply Changes to the root palette updates its consumers through the normal save
and history flow. These settings are edited in JSON; no dedicated color form is
provided yet.

This is a renderer/DSL extension and a manual refinement of three local examples.
It does not demonstrate that the existing image-to-DSL prompts can infer the new
fields automatically. See `recovery/README.md` for example provenance.
