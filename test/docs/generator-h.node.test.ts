/**
 * The published values of docs/generator-h.md are the values the code derives (#34):
 * the tag, and every stage of each vector. A change to the derivation that is not
 * published, or a published value that the code does not produce, fails here.
 */
import { expect, test } from "vitest";
import { GENERATOR_DST, deriveGeneratorSteps } from "../helpers/generator.js";
import vectors from "../vectors/generator-h.json" with { type: "json" };
import { read } from "./markdown.js";

const page = read("docs/generator-h.md");

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

test("docs/generator-h.md quotes GENERATOR_DST, in text and in hex", () => {
  expect(page).toContain(GENERATOR_DST);
  expect(page).toContain(hex(new TextEncoder().encode(GENERATOR_DST)));
});

test.each(vectors.vectors)(
  "docs/generator-h.md quotes every stage of vector $name, as derived",
  async (vector) => {
    const steps = await deriveGeneratorSteps(new TextEncoder().encode(vector.message));
    const at = page.indexOf(`### Vector ${vector.name}\n`);
    expect(at).toBeGreaterThan(-1);
    const section = page.slice(at);
    for (const value of [steps.uniform, steps.p0, steps.p1, steps.h]) {
      expect(section).toContain(hex(value));
    }
    expect(page).toContain(`${vector.name}: h = ${hex(steps.h)}`);
  },
);

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #37    | new: the published values of h are the derived ones (#34)     |
// | #38    | imports the fixture of the API of #34 (#35)                   |
