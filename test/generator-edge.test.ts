/**
 * The edge cases of the derivation of a generator (#34; docs/generator-h.md): long
 * messages, views with an offset, the refusal of a small multiple of `g`, malformed
 * encodings and parameters out of range. Long inputs are cross-checked against
 * `@noble/curves`, which implements `hash_to_ristretto255` apart from our code.
 * The same file runs in Node.js and in every headless browser.
 */
import { expand_message_xmd } from "@noble/curves/abstract/hash-to-curve.js";
import { ristretto255, ristretto255_hasher } from "@noble/curves/ed25519.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { describe, expect, test } from "vitest";
import {
  GENERATOR_DST,
  SMALL_EXPONENT_BITS,
  deriveGenerator,
  deriveGeneratorSteps,
  deriveStepsWith,
  elementDerivation,
  expandMessageXmd,
  findSmallExponent,
  verifyGenerator,
  verifyWith,
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
const dst = ascii(GENERATOR_DST);
const age = vectors.vectors.find((vector) => vector.name === "age-check");
if (age === undefined) throw new Error("the age-check vector is missing");

/** A message of `length` bytes, not all equal. */
function longMessage(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (i * 7 + 3) & 0xff);
}

/** The same bytes, as a view with an offset into a larger buffer. */
function offsetView(bytes: Uint8Array, offset = 5): Uint8Array {
  const buffer = new Uint8Array(bytes.length + offset + 3).fill(0xa5);
  buffer.set(bytes, offset);
  return buffer.subarray(offset, offset + bytes.length);
}

/** An element derivation that returns `h`, whatever its input. */
function injected(h: Uint8Array) {
  return () => ({ p0: h, p1: h, h });
}

describe("long messages", () => {
  test.each([256, 65537])("%i bytes: h is noble's hash_to_ristretto255", async (length) => {
    const message = longMessage(length);
    const h = await deriveGenerator(message);
    const noble = ristretto255_hasher.hashToCurve(message, { DST: GENERATOR_DST });
    expect(hex(h)).toBe(hex(noble.toBytes()));
  });

  test.each([256, 65537])("%i bytes: expandMessageXmd is noble's", async (length) => {
    const message = longMessage(length);
    const out = await expandMessageXmd(message, dst, 64);
    expect(hex(out)).toBe(hex(expand_message_xmd(message, dst, 64, sha512)));
  });
});

describe("views with an offset", () => {
  test("a message view derives the h of its bytes", async () => {
    expect(hex(await deriveGenerator(offsetView(ascii(age.message))))).toBe(age.h);
  });

  test("an encoding view is verified as its bytes", async () => {
    const view = offsetView(fromHex(age.h));
    expect(await verifyGenerator(ascii(age.message), view)).toBe(true);
  });

  test("elementDerivation reads a view of 64 bytes", () => {
    expect(hex(elementDerivation(offsetView(fromHex(age.uniform))).h)).toBe(age.h);
  });

  test("expandMessageXmd reads views of msg and dst", async () => {
    const out = await expandMessageXmd(offsetView(ascii(age.message)), offsetView(dst), 64);
    expect(hex(out)).toBe(age.uniform);
  });

  test("findSmallExponent reads a view of the encoding", () => {
    const planted = vectors.smallExponents.refused.find((entry) => entry.x === "12345");
    expect(planted).toBeDefined();
    const view = offsetView(fromHex(planted?.encoding ?? ""));
    expect(findSmallExponent(view, SMALL_EXPONENT_BITS)).toBe(12345n);
  });
});

