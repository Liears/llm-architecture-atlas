# Contributing

## Model submission

1. Open an issue using the **Model submission** template.
2. Sources first: the model's HF `config.json` URL and revision, plus tech
   report / model card links. No source, no merge.
3. Add `models/<org>/<name>/main/architecture.json` + `evidence.json`:
   - `architecture.json` validates against
     `packages/architecture-ir/schema/architecture-ir.schema.json`;
   - every field you want shown in the UI needs a claim in `evidence.json`;
   - uncertain values: use `status: "inferred"` with a note, or omit.
4. Run `pnpm export:golden` — the figure and structural snapshot are
   generated; never hand-edit generated files.
5. `pnpm test && pnpm typecheck && pnpm pytest` must pass.

## Rules

- AI-proposed data enters only through the proposal flow (issue #16) and can
  never override a `verified` claim.
- Generated SVGs must not be hand-edited.
- Figures are original work in our own visual language; do not copy the
  reference gallery's images or composition.
