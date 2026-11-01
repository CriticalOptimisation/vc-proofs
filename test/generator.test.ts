/**
 * The derivation of a generator (#34; docs/generator-h.md): `hash_to_ristretto255` of
 * RFC 9380, Appendix B, under `GENERATOR_DST`. The vectors come from
 * tools/generator-h/reference.py, a Python and libsodium implementation written apart
 * from the code under test. The same file runs in Node.js and in every headless browser.
 *
 * Since #35, the derivation is `RistrettoElement.deriveGenerator`, and the API of #34
 * that this file tests is rebuilt on it by the fixture test/helpers/generator.ts.
 */
import { ristretto255 } from "@noble/curves/ed25519.js";
import { describe, expect, test } from "vitest";
import * as fixture from "./helpers/generator.js";
import vectors from "./vectors/generator-h.json" with { type: "json" };

interface Steps {
  dst: Uint8Array;
  uniform: Uint8Array;
  p0: Uint8Array;
  p1: Uint8Array;
  h: Uint8Array;
}

const api = fixture as Record<string, unknown>;
const GENERATOR_DST = api.GENERATOR_DST as string;
const deriveGenerator = api.deriveGenerator as (message: unknown) => Promise<Uint8Array>;
const deriveGeneratorSteps = api.deriveGeneratorSteps as (message: unknown) => Promise<Steps>;
const verifyGenerator = api.verifyGenerator as (
  message: unknown,
  encoding: unknown,
) => Promise<boolean>;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("the derivation of a generator", () => {
  // REVIEW PLACEHOLDER (#35): the low-level entry point no longer exports these names.
  // is exported by the low-level entry point -> test/tooling/package.node.test.ts:
  //   "@criticaloptimisation/vc-proofs/core exports exactly [...]" (RistrettoElement,
  //   RistrettoScalar, requestHash), and test/ristretto.test.ts: "deriveGenerator ...".
  // test("is exported by the low-level entry point", () => {
  //   expect(typeof GENERATOR_DST).toBe("string");
  //   expect(typeof deriveGenerator).toBe("function");
  //   expect(typeof deriveGeneratorSteps).toBe("function");
  //   expect(typeof verifyGenerator).toBe("function");
  // });

  test("GENERATOR_DST is the 60 ASCII bytes of the published tag", () => {
    expect(GENERATOR_DST).toBe(vectors.dst);
    expect(GENERATOR_DST).toBe("vc-proofs-V01-CS01-with-ristretto255_XMD:SHA-512_R255MAP_RO_");
    expect(ascii(GENERATOR_DST).length).toBe(60);
    expect(hex(ascii(GENERATOR_DST))).toBe(vectors.dstHex);
  });

  test.each(vectors.vectors)("$name: every stage matches the vector", async (vector) => {
    const steps = await deriveGeneratorSteps(fromHex(vector.messageHex));
    expect(hex(steps.dst)).toBe(vectors.dstHex);
    expect(hex(steps.uniform)).toBe(vector.uniform);
    expect(hex(steps.p0)).toBe(vector.p0);
    expect(hex(steps.p1)).toBe(vector.p1);
    expect(hex(steps.h)).toBe(vector.h);
  });

  test.each(vectors.vectors)("$name: deriveGenerator returns the 32 bytes of h", async (vector) => {
    const h = await deriveGenerator(ascii(vector.message));
    expect(h).toBeInstanceOf(Uint8Array);
    expect(h.length).toBe(32);
    expect(hex(h)).toBe(vector.h);
  });

  test.each(vectors.vectors)(
    "$name: h is a canonical encoding of an element other than the identity",
    async (vector) => {
      const h = await deriveGenerator(ascii(vector.message));
      const point = ristretto255.Point.fromBytes(h);
      expect(hex(point.toBytes())).toBe(hex(h));
      expect(point.is0()).toBe(false);
      expect(point.equals(ristretto255.Point.BASE)).toBe(false);
    },
  );

  test.each(vectors.vectors)(
    "$name: verifyGenerator accepts h and refuses any other encoding",
    async (vector) => {
      const message = ascii(vector.message);
      const h = fromHex(vector.h);
      expect(await verifyGenerator(message, h)).toBe(true);

      const flipped = h.slice();
      flipped[0] = (flipped[0] ?? 0) ^ 0x02;
      expect(await verifyGenerator(message, flipped)).toBe(false);
      expect(await verifyGenerator(ascii(`${vector.message}.`), h)).toBe(false);
      expect(await verifyGenerator(message, h.subarray(0, 31))).toBe(false);
    },
  );

  test("a message that is not a Uint8Array is a TypeError", async () => {
    await expect(deriveGenerator("abc")).rejects.toBeInstanceOf(TypeError);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #37    | new: the vectors of the derivation of h, on every runtime (#34) |
// | #38    | through the fixture; the entry-point case is a placeholder (#35) |
