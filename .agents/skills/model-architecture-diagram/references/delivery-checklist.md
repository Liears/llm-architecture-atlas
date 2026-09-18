---
type: template
title: Model architecture diagram delivery checklist
created: 2026-09-18
updated: 2026-09-18
---

# Model architecture diagram delivery checklist

## Source and semantics

- [ ] Exact config/code URL includes an immutable revision.
- [ ] Each mechanism paper has section, figure/table and PDF page locators.
- [ ] Exact-model and mechanism-only claims are distinguished.
- [ ] Every displayed number and non-obvious edge resolves to a claim.
- [ ] Scene validation passes before layout.
- [ ] Collapsed links have validated source paths.

## Structural tests

- [ ] Signature schedule/tail mutation fails.
- [ ] Residual-stream deletion or cross-wire fails.
- [ ] Selector/selected-value deletion fails.
- [ ] Router branch or merge deletion fails.
- [ ] Export and structural snapshot are deterministic.

## Visual review

- [ ] Main reading order is obvious without following callout lines.
- [ ] Insets are contained and do not compete with the main spine.
- [ ] Lines do not cross text, reserved titles or unrelated nodes.
- [ ] No text clips or relies on browser tooltips to be understood.
- [ ] Desktop aspect ratio and effective type-size gates pass.
- [ ] The actual page, not only the isolated SVG, is checked at every required
      viewport and in both themes when supported.
- [ ] Blind comparison records where the Atlas figure is better or worse than
      the selected visual benchmark.

## Pull request evidence

- [ ] `Refs #N`; no automatic issue-closing keyword.
- [ ] Source pack and paper-to-diagram map linked.
- [ ] Verification commands and results included.
- [ ] Before/after page screenshots and 1x/2x figure exports attached.
- [ ] Scope, non-goals and known limitations stated.
- [ ] Status says `review pending`; implementation author does not approve,
      merge or close the issue.
