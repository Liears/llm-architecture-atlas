# models/

Per-model architecture data, keyed by `<org>/<model>/<revision>/`:

- `architecture.json` — Architecture IR (ModelFacts + ModelTopology)
- `evidence.json` — Evidence Ledger: per-claim source, locator, status
  (verified / reported / derived / inferred / conflict / unknown)
- `sources.lock.json` — locked revisions and content hashes of every source

Populated starting with the GLM-5.3-Flash golden slice (issue #6). Raw upstream
artifacts are never committed here; only hashes and locators.
