/**
 * `RistrettoElement` and its scalars, which are bigints (#35; docs/core/ristretto255.md),
 * with the scalar members that need the order ℓ (ORDER, encodeScalar, decodeScalar,
 * invertScalar) and the value of a BoundedInt (docs/core/bounded-int.md), against the
 * vectors of RFC 9496, Appendix A, and the published vectors of the generator h. Every
 * expected value comes from the text of an RFC or from test/vectors/generator-h.json,
 * which libsodium cross-checks. The same file runs in Node.js and in every headless
 * browser.
 */
import { describe, expect, expectTypeOf, test } from "vitest";
import { BoundedInt, RistrettoElement } from "../src/core/index.js";
import { deriveGeneratorWith } from "../src/core/ristretto.js";
import vectors from "./vectors/generator-h.json" with { type: "json" };
import rfc from "./vectors/rfc9380-rfc9496.json" with { type: "json" };

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** The 32-byte little-endian encoding of a non-negative integer below 2^256. */
function le32(n: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++, n >>= 8n) out[i] = Number(n & 0xffn);
  return out;
}

const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const g = () => RistrettoElement.canonicalGenerator();
const multiples = rfc.multiplesOfGenerator.encodings;

describe("RistrettoElement: RFC 9496, Appendix A", () => {
  test.each(multiples.map((encoding, k) => [k, encoding] as const))(
    "A.1: %i·g by multiplyScalar",
    (k, encoding) => {
      expect(hex(g().multiplyScalar(BigInt(k)).encode())).toBe(encoding);
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
    expect(g().multiplyScalar(8n).equals(p().add(q()))).toBe(true);
  });

  test("3·(5·g) = 15·g", () => {
    expect(hex(p().multiplyScalar(3n).encode())).toBe(multiples[15]);
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
    const p = g().multiplyScalar(7n);
    expect(p.multiplyScalar(0n).isIdentity()).toBe(true);
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

describe("Scalars are bigints", () => {
  test("RistrettoElement has no Scalar, and the entry point no RistrettoScalar", async () => {
    expect("Scalar" in RistrettoElement).toBe(false);
    const entryPoint = (await import("../src/core/index.js")) as Record<string, unknown>;
    expect(entryPoint.RistrettoScalar).toBeUndefined();
  });

  test("(−1)·g = (ℓ − 1)·g = −g: multiplyScalar reduces mod ℓ", () => {
    expect(g().multiplyScalar(-1n).equals(g().negate())).toBe(true);
    expect(
      g()
        .multiplyScalar(L - 1n)
        .equals(g().negate()),
    ).toBe(true);
    expect(g().multiplyScalar(-1n).add(g()).isIdentity()).toBe(true);
  });

  test("multiplyScalar takes any integer: ±2^251, ±ℓ and 2^300 are reduced mod ℓ", () => {
    const p = RistrettoElement.decode(fromHex(multiples[3] ?? ""));
    for (const n of [2n ** 251n, -(2n ** 251n), 2n ** 300n, -(2n ** 300n)]) {
      const reduced = ((n % L) + L) % L;
      expect(p.multiplyScalar(n).equals(p.multiplyScalar(reduced)), String(n)).toBe(true);
    }
    expect(p.multiplyScalar(L).isIdentity()).toBe(true);
    expect(p.multiplyScalar(-L).isIdentity()).toBe(true);
  });

  test("(ℓ + 5)·g = 5·g", () => {
    expect(
      hex(
        g()
          .multiplyScalar(L + 5n)
          .encode(),
      ),
    ).toBe(multiples[5]);
    expect(
      hex(
        g()
          .multiplyScalar(5n - 7n * L)
          .encode(),
      ),
    ).toBe(multiples[5]);
  });

  test("the bigint arithmetic agrees with the group: (6 + 7)·g, (6 − 7)·g, (2 · 7)·g, (−6)·g", () => {
    expect(
      hex(
        g()
          .multiplyScalar(6n + 7n)
          .encode(),
      ),
    ).toBe(multiples[13]);
    expect(
      g()
        .multiplyScalar(6n - 7n)
        .equals(g().negate()),
    ).toBe(true);
    expect(
      hex(
        g()
          .multiplyScalar(2n * 7n)
          .encode(),
      ),
    ).toBe(multiples[14]);
    expect(g().multiplyScalar(-6n).equals(g().multiplyScalar(6n).negate())).toBe(true);
  });

  test("the bigint arithmetic agrees with the group: (a + b)·g = a·g + b·g", () => {
    const a = 5n;
    const b = -3n;
    expect(
      g()
        .multiplyScalar(a + b)
        .equals(g().multiplyScalar(a).add(g().multiplyScalar(b))),
    ).toBe(true);
    expect(
      hex(
        g()
          .multiplyScalar(a + b)
          .encode(),
      ),
    ).toBe(multiples[2]);
  });

  test("randomScalar gives distinct bigints from 0 to ℓ − 1", () => {
    const draws = Array.from({ length: 8 }, () => RistrettoElement.randomScalar());
    for (const draw of draws) {
      expect(typeof draw).toBe("bigint");
      expect(draw >= 0n && draw < L).toBe(true);
    }
    expect(new Set(draws).size).toBe(draws.length);
  });
});

describe("The scalar members of RistrettoElement", () => {
  const reduce = (n: bigint) => ((n % L) + L) % L;

  test("ORDER is ℓ, a bigint", () => {
    expect(typeof RistrettoElement.ORDER).toBe("bigint");
    expect(RistrettoElement.ORDER).toBe(L);
  });

  test("encodeScalar(7n) is 07 00 … 00, and encodeScalar(-1n) the encoding of ℓ − 1", () => {
    expect(hex(RistrettoElement.encodeScalar(7n))).toBe(`07${"00".repeat(31)}`);
    expect(hex(RistrettoElement.encodeScalar(-1n))).toBe(hex(le32(L - 1n)));
    expect(hex(RistrettoElement.encodeScalar(0n))).toBe("00".repeat(32));
  });

  test("encodeScalar reduces mod ℓ: n + ℓ and n − 2ℓ encode as n", () => {
    for (const n of [0n, 7n, L - 1n, 2n ** 251n]) {
      const expected = hex(le32(n));
      expect(hex(RistrettoElement.encodeScalar(n + L)), String(n)).toBe(expected);
      expect(hex(RistrettoElement.encodeScalar(n - 2n * L)), String(n)).toBe(expected);
    }
  });

  test("decodeScalar(encodeScalar(n)) is n mod ℓ, a bigint", () => {
    for (const n of [0n, 7n, -1n, L, L + 5n, -12345n, 2n ** 300n]) {
      const decoded = RistrettoElement.decodeScalar(RistrettoElement.encodeScalar(n));
      expect(typeof decoded).toBe("bigint");
      expect(decoded, String(n)).toBe(reduce(n));
    }
  });

  test("encodeScalar(decodeScalar(bytes)) gives bytes back", () => {
    for (const n of [0n, 7n, 2n ** 252n, L - 1n]) {
      const bytes = le32(n);
      expect(hex(RistrettoElement.encodeScalar(RistrettoElement.decodeScalar(bytes)))).toBe(
        hex(bytes),
      );
    }
  });

  test.each([
    ["ℓ", L],
    ["ℓ + 1", L + 1n],
    ["2^255 − 1", 2n ** 255n - 1n],
    ["2^256 − 1", 2n ** 256n - 1n],
  ])(
    "decodeScalar refuses the encoding of %s, which is not canonical, with a TypeError",
    (_, n) => {
      expect(typeof RistrettoElement.decodeScalar).toBe("function");
      expect(() => RistrettoElement.decodeScalar(le32(n))).toThrow(TypeError);
    },
  );

  test.each([0, 31, 33, 64])("decodeScalar refuses %i bytes with a TypeError", (length) => {
    expect(typeof RistrettoElement.decodeScalar).toBe("function");
    expect(() => RistrettoElement.decodeScalar(new Uint8Array(length))).toThrow(TypeError);
  });

  test.each([
    ["a string", "abc"],
    ["an array of numbers", Array.from({ length: 32 }, () => 0)],
    ["an ArrayBuffer", new ArrayBuffer(32)],
    ["null", null],
    ["a bigint", 7n],
  ])("decodeScalar refuses %s, which is not a Uint8Array, with a TypeError", (_, value) => {
    expect(typeof RistrettoElement.decodeScalar).toBe("function");
    expect(() => RistrettoElement.decodeScalar(value as never)).toThrow(TypeError);
  });

  test("encodeScalar returns a new array each time", () => {
    const first = RistrettoElement.encodeScalar(7n);
    expect(RistrettoElement.encodeScalar(7n)).not.toBe(first);
    first.fill(0xff);
    expect(hex(RistrettoElement.encodeScalar(7n))).toBe(hex(le32(7n)));
  });

  test("invertScalar: a · invertScalar(a) ≡ 1 (mod ℓ), from 1 to ℓ − 1", () => {
    let random = RistrettoElement.randomScalar();
    while (random === 0n) random = RistrettoElement.randomScalar();
    for (const a of [2n, -12345n, random, L + 3n, 2n ** 300n]) {
      const inverse = RistrettoElement.invertScalar(a);
      expect(typeof inverse).toBe("bigint");
      expect(inverse >= 1n && inverse < L, String(a)).toBe(true);
      expect(reduce(a * inverse), String(a)).toBe(1n);
    }
  });

  test("invertScalar(1n) is 1n, and invertScalar(-1n) is ℓ − 1", () => {
    expect(RistrettoElement.invertScalar(1n)).toBe(1n);
    expect(RistrettoElement.invertScalar(-1n)).toBe(L - 1n);
    expect(RistrettoElement.invertScalar(L - 1n)).toBe(L - 1n);
  });

  test.each([
    ["0n", 0n],
    ["ℓ", L],
    ["−ℓ", -L],
    ["2ℓ", 2n * L],
  ])("invertScalar(%s) is a RangeError: 0 has no inverse", (_, n) => {
    expect(() => RistrettoElement.invertScalar(n)).toThrow(RangeError);
  });

  test.each([
    ["an integer number", 5],
    ["a number above 2^53", 2 ** 60],
    ["a string", "5"],
    ["null", null],
    ["undefined", undefined],
    ["a BoundedInt", BoundedInt.from(5n)],
    ["an element", g()],
  ])(
    "encodeScalar and invertScalar refuse %s, which is not a bigint, with a TypeError",
    (_, value) => {
      expect(typeof RistrettoElement.encodeScalar).toBe("function");
      expect(typeof RistrettoElement.invertScalar).toBe("function");
      expect(() => RistrettoElement.encodeScalar(value as never)).toThrow(TypeError);
      expect(() => RistrettoElement.invertScalar(value as never)).toThrow(TypeError);
    },
  );

  test("a BoundedInt passes its value: multiplyScalar(x.value) takes it, multiplyScalar(x) is a TypeError", () => {
    expect(hex(g().multiplyScalar(BoundedInt.from(5n).value).encode())).toBe(multiples[5]);
    // BoundedInt is the integer of Z_ℓ (#49): −1 is the scalar ℓ − 1.
    expect(
      g()
        .multiplyScalar(BoundedInt.from(L - 1n).value)
        .equals(g().negate()),
    ).toBe(true);
    expect(hex(RistrettoElement.encodeScalar(BoundedInt.from(L - 1n).value))).toBe(
      hex(le32(L - 1n)),
    );
    expect(() => g().multiplyScalar(BoundedInt.from(5n) as never)).toThrow(TypeError);
  });

  test("the scalar parameters are bigints, and so are the scalars returned", () => {
    expectTypeOf(RistrettoElement.ORDER).toEqualTypeOf<bigint>();
    expectTypeOf<typeof RistrettoElement.encodeScalar>().parameter(0).toEqualTypeOf<bigint>();
    expectTypeOf<typeof RistrettoElement.encodeScalar>().returns.toEqualTypeOf<Uint8Array>();
    expectTypeOf<typeof RistrettoElement.decodeScalar>().returns.toEqualTypeOf<bigint>();
    expectTypeOf<typeof RistrettoElement.invertScalar>().parameter(0).toEqualTypeOf<bigint>();
    expectTypeOf<typeof RistrettoElement.invertScalar>().returns.toEqualTypeOf<bigint>();
    expectTypeOf<typeof RistrettoElement.randomScalar>().returns.toEqualTypeOf<bigint>();
    expectTypeOf<RistrettoElement["multiplyScalar"]>().parameter(0).toEqualTypeOf<bigint>();
    expect(typeof RistrettoElement.invertScalar(5n)).toBe("bigint");
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #38    | new: both classes against RFC 9496 and the vectors of h (#35) |
// | #40    | scalars are bigints: the tests of RistrettoScalar become placeholders; ORDER, encodeScalar, decodeScalar, invertScalar; the value of a BoundedInt (#39) |
// | #47    | a BoundedInt passes its value: ℓ − 1 in place of −1; placeholders of #40 removed (#44) |
// | #51    | ℓ − 1 through BoundedInt itself, the integer of Z_ℓ (#49)     |
