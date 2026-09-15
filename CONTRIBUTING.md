# Contributing

## Model submission

1. Open an issue using the **Model submission** template.
2. Sources first. The issue and PR must include an immutable official
   `config.json` / source-code revision, the model card, and every relevant
   paper or technical report. For each paper, name the exact figure, table,
   section, and PDF page used. No source brief, no drawing; no source, no
   merge.
   - Mark each paper as `model-specific` or `mechanism-only`. A mechanism
     paper can explain KDA, DSA, MLA, or mHC, but cannot prove the exact layer
     count or dimensions of a later model.
   - If no model-specific paper exists, say so explicitly and use the pinned
     official config/code as the source of truth. Never attach an unrelated
     paper just to fill the field.
   - Gallery posts and third-party diagrams are visual references only, not
     primary evidence for architecture facts.
3. Add `models/<org>/<name>/main/architecture.json` + `evidence.json`:
   - `architecture.json` validates against
     `packages/architecture-ir/schema/architecture-ir.schema.json`;
   - every field you want shown in the UI needs a claim in `evidence.json`;
   - uncertain values: use `status: "inferred"` with a note, or omit.
4. Run `pnpm export:golden` — the figure and structural snapshot are
   generated; never hand-edit generated files.
5. Review the generated diagram against the source brief. Every visible
   module, repeated-layer pattern, router, residual path, and non-obvious edge
   must map back to an exact source locator; decorative summary boxes do not
   count as topology.
6. `pnpm test && pnpm typecheck && pnpm pytest` must pass.

## Rules

- AI-proposed data enters only through the proposal flow (issue #16) and can
  never override a `verified` claim.
- Generated SVGs must not be hand-edited.
- Figures are original work in our own visual language; do not copy the
  reference gallery's images or composition.
