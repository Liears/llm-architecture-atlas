import { describe, expect, it } from "vitest";
import { buildCatalog, sortEntries, filterEntries, families } from "./index.js";
import { buildGenome, genomeCellRole } from "./genome.js";
import { compareModels } from "./compare.js";

const docs = [
  {
    model: { id: "meta-llama/llama-3-8b", label: "Llama 3 8B", family: "Llama", revision: "main" },
    facts: { num_hidden_layers: 32, total_params: 8030000000, active_params: 8030000000, context_tokens: 8192 },
    topology: {
      attention_groups: [{ label: "GQA", kind: "gqa", layers: Array.from({ length: 32 }, (_, i) => i) }],
      ffn_groups: [{ label: "Dense", kind: "dense_ffn", layers: Array.from({ length: 32 }, (_, i) => i) }],
      experts: null,
    },
  },
  {
    model: { id: "zai-org/glm-5.3-flash", label: "GLM-5.3-Flash (320B-A18B)", family: "GLM", revision: "main" },
    facts: { num_hidden_layers: 45, total_params: 320000000000, active_params: 18000000000, context_tokens: 1048576 },
    topology: {
      attention_groups: [
        { label: "KDA", kind: "linear_attention", layers: Array.from({ length: 34 }, (_, i) => i) },
        { label: "MLA/DSA", kind: "mla_sparse", layers: Array.from({ length: 11 }, (_, i) => i + 34) },
      ],
      ffn_groups: [
        { label: "Dense", kind: "dense_ffn", layers: [0, 1, 2] },
        { label: "MoE", kind: "moe", layers: Array.from({ length: 42 }, (_, i) => i + 3) },
      ],
      experts: { routed_total: 288 },
    },
  },
];

const entries = buildCatalog(docs);

describe("buildCatalog", () => {
  it("derives decoder types and sorts by label", () => {
    expect(entries.map((e) => e.label)).toEqual(["GLM-5.3-Flash (320B-A18B)", "Llama 3 8B"]);
    expect(entries[1]!.decoderType).toBe("GQA");
    expect(entries[0]!.decoderType).toBe("Hybrid (KDA + MLA/DSA) + MoE");
  });

  it("sorts by params and filters by family/query", () => {
    const byParams = sortEntries(entries, "params", true);
    expect(byParams[0]!.id).toBe("zai-org/glm-5.3-flash");
    expect(filterEntries(entries, { family: "Llama" })).toHaveLength(1);
    expect(filterEntries(entries, { query: "kda" })[0]!.id).toBe("zai-org/glm-5.3-flash");
    expect(families(entries)).toEqual(["GLM", "Llama"]);
  });
});

describe("genome", () => {
  it("encodes per-layer attention/ffn and roles", () => {
    const g = buildGenome(docs[1]!);
    expect(g.numLayers).toBe(45);
    expect(genomeCellRole(g.layers[0]!)).toBe("state"); // KDA
    expect(genomeCellRole(g.layers[40]!)).toBe("compute"); // MoE
    expect(g.layers[40]!.attention).toBe("MLA/DSA");
  });
});

describe("compareModels", () => {
  it("aligns genomes to the longer model and flags differing columns", () => {
    const genomeA = buildGenome(docs[1]!);
    const genomeB = buildGenome(docs[0]!);
    const result = compareModels(
      { entry: entries[0]!, genome: genomeA },
      { entry: entries[1]!, genome: genomeB },
    );
    expect(result.genome.numLayers).toBe(45);
    expect(result.genome.aLayers).toHaveLength(45);
    expect(result.genome.bLayers[40]).toBeNull(); // llama padded
    expect(result.genome.attentionDiffer).toBeGreaterThan(0);
    const layersRow = result.fieldRows.find((r) => r.field === "Layers")!;
    expect(layersRow.shared).toBe(false);
  });
});
