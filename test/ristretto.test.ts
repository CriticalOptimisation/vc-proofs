/**
 * `RistrettoElement` and `RistrettoScalar` (#35; docs/core/ristretto255.md), against the
 * vectors of RFC 9496, Appendix A, and the published vectors of the generator h. Every
 * expected value comes from the text of an RFC or from test/vectors/generator-h.json,
 * which libsodium cross-checks. The same file runs in Node.js and in every headless
 * browser.
 */
import { describe, expect, test } from "vitest";
import { RistrettoElement, RistrettoScalar } from "../src/core/index.js";
import { deriveGeneratorWith } from "../src/core/ristretto.js";
import vectors from "./vectors/generator-h.json" with { type: "json" };
import rfc from "./vectors/rfc9380-rfc9496.json" with { type: "json" };

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** The 32-byte little-endian encoding of a non-negative integer. */
function le32(n: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++, n >>= 8n) out[i] = Number(n & 0xffn);
  return out;
}

const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const g = () => RistrettoElement.canonicalGenerator();
const scalar = (n: bigint) => RistrettoScalar.fromBigInt(n);
const multiples = rfc.multiplesOfGenerator.encodings;

describe("RistrettoElement: RFC 9496, Appendix A", () => {
  test.each(multiples.map((encoding, k) => [k, encoding] as const))(
    "A.1: %i·g by multiplyScalar",
    (k, encoding) => {
      expect(
        hex(
          g()
            .multiplyScalar(scalar(BigInt(k)))
            .encode(),
        ),
      ).toBe(encoding);
    },
  );

  test("A.1: k·g by k additions, from the identity", () => {
    let sum = RistrettoElement.identity();
    for (const encoding of multiples) {
      expect(hex(sum.encode())).toBe(encoding);
      sum = sum.add(g());
    }
  });

  test.each(multiples)("A.1: decode(%s) encodes back to the same bytes", (encoding) => {
    expect(hex(RistrettoElement.decode(fromHex(encoding)).encode())).toBe(encoding);
  });

  test("the canonical generator is 1·g of A.1", () => {
    expect(hex(g().encode())).toBe(multiples[1]);
  });

  test.each(rfc.invalidEncodings.encodings)("A.2: decode(%s) is a TypeError", (bad) => {
    expect(() => RistrettoElement.decode(fromHex(bad))).toThrow(TypeError);
  });

  test.each(rfc.elementDerivation.vectors)("A.3: fromUniformBytes gives $output", (vector) => {
    expect(hex(RistrettoElement.fromUniformBytes(fromHex(vector.input)).encode())).toBe(
      vector.output,
    );
  });
});

describe("RistrettoElement: the group operations", () => {
  const p = () => RistrettoElement.decode(fromHex(multiples[5] ?? ""));
  const q = () => RistrettoElement.decode(fromHex(multiples[3] ?? ""));

  test("5·g + 3·g = 8·g, 5·g − 3·g = 2·g, −(3·g) + 5·g = 2·g", () => {
    expect(hex(p().add(q()).encode())).toBe(multiples[8]);
    expect(hex(p().subtract(q()).encode())).toBe(multiples[2]);
    expect(hex(q().negate().add(p()).encode())).toBe(multiples[2]);
  });

  test("equals tells elements apart, and holds for one element decoded twice", () => {
    expect(p().equals(p())).toBe(true);
    expect(p().equals(q())).toBe(false);
    expect(g().multiplyScalar(scalar(8n)).equals(p().add(q()))).toBe(true);
  });

  test("3·(5·g) = 15·g", () => {
    expect(hex(p().multiplyScalar(scalar(3n)).encode())).toBe(multiples[15]);
  });

  test("encode returns a new array each time", () => {
    const element = p();
    element.encode().fill(0);
    expect(hex(element.encode())).toBe(multiples[5]);
  });
});

describe("RistrettoElement: the identity", () => {
  const zeros = new Uint8Array(32);

  test("decode accepts the 32 zero bytes, and isIdentity tells it apart", () => {
    const identity = RistrettoElement.decode(zeros);
    expect(identity.isIdentity()).toBe(true);
    expect(identity.equals(RistrettoElement.identity())).toBe(true);
    expect(g().isIdentity()).toBe(false);
  });

  test("identity() encodes as 32 zero bytes", () => {
    expect(hex(RistrettoElement.identity().encode())).toBe(hex(zeros));
  });

  test("0·P, P − P and P + (−P) are the identity", () => {
    const p = g().multiplyScalar(scalar(7n));
    expect(p.multiplyScalar(scalar(0n)).isIdentity()).toBe(true);
    expect(p.subtract(p).isIdentity()).toBe(true);
    expect(p.add(p.negate()).isIdentity()).toBe(true);
  });
});

describe("RistrettoElement.hashToGroup", () => {
  test.each(vectors.vectors)(
    "$name: hashToGroup(message, GENERATOR_DST) is the published h",
    async (vector) => {
      const element = await RistrettoElement.hashToGroup(
        ascii(vector.message),
        ascii(RistrettoElement.GENERATOR_DST),
      );
      expect(hex(element.encode())).toBe(vector.h);
    },
  );

  test.each(vectors.vectors)(
    "$name: hashToGroup is fromUniformBytes of expand_message_xmd",
    async (vector) => {
      const element = await RistrettoElement.hashToGroup(
        ascii(vector.message),
        ascii(RistrettoElement.GENERATOR_DST),
      );
      expect(element.equals(RistrettoElement.fromUniformBytes(fromHex(vector.uniform)))).toBe(true);
    },
  );

  test("an empty dst is a RangeError", async () => {
    await expect(RistrettoElement.hashToGroup(ascii("abc"), new Uint8Array())).rejects.toThrow(
      RangeError,
    );
  });

  test("a dst of 256 bytes is a RangeError that says the reduction is not yet implemented", async () => {
    const pending = RistrettoElement.hashToGroup(ascii("abc"), new Uint8Array(256).fill(0x41));
    await expect(pending).rejects.toThrow(RangeError);
    await expect(pending).rejects.toThrow(/not yet implemented/);
    await expect(pending).rejects.toThrow(/5\.3\.3/);
  });
});

