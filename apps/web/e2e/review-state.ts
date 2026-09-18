/**
 * Review-state machine for the #35 contact artifacts (round 5).
 *
 * Pure module — no playwright, no git, no fs — so the schema and the binding
 * rules are unit-testable (review-state.test.ts) instead of living inside the
 * e2e contact test.
 *
 * Binding rule: a `reviewed` signature vouches for the SIX SHOT HASHES it
 * names, not for a commit. The head the reviewer looked at is recorded as
 * provenance (`head`) and printed on the board, but it is not part of the
 * binding: committing the signature necessarily creates a new head, so a
 * head-equality binding could never be satisfied by a real commit (round-4
 * review P1). If any shot hash differs from the signature, the inherited
 * state auto-reverts to `pending` with the reason, so an old signature can
 * never vouch for changed artifacts.
 */

export const REVIEW_STATUSES = ["pending", "reviewed", "rejected", "skipped"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface ReviewState {
  status: ReviewStatus;
  reviewer: string | null;
  date: string | null;
  /** head the reviewer looked at — provenance, not binding (see file header) */
  head: string | null;
  /** sha256 of the six shots, from the generated manifest of the reviewed run */
  shots_sha256: Record<string, string> | null;
  note?: string;
}

export const PENDING: ReviewState = {
  status: "pending",
  reviewer: null,
  date: null,
  head: null,
  shots_sha256: null,
};

/** validate the committed record; throws on anything a signature must carry */
export function parseCommittedReview(raw: unknown, shotNames: string[]): ReviewState {
  if (raw === undefined || raw === null) return { ...PENDING };
  const r = raw as Partial<ReviewState>;
  if (typeof r.status !== "string" || !(REVIEW_STATUSES as readonly string[]).includes(r.status)) {
    throw new Error(`visual_review.status "${String(r.status)}" is not one of ${REVIEW_STATUSES.join("/")}`);
  }
  const state: ReviewState = {
    status: r.status as ReviewStatus,
    reviewer: r.reviewer ?? null,
    date: r.date ?? null,
    head: r.head ?? null,
    shots_sha256: r.shots_sha256 ?? null,
    note: r.note,
  };
  if (state.status === "reviewed") {
    const missing: string[] = [];
    if (!state.reviewer || typeof state.reviewer !== "string") missing.push("reviewer");
    if (!state.date || typeof state.date !== "string") missing.push("date");
    if (!state.head || !/^[0-9a-f]{40}$/.test(state.head)) missing.push("head (40-hex sha, the run that was reviewed)");
    if (!state.shots_sha256 || shotNames.some((f) => typeof state.shots_sha256?.[f] !== "string")) {
      missing.push(`shots_sha256 (all of: ${shotNames.join(", ")})`);
    }
    if (missing.length > 0) {
      throw new Error(`visual_review status "reviewed" requires ${missing.join(", ")} — an unsigned review is not a review`);
    }
  }
  return state;
}

/**
 * Inherit a committed signature into this run. A `reviewed` state survives
 * only when every shot hash still matches; anything else reverts to pending
 * with a human-readable reason. `rejected`/`skipped` pass through untouched:
 * they are visible states, and the caller decides that they never satisfy
 * the review requirement.
 */
export function resolveEffectiveReview(
  committed: ReviewState,
  head: string,
  shotHashes: Record<string, string>,
): { effective: ReviewState; revertNote: string | null } {
  if (committed.status !== "reviewed") return { effective: committed, revertNote: null };
  const drifted = Object.keys(shotHashes).filter((f) => committed.shots_sha256![f] !== shotHashes[f]);
  if (drifted.length === 0) return { effective: committed, revertNote: null };
  const note =
    `auto-reverted from "reviewed by ${committed.reviewer} ${committed.date}" (signed at head ` +
    `${committed.head!.slice(0, 9)}): shot hashes changed after the signature — ${drifted.join(", ")}`;
  return { effective: { ...PENDING, note }, revertNote: note };
}

export const reviewSatisfied = (s: ReviewState): boolean => s.status === "reviewed";

export const reviewLabel = (s: ReviewState): string =>
  s.reviewer ? `${s.status} by ${s.reviewer} ${s.date ?? ""}`.trim() : s.status;
