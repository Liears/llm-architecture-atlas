# Repository workflow for agents

These rules apply to every agent working in this repository. `CONTRIBUTING.md`
defines the content and evidence requirements; this file defines how agent work
is proposed, reviewed, merged, and accepted.

## Mandatory pull-request workflow

Every change—code, model data, diagrams, documentation, tests, and generated
artifacts—must be made on a short-lived branch and submitted as a GitHub pull
request. Never push implementation commits directly to `main`.

Each pull request must:

- link related issues with `Refs #<number>`;
- avoid `Fixes`, `Closes`, and `Resolves` keywords in the PR title, body, and
  commits, because they can close issues before acceptance review;
- describe the scope and any known limitations;
- include source and paper links for model or architecture work, following
  `CONTRIBUTING.md`;
- record the verification commands and results;
- include before/after screenshots or a visual contact sheet for UI and diagram
  changes at every required viewport.

Opening a PR does not mean the work is accepted. Keep linked issues open during
implementation, CI, review, merge, deployment, and post-deployment verification
where relevant.

## Separate implementation from acceptance

The agent implementing a change may open and update its PR and provide evidence.
It must not approve or merge its own PR, and it must not close or reopen the
linked issues.

Only the repository owner or an independent review agent explicitly assigned by
the user may close an issue. The implementer must never act as the reviewer for
its own change.

The independent reviewer closes an issue only after recording a pass against
the issue's original acceptance criteria. The review must include, as relevant:

1. pull and inspect the candidate commit or merged result;
2. compare the implementation with the issue, source brief, official model
   configuration/code, and cited papers;
3. run the relevant tests and validation commands;
4. inspect the real browser output at the required desktop and mobile viewports
   for UI or diagram work;
5. record a clear pass/fail result and any remaining discrepancies.

Green CI, regenerated golden screenshots, a merged PR, or a deployed site are
review inputs, not proof that an issue is complete. If the designated reviewer
is unavailable or any acceptance criterion remains unverified, report
`review pending` and leave the issue open.

## Required issue language

Use `Refs #<number>` to associate work with an issue. Treat a PR as a candidate
implementation, never as a declaration that the issue is complete.