describe("RistrettoElement.deriveGenerator", () => {
  test("GENERATOR_DST is the published tag", () => {
    expect(RistrettoElement.GENERATOR_DST).toBe(vectors.dst);
    expect(hex(ascii(RistrettoElement.GENERATOR_DST))).toBe(vectors.dstHex);
  });

  test.each(vectors.vectors)("$name: deriveGenerator gives the published h", async (vector) => {
    const h = await RistrettoElement.deriveGenerator(ascii(vector.message));
    expect(h).toBeInstanceOf(RistrettoElement);
    expect(hex(h.encode())).toBe(vector.h);
  });

  test.each(vectors.vectors)(
    "$name: the published h is checked by deriving it and comparing with equals",
    async (vector) => {
      const published = RistrettoElement.decode(fromHex(vector.h));
      const derived = await RistrettoElement.deriveGenerator(ascii(vector.message));
      expect(derived.equals(published)).toBe(true);
      const other = await RistrettoElement.deriveGenerator(ascii(`${vector.message}.`));
      expect(other.equals(published)).toBe(false);
    },
  );

  test.each(vectors.smallExponents.refused)(
    "an injected x·g with x = $x is refused with a RangeError",
    async (planted) => {
      const injected = () => RistrettoElement.decode(fromHex(planted.encoding));
      await expect(deriveGeneratorWith(ascii("abc"), injected)).rejects.toThrow(RangeError);
    },
  );

  test.each(vectors.smallExponents.accepted)(
    "an injected x·g with x = $x is kept",
    async (planted) => {
      const injected = () => RistrettoElement.decode(fromHex(planted.encoding));
      const element = await deriveGeneratorWith(ascii("abc"), injected);
      expect(hex(element.encode())).toBe(planted.encoding);
    },
  );

  test("a message that is not a Uint8Array is a TypeError", async () => {
    await expect(RistrettoElement.deriveGenerator("abc" as never)).rejects.toThrow(TypeError);
  });
});

describe("RistrettoScalar", () => {
  test("decode and encode: 7 round-trips, ℓ − 1 is canonical", () => {
    expect(hex(RistrettoScalar.decode(le32(7n)).encode())).toBe(hex(le32(7n)));
    expect(hex(RistrettoScalar.decode(le32(L - 1n)).encode())).toBe(hex(le32(L - 1n)));
  });

  test("decode refuses ℓ, a non-canonical encoding, with a TypeError", () => {
    expect(() => RistrettoScalar.decode(le32(L))).toThrow(TypeError);
  });

  test("fromBigInt(−1n) is ℓ − 1, and fromBigInt reduces mod ℓ", () => {
    expect(hex(scalar(-1n).encode())).toBe(hex(le32(L - 1n)));
    expect(scalar(-1n).add(scalar(1n)).isZero()).toBe(true);
  });

  test("fromBigInt refuses |n| = 2^251 with a RangeError, and accepts 2^251 − 1", () => {
    expect(() => scalar(2n ** 251n)).toThrow(RangeError);
    expect(() => scalar(-(2n ** 251n))).toThrow(RangeError);
    expect(hex(scalar(2n ** 251n - 1n).encode())).toBe(hex(le32(2n ** 251n - 1n)));
  });

  test("fromUniformBytes reads 64 bytes little-endian and reduces mod ℓ", () => {
    const bytes = new Uint8Array(64);
    bytes.set(le32(L + 5n));
    expect(hex(RistrettoScalar.fromUniformBytes(bytes).encode())).toBe(hex(le32(5n)));
  });

  test("the field arithmetic: 6 + 7, 6 − 7, 6 · 7, −6", () => {
    expect(scalar(6n).add(scalar(7n)).equals(scalar(13n))).toBe(true);
    expect(scalar(6n).subtract(scalar(7n)).equals(scalar(-1n))).toBe(true);
    expect(scalar(6n).multiply(scalar(7n)).equals(scalar(42n))).toBe(true);
    expect(scalar(6n).negate().equals(scalar(-6n))).toBe(true);
  });

  test("a · a⁻¹ = 1", () => {
    for (const a of [scalar(2n), scalar(-12345n), RistrettoScalar.random()]) {
      expect(a.multiply(a.invert()).equals(scalar(1n))).toBe(true);
    }
  });

  test("invert of zero is a RangeError", () => {
    expect(() => scalar(0n).invert()).toThrow(RangeError);
  });

  test("random scalars differ, and are canonical", () => {
    const a = RistrettoScalar.random();
    const b = RistrettoScalar.random();
    expect(a.equals(b)).toBe(false);
    expect(hex(RistrettoScalar.decode(a.encode()).encode())).toBe(hex(a.encode()));
  });

  test("encode returns a new array each time", () => {
    const seven = scalar(7n);
    seven.encode().fill(0xff);
    expect(hex(seven.encode())).toBe(hex(le32(7n)));
  });

  test("the scalar arithmetic agrees with the group: (a + b)·g = a·g + b·g", () => {
    const a = scalar(5n);
    const b = scalar(-3n);
    expect(
      g()
        .multiplyScalar(a.add(b))
        .equals(g().multiplyScalar(a).add(g().multiplyScalar(b))),
    ).toBe(true);
    expect(hex(g().multiplyScalar(a.add(b)).encode())).toBe(multiples[2]);
  });
});