describe("the refusal of a small multiple of g", () => {
  test.each(vectors.smallExponents.refused)(
    "an injected x·g with x = $x is a RangeError",
    async (planted) => {
      const derive = deriveStepsWith(ascii("abc"), injected(fromHex(planted.encoding)));
      await expect(derive).rejects.toBeInstanceOf(RangeError);
    },
  );

  test.each(vectors.smallExponents.refused)(
    "verifyGenerator is false when x = $x is injected, even for that encoding",
    async (planted) => {
      const encoding = fromHex(planted.encoding);
      expect(await verifyWith(ascii("abc"), encoding, injected(encoding))).toBe(false);
    },
  );

  test.each(vectors.smallExponents.accepted)(
    "an injected x·g with x = $x is kept",
    async (planted) => {
      const steps = await deriveStepsWith(ascii("abc"), injected(fromHex(planted.encoding)));
      expect(hex(steps.h)).toBe(planted.encoding);
    },
  );
});

describe("verifyGenerator", () => {
  test.each(rfc.invalidEncodings.encodings)("is false for the invalid encoding %s", async (bad) => {
    expect(await verifyGenerator(ascii(age.message), fromHex(bad))).toBe(false);
  });

  test("is false for the non-canonical encoding of h by p − s", async () => {
    // s and p − s decode to the same element; RFC 9496 accepts only the even one.
    const p = 2n ** 255n - 19n;
    const h = fromHex(age.h);
    let s = 0n;
    for (let i = 31; i >= 0; i--) s = (s << 8n) | BigInt(h[i] ?? 0);
    let negated = p - s;
    const other = new Uint8Array(32);
    for (let i = 0; i < 32; i++, negated >>= 8n) other[i] = Number(negated & 0xffn);
    expect(() => ristretto255.Point.fromBytes(other)).toThrow();
    expect(await verifyGenerator(ascii(age.message), other)).toBe(false);
  });

  test("is false for 33 bytes and for no bytes", async () => {
    const h = fromHex(age.h);
    expect(await verifyGenerator(ascii(age.message), Uint8Array.of(...h, 0))).toBe(false);
    expect(await verifyGenerator(ascii(age.message), new Uint8Array())).toBe(false);
  });

  test("verifies the encoding as it was at the call, not as it is changed later", async () => {
    const message = ascii(age.message);
    const right = fromHex(age.h);
    const pendingRight = verifyGenerator(message, right);
    right.fill(0);
    const wrong = new Uint8Array(32);
    const pendingWrong = verifyGenerator(message, wrong);
    wrong.set(fromHex(age.h));
    expect(await pendingRight).toBe(true);
    expect(await pendingWrong).toBe(false);
  });

  test("refuses a long encoding without copying it: its time does not grow with its length", async () => {
    // The reference is the time of `times` copies of the long encoding, measured on this
    // machine: `times` doubles until that time is well above the resolution of the
    // clock. A verifyGenerator that copies before it checks the length takes at least
    // as long for as many calls; one that checks first takes a small fraction of it.
    const message = ascii(age.message);
    const long = new Uint8Array(1024 * 1024).fill(0xa5);
    const enough = 25; // milliseconds: 25 times the coarsest clock of a browser
    const fastest = (run: () => unknown, times: number): number => {
      let best = Infinity;
      for (let attempt = 0; attempt < 3; attempt++) {
        const start = performance.now();
        for (let i = 0; i < times; i++) run();
        best = Math.min(best, performance.now() - start);
      }
      return best;
    };
    const copies: Uint8Array[] = [];
    const copyOnce = () => (copies[0] = long.slice());
    let times = 1;
    let copy = fastest(copyOnce, times);
    while (copy < enough && times < 2 ** 16) {
      times *= 2;
      copy = fastest(copyOnce, times);
    }
    const results: Promise<boolean>[] = [];
    const call = fastest(() => results.push(verifyGenerator(message, long)), times);
    expect(await Promise.all(results)).toEqual(results.map(() => false));
    expect(copy).toBeGreaterThanOrEqual(enough);
    expect(call).toBeLessThan(copy / 4);
  });

  test("verifies the message as it was at the call, not as it is changed later", async () => {
    const message = ascii(age.message);
    const pending = verifyGenerator(message, fromHex(age.h));
    message.fill(0);
    expect(await pending).toBe(true);
  });

  test("rejects with a TypeError an encoding or a message that is not a Uint8Array", async () => {
    const message = ascii(age.message);
    await expect(verifyGenerator(message, age.h as never)).rejects.toBeInstanceOf(TypeError);
    await expect(verifyGenerator(age.message as never, fromHex(age.h))).rejects.toBeInstanceOf(
      TypeError,
    );
  });
});

