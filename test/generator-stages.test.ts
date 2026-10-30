/**
 * The stages of the derivation of a generator (#34; docs/generator-h.md), each against
 * its official vectors: `expand_message_xmd` with SHA-512 (RFC 9380, Appendix K.3) and
 * the element derivation of RFC 9496 (Appendix A.3), cross-checked against
 * `@noble/curves`; and the small-exponent search, on planted multiples of `g`.
 * These functions are exported by src/core/generator.ts for the tests, not by the
 * entry point.
 */
import { ristretto255_hasher } from "@noble/curves/ed25519.js";
import { describe, expect, test } from "vitest";
import {
  SMALL_EXPONENT_BITS,
  elementDerivation,
  expandMessageXmd,
  findSmallExponent,
} from "../src/core/generator.js";
import vectors from "./vectors/generator-h.json" with { type: "json" };
import rfc from "./vectors/rfc9380-rfc9496.json" with { type: "json" };

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("expandMessageXmd", () => {
  const xmd = rfc.expandMessageXmdSha512;
  test.each(xmd.vectors)(
    "RFC 9380 K.3: msg of $msg.length bytes, $lenInBytes bytes out",
    async (vector) => {
      const out = await expandMessageXmd(ascii(vector.msg), ascii(xmd.dst), vector.lenInBytes);
      expect(hex(out)).toBe(vector.uniformBytes);
    },
  );
});

describe("elementDerivation", () => {
  test.each(rfc.elementDerivation.vectors)("RFC 9496 A.3: $output", (vector) => {
    expect(hex(elementDerivation(fromHex(vector.input)).h)).toBe(vector.output);
  });

  test.each(vectors.vectors)("$name: MAP of each half, and their sum as noble's", (vector) => {
    const uniform = fromHex(vector.uniform);
    const derived = elementDerivation(uniform);
    expect(hex(derived.p0)).toBe(vector.p0);
    expect(hex(derived.p1)).toBe(vector.p1);
    expect(hex(derived.h)).toBe(vector.h);
    const noble = ristretto255_hasher.deriveToCurve?.(uniform);
    expect(noble).toBeDefined();
    expect(hex(derived.h)).toBe(hex(noble?.toBytes() ?? new Uint8Array()));
  });
});

describe("findSmallExponent", () => {
  test("the bound of the shipped check is 2^16", () => {
    expect(SMALL_EXPONENT_BITS).toBe(16);
    expect(vectors.smallExponentBits).toBe(SMALL_EXPONENT_BITS);
  });

  test.each(vectors.smallExponents.refused)("finds the planted x = $x", (planted) => {
    expect(findSmallExponent(fromHex(planted.encoding), SMALL_EXPONENT_BITS)).toBe(
      BigInt(planted.x),
    );
  });

  test.each(vectors.smallExponents.accepted)("finds nothing for x = $x", (planted) => {
    expect(findSmallExponent(fromHex(planted.encoding), SMALL_EXPONENT_BITS)).toBeNull();
  });

  test.each(vectors.vectors)("$name: h is not a small multiple of g", (vector) => {
    expect(findSmallExponent(fromHex(vector.h), SMALL_EXPONENT_BITS)).toBeNull();
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #34    | new: the stages of the derivation of h, against the RFCs      |
