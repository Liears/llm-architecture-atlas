/**
 * Architecture IR v0.1 — TypeScript mirror of the Pydantic source of truth.
 *
 * Source of truth: tools/ingest/src/atlas_ingest/ir.py, which exports
 * schema/architecture-ir.schema.json. These types are hand-mirrored in v0.1;
 * the ajv test keeps them honest against the committed schema. Codegen from
 * the JSON Schema replaces hand-mirroring when the surface grows (issue #2
 * acceptance allows either; codegen lands with #13's pipeline).
 */

export const IR_VERSION = "0.1.0";

export type ClaimStatus =
  | "verified"
  | "reported"
  | "derived"
  | "inferred"
  | "conflict"
  | "unknown";

export type SourceKind =
  | "hf_config"
  | "source_code"
  | "tech_report"
  | "model_card"
  | "manual"
  | "derived";

export interface SourceRef {
  kind: SourceKind;
  url?: string | null;
  revision?: string | null;
  locator?: string | null;
  hash?: string | null;
}

export interface Claim {
  path: string;
  value?: unknown;
  status: ClaimStatus;
  source?: SourceRef | null;
  extractor?: string | null;
  checked_at?: string | null;
  note?: string | null;
  /** Disagreement history; only set on conflict claims. */
  alternatives?: unknown[] | null;
}

export interface ModelIdentity {
  id: string;
  label: string;
  family?: string | null;
  revision?: string;
  license?: string | null;
}

export interface ModelFacts {
  num_hidden_layers: number;
  hidden_size: number;
  num_attention_heads: number;
  num_key_value_heads?: number | null;
  head_dim?: number | null;
  vocab_size?: number | null;
  context_tokens?: number | null;
  total_params?: number | null;
  active_params?: number | null;
}

export interface LayerGroup {
  label: string;
  kind: string;
  module?: string | null;
  layers: number[];
}

export interface ExpertConfig {
  routed_total?: number | null;
  active_routed?: number | null;
  shared?: number | null;
}

export interface ResidualScheme {
  scheme: string;
  streams?: number | null;
  note?: string | null;
}

export interface PositionEncoding {
  type: string;
  note?: string | null;
}

export interface ModelTopology {
  attention_groups: LayerGroup[];
  ffn_groups: LayerGroup[];
  experts?: ExpertConfig | null;
  residual?: ResidualScheme | null;
  position_encoding?: PositionEncoding | null;
}

export interface ModelDocument {
  ir_version: string;
  model: ModelIdentity;
  facts: ModelFacts;
  topology: ModelTopology;
  claims?: Claim[];
}

/** evidence.json: the Evidence Ledger dump for one model/revision. */
export interface EvidenceFile {
  model_id: string;
  claims: Claim[];
}