describe("the inputs of the derivation", () => {
  test.each([
    ["a string", "abc"],
    ["an ArrayBuffer", new ArrayBuffer(3)],
    ["an array of numbers", [97, 98, 99]],
    ["undefined", undefined],
  ])("a message that is %s is a TypeError", async (_, message) => {
    await expect(deriveGeneratorSteps(message as never)).rejects.toBeInstanceOf(TypeError);
  });

  test("each call returns new arrays", async () => {
    const message = ascii(age.message);
    const first = await deriveGeneratorSteps(message);
    first.h.fill(0);
    first.dst.fill(0);
    const second = await deriveGeneratorSteps(message);
    expect(hex(second.h)).toBe(age.h);
    expect(hex(second.dst)).toBe(vectors.dstHex);
  });

  test("elementDerivation refuses a length other than 64 with a RangeError", () => {
    expect(() => elementDerivation(new Uint8Array(63))).toThrow(RangeError);
    expect(() => elementDerivation(new Uint8Array(65))).toThrow(RangeError);
  });
});

describe("expandMessageXmd: parameters out of range", () => {
  test.each([0, 1.5, 255 * 64 + 1, 65536])("lenInBytes %s is a RangeError", async (length) => {
    await expect(expandMessageXmd(ascii("abc"), dst, length)).rejects.toBeInstanceOf(RangeError);
  });

  test("lenInBytes 255 × 64 is the longest output", async () => {
    const out = await expandMessageXmd(ascii("abc"), dst, 255 * 64);
    expect(out.length).toBe(255 * 64);
    expect(hex(out)).toBe(hex(expand_message_xmd(ascii("abc"), dst, 255 * 64, sha512)));
  });

  test("a dst of 256 bytes is a RangeError, and one of 255 bytes is not", async () => {
    const tag = (length: number) => new Uint8Array(length).fill(0x41);
    await expect(expandMessageXmd(ascii("abc"), tag(256), 64)).rejects.toBeInstanceOf(RangeError);
    const out = await expandMessageXmd(ascii("abc"), tag(255), 64);
    expect(hex(out)).toBe(hex(expand_message_xmd(ascii("abc"), tag(255), 64, sha512)));
  });
});

describe("findSmallExponent: other bounds and bad inputs", () => {
  const multiple = (x: bigint): Uint8Array => {
    const g = ristretto255.Point.BASE;
    if (x === 0n) return ristretto255.Point.ZERO.toBytes();
    return x > 0n ? g.multiply(x).toBytes() : g.multiply(-x).negate().toBytes();
  };

  test.each([
    [0, 0n, 0n],
    [0, 1n, 1n],
    [0, -1n, -1n],
    [0, 2n, null],
    [1, -2n, -2n],
    [1, 3n, null],
    [20, 2n ** 20n, 2n ** 20n],
    [20, -(2n ** 20n), -(2n ** 20n)],
    [20, 2n ** 20n + 1n, null],
  ])("bits %i: x = %s gives %s", (bits, x, expected) => {
    expect(findSmallExponent(multiple(x), bits)).toBe(expected);
  });

  test.each([-1, 33, 1.5, Number.NaN])("bits %s is a RangeError", (bits) => {
    expect(() => findSmallExponent(multiple(1n), bits)).toThrow(RangeError);
  });

  test.each(rfc.invalidEncodings.encodings)("the invalid encoding %s is a TypeError", (bad) => {
    expect(() => findSmallExponent(fromHex(bad), SMALL_EXPONENT_BITS)).toThrow(TypeError);
  });

  test("an encoding of 31 bytes is a TypeError", () => {
    expect(() => findSmallExponent(new Uint8Array(31), SMALL_EXPONENT_BITS)).toThrow(TypeError);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #37    | new: the edge cases of the derivation of h (#34)              |
