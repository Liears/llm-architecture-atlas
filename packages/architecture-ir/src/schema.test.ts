import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import type { ModelDocument } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const schema = JSON.parse(
  readFileSync(resolve(root, "packages/architecture-ir/schema/architecture-ir.schema.json"), "utf8"),
) as object;
const example = JSON.parse(
  readFileSync(resolve(root, "tests/fixtures/ir/glm-5.3-flash.example.json"), "utf8"),
) as ModelDocument;

const ajv = new Ajv2020({ strict: false, allErrors: true });
const validate = ajv.compile<ModelDocument>(schema);

describe("architecture-ir schema", () => {
  it("validates the GLM-5.3-Flash example document", () => {
    const ok = validate(example);
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
    expect(example.topology.attention_groups).toHaveLength(2);
    expect(example.facts.num_hidden_layers).toBe(45);
  });

  it("rejects documents with unknown claim status", () => {
    const bad = structuredClone(example);
    bad.claims = [{ path: "facts.vocab_size", value: 1, status: "guessed" as never }];
    expect(validate(bad)).toBe(false);
  });

  it("rejects documents with a wrong ir_version", () => {
    const bad = structuredClone(example);
    bad.ir_version = "9.9.9";
    expect(validate(bad)).toBe(false);
  });
});
