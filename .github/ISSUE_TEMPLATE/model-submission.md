---
name: Model submission
about: Propose a model for the atlas (sources required)
title: "[model] org/name"
labels: ["area:ingest"]
---

## Primary source pack

- canonical model repo:
- config/source URL + immutable revision/commit:
- model card URL:
- model-specific paper/report URL (or `none published`):
- mechanism papers used (KDA/DSA/MLA/MoE/mHC/etc.):
- third-party visual references (secondary only):

For every paper above, list the exact `Figure / Table / Section / PDF page`
used and label it `model-specific` or `mechanism-only`.

## Architecture summary (from the sources above)

- layers / attention groups:
- FFN / MoE (routed, active, shared):
- hidden size / heads / kv heads:
- vocab / context:
- params (total / active):

## Evidence notes

- anything ambiguous or conflicting between sources:
- fields you could not verify:
- why each mechanism-only paper applies to this model:

## Paper-to-diagram map

| Visible node / edge / repetition | Primary locator | Status |
|---|---|---|
| Example: 4-stream residual read/mix/write | mHC paper, Fig. 1(c), PDF p.1 + pinned model config `hc_mult` | verified |

## Diagram acceptance

- [ ] The layer schedule is drawn as topology, not only summarized as text.
- [ ] Attention, FFN/MoE, router, residual, and special heads that distinguish the model are explicit.
- [ ] Every visible number and non-obvious edge resolves to a primary-source locator.
- [ ] A reviewer compared all viewports with the source figures and recorded intentional simplifications.
