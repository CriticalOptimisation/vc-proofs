/**
 * The edge cases of `RistrettoElement` and of its scalars, which are bigints (#35;
 * docs/core/ristretto255.md): wrong types and lengths, views with an offset,
 * non-instances, the largest scalars, extreme uniform inputs, the bounds of the DST,
 * inputs changed while a promise runs, and the identity. Expected values come from
 * libsodium, from `@noble/curves`' own `hash_to_ristretto255`, or from the text of
 * RFC 9496, never from the code under test. The same file runs in Node.js and in every
 * headless browser.
 */
import { ristretto255, ristretto255_hasher } from "@noble/curves/ed25519.js";
import sodium from "libsodium-wrappers-sumo";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { RistrettoElement } from "../src/core/index.js";
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

/** The 64-byte little-endian encoding of a non-negative integer below 2^512. */
function le64(n: bigint): Uint8Array {
  const out = new Uint8Array(64);
  for (let i = 0; i < 64; i++, n >>= 8n) out[i] = Number(n & 0xffn);
  return out;
}

/** The integer of a little-endian encoding. */
function littleEndian(bytes: Uint8Array): bigint {
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i] ?? 0);
  return n;
}

/** The same bytes, as a view with an offset into a larger buffer. */
function offsetView(bytes: Uint8Array, offset = 5): Uint8Array {
  const buffer = new Uint8Array(bytes.length + offset + 3).fill(0xa5);
  buffer.set(bytes, offset);
  return buffer.subarray(offset, offset + bytes.length);
}

const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const g = () => RistrettoElement.canonicalGenerator();
const multiples = rfc.multiplesOfGenerator.encodings;
const five = () => RistrettoElement.decode(fromHex(multiples[5] ?? ""));
const age = vectors.vectors.find((vector) => vector.name === "age-check");
if (age === undefined) throw new Error("the age-check vector is missing");

beforeAll(async () => {
  await sodium.ready;
});

const notBytes = [
  ["a string", "abc"],
  ["an ArrayBuffer", new ArrayBuffer(32)],
  ["an array of numbers", Array.from({ length: 32 }, () => 0)],
  ["a DataView", new DataView(new ArrayBuffer(32))],
  ["undefined", undefined],
  ["null", null],
] as const;

describe("wrong types and lengths are TypeErrors", () => {
  test.each(notBytes)("RistrettoElement.decode of %s", (_, value) => {
    expect(() => RistrettoElement.decode(value as never)).toThrow(TypeError);
  });

  test.each([0, 31, 33, 64])("RistrettoElement.decode of %i bytes", (length) => {
    expect(() => RistrettoElement.decode(new Uint8Array(length))).toThrow(TypeError);
  });

  test.each([0, 32, 63, 65])("RistrettoElement.fromUniformBytes of %i bytes", (length) => {
    expect(() => RistrettoElement.fromUniformBytes(new Uint8Array(length))).toThrow(TypeError);
  });

  test.each(notBytes)("RistrettoElement.fromUniformBytes of %s", (_, value) => {
    expect(() => RistrettoElement.fromUniformBytes(value as never)).toThrow(TypeError);
  });

  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // RistrettoScalar.decode of %s; RistrettoScalar.decode of %i bytes; RistrettoScalar.fromUniformBytes of %i bytes; RistrettoScalar.fromBigInt of %s
  //   -> RistrettoElement.multiplyScalar of %s (the scalar is a bigint); decodeScalar refuses %i bytes, and %s, which is not a Uint8Array, with a TypeError (test/ristretto.test.ts)
  // test.each(notBytes)("RistrettoScalar.decode of %s", (_, value) => {
  //   expect(() => RistrettoScalar.decode(value as never)).toThrow(TypeError);
  // });
  //
  // test.each([0, 31, 33, 64])("RistrettoScalar.decode of %i bytes", (length) => {
  //   expect(() => RistrettoScalar.decode(new Uint8Array(length))).toThrow(TypeError);
  // });
  //
  // test.each([0, 32, 63, 65])("RistrettoScalar.fromUniformBytes of %i bytes", (length) => {
  //   expect(() => RistrettoScalar.fromUniformBytes(new Uint8Array(length))).toThrow(TypeError);
  // });
  //
  // test.each([
  //   ["a number", 5],
  //   ["a string", "5"],
  //   ["undefined", undefined],
  // ])("RistrettoScalar.fromBigInt of %s", (_, value) => {
  //   expect(() => RistrettoScalar.fromBigInt(value as never)).toThrow(TypeError);
  // });
  test.each([
    ["a number", 5],
    ["a number above 2^53", 2 ** 60],
    ["a string", "5"],
    ["undefined", undefined],
    ["null", null],
    ["an encoding", le32(5n)],
  ])("RistrettoElement.multiplyScalar of %s", (_, value) => {
    expect(() => g().multiplyScalar(value as never)).toThrow(TypeError);
  });

  test.each(notBytes)("hashToGroup rejects a message that is %s", async (_, value) => {
    await expect(
      RistrettoElement.hashToGroup(value as never, ascii(RistrettoElement.GENERATOR_DST)),
    ).rejects.toBeInstanceOf(TypeError);
  });

  test.each(notBytes)("hashToGroup rejects a dst that is %s", async (_, value) => {
    await expect(RistrettoElement.hashToGroup(ascii("abc"), value as never)).rejects.toBeInstanceOf(
      TypeError,
    );
  });

  test.each(notBytes)("deriveGenerator rejects a message that is %s", async (_, value) => {
    await expect(RistrettoElement.deriveGenerator(value as never)).rejects.toBeInstanceOf(
      TypeError,
    );
  });
});

describe("views with an offset are read as their bytes", () => {
  test("RistrettoElement.decode", () => {
    const encoding = multiples[7] ?? "";
    expect(hex(RistrettoElement.decode(offsetView(fromHex(encoding))).encode())).toBe(encoding);
  });

  test("RistrettoElement.fromUniformBytes", () => {
    const vector = rfc.elementDerivation.vectors[0];
    expect(vector).toBeDefined();
    const view = offsetView(fromHex(vector?.input ?? ""));
    expect(hex(RistrettoElement.fromUniformBytes(view).encode())).toBe(vector?.output);
  });

  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // RistrettoScalar.decode and RistrettoScalar.fromUniformBytes
  //   -> RistrettoElement.decodeScalar (and fromUniformBytes of the element, above)
  // test("RistrettoScalar.decode and RistrettoScalar.fromUniformBytes", () => {
  //   const bytes = new Uint8Array(64);
  //   bytes.set(le32(L + 9n));
  //   expect(hex(RistrettoScalar.decode(offsetView(le32(L - 1n))).encode())).toBe(hex(le32(L - 1n)));
  //   expect(hex(RistrettoScalar.fromUniformBytes(offsetView(bytes)).encode())).toBe(hex(le32(9n)));
  // });
  test("RistrettoElement.decodeScalar", () => {
    expect(RistrettoElement.decodeScalar(offsetView(le32(L - 1n)))).toBe(L - 1n);
  });

  test("hashToGroup reads views of message and dst", async () => {
    const element = await RistrettoElement.hashToGroup(
      offsetView(ascii(age.message)),
      offsetView(ascii(RistrettoElement.GENERATOR_DST)),
    );
    expect(hex(element.encode())).toBe(age.h);
  });

  test("deriveGenerator reads a view of the message", async () => {
    const h = await RistrettoElement.deriveGenerator(offsetView(ascii(age.message)));
    expect(hex(h.encode())).toBe(age.h);
  });
});

describe("non-instances are TypeErrors", () => {
  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // the list forged, with an object with the scalar prototype; RistrettoElement: add, subtract and equals refuse %s; RistrettoElement: multiplyScalar refuses %s; RistrettoScalar: the binary operations refuse %s; an element is not a scalar, and a scalar is not an element
  //   -> the list forged without the scalar prototype; RistrettoElement: add, subtract and equals refuse %s; RistrettoElement: multiplyScalar refuses %s, which is not a bigint; none for RistrettoScalar; an element is not a scalar, and a bigint is not an element
  // const forged = [
  //   ["an object", {}],
  //   ["null", null],
  //   ["undefined", undefined],
  //   ["a number", 5],
  //   ["a bigint", 5n],
  //   ["an encoding", fromHex(multiples[3] ?? "")],
  //   ["an object with the element prototype", Object.create(RistrettoElement.prototype) as unknown],
  //   ["an object with the scalar prototype", Object.create(RistrettoScalar.prototype) as unknown],
  // ] as const;
  //
  // test.each(forged)("RistrettoElement: add, subtract and equals refuse %s", (_, value) => {
  //   expect(() => five().add(value as never)).toThrow(TypeError);
  //   expect(() => five().subtract(value as never)).toThrow(TypeError);
  //   expect(() => five().equals(value as never)).toThrow(TypeError);
  // });
  //
  // test.each(forged)("RistrettoElement: multiplyScalar refuses %s", (_, value) => {
  //   expect(() => five().multiplyScalar(value as never)).toThrow(TypeError);
  // });
  //
  // test.each(forged)("RistrettoScalar: the binary operations refuse %s", (_, value) => {
  //   for (const name of ["add", "subtract", "multiply", "equals"] as const) {
  //     expect(() => scalar(3n)[name](value as never), name).toThrow(TypeError);
  //   }
  // });
  //
  // test("an element is not a scalar, and a scalar is not an element", () => {
  //   expect(() => five().add(scalar(1n) as never)).toThrow(TypeError);
  //   expect(() => five().multiplyScalar(five() as never)).toThrow(TypeError);
  //   expect(() => scalar(1n).add(five() as never)).toThrow(TypeError);
  // });
  const forged = [
    ["an object", {}],
    ["null", null],
    ["undefined", undefined],
    ["a number", 5],
    ["a bigint", 5n],
    ["an encoding", fromHex(multiples[3] ?? "")],
    ["an object with the element prototype", Object.create(RistrettoElement.prototype) as unknown],
  ] as const;

  test.each(forged)("RistrettoElement: add, subtract and equals refuse %s", (_, value) => {
    expect(() => five().add(value as never)).toThrow(TypeError);
    expect(() => five().subtract(value as never)).toThrow(TypeError);
    expect(() => five().equals(value as never)).toThrow(TypeError);
  });

  test.each(forged.filter(([name]) => name !== "a bigint"))(
    "RistrettoElement: multiplyScalar refuses %s, which is not a bigint",
    (_, value) => {
      expect(() => five().multiplyScalar(value as never)).toThrow(TypeError);
    },
  );

  test("an element is not a scalar, and a bigint is not an element", () => {
    expect(() => five().add(1n as never)).toThrow(TypeError);
    expect(() => five().multiplyScalar(five() as never)).toThrow(TypeError);
  });

  test("an injected derivation must return an element", async () => {
    const pending = deriveGeneratorWith(ascii("abc"), () => ({}) as never);
    await expect(pending).rejects.toBeInstanceOf(TypeError);
  });
});

// REVIEW PLACEHOLDER (PR #40: scalars are bigints)
// ℓ − 1 is canonical, it is −1, and (ℓ − 1)·g = −g
//   -> (ℓ − 1)·g = (−1)·g = −g, as libsodium computes it
// decode refuses %s, which is not below ℓ
//   -> multiplyScalar of %s reduces it mod ℓ, as libsodium does; decodeScalar refuses the encoding of %s, which is not canonical, with a TypeError (test/ristretto.test.ts)
// fromBigInt accepts ±(2^251 − 1), and refuses ±2^251 and beyond
//   -> multiplyScalar of ±(2^251 − 1), ±2^251, ±ℓ and 2^300
// (ℓ − 1)⁻¹ = ℓ − 1, and 1⁻¹ = 1
//   -> invertScalar(1n) is 1n, and invertScalar(-1n) is ℓ − 1 (test/ristretto.test.ts)
// invert of 0, decoded or reduced, is a RangeError
//   -> invertScalar(%s) is a RangeError: 0 has no inverse (test/ristretto.test.ts)
// describe("the largest scalars", () => {
//   test("ℓ − 1 is canonical, it is −1, and (ℓ − 1)·g = −g", () => {
//     const top = RistrettoScalar.decode(le32(L - 1n));
//     expect(top.equals(scalar(-1n))).toBe(true);
//     expect(top.add(scalar(1n)).isZero()).toBe(true);
//     expect(g().multiplyScalar(top).equals(g().negate())).toBe(true);
//     expect(hex(g().multiplyScalar(top).encode())).toBe(
//       hex(sodium.crypto_scalarmult_ristretto255_base(le32(L - 1n))),
//     );
//   });
//
//   test.each([
//     ["ℓ + 1", L + 1n],
//     ["2^252 + 2^251", 2n ** 252n + 2n ** 251n],
//     ["2^255 − 1", 2n ** 255n - 1n],
//     ["2^256 − 1", 2n ** 256n - 1n],
//   ])("decode refuses %s, which is not below ℓ", (_, n) => {
//     expect(() => RistrettoScalar.decode(le32(n))).toThrow(TypeError);
//   });
//
//   test("fromBigInt accepts ±(2^251 − 1), and refuses ±2^251 and beyond", () => {
//     const top = 2n ** 251n - 1n;
//     expect(hex(scalar(-top).encode())).toBe(hex(le32(L - top)));
//     expect(scalar(top).add(scalar(-top)).isZero()).toBe(true);
//     for (const n of [2n ** 251n, -(2n ** 251n), L, -L, 2n ** 300n]) {
//       expect(() => scalar(n), String(n)).toThrow(RangeError);
//     }
//   });
//
//   test("(ℓ − 1)⁻¹ = ℓ − 1, and 1⁻¹ = 1", () => {
//     expect(scalar(-1n).invert().equals(scalar(-1n))).toBe(true);
//     expect(scalar(1n).invert().equals(scalar(1n))).toBe(true);
//   });
//
//   test("invert of 0, decoded or reduced, is a RangeError", () => {
//     expect(() => RistrettoScalar.decode(new Uint8Array(32)).invert()).toThrow(RangeError);
//     const bytes = new Uint8Array(64);
//     bytes.set(le32(L));
//     expect(() => RistrettoScalar.fromUniformBytes(bytes).invert()).toThrow(RangeError);
//   });
// });
describe("the largest scalars", () => {
  test("(ℓ − 1)·g = (−1)·g = −g, as libsodium computes it", () => {
    expect(
      g()
        .multiplyScalar(L - 1n)
        .equals(g().multiplyScalar(-1n)),
    ).toBe(true);
    expect(
      g()
        .multiplyScalar(L - 1n)
        .equals(g().negate()),
    ).toBe(true);
    expect(hex(g().multiplyScalar(-1n).encode())).toBe(
      hex(sodium.crypto_scalarmult_ristretto255_base(le32(L - 1n))),
    );
  });

  test.each([
    ["ℓ + 1", L + 1n],
    ["2^252 + 2^251", 2n ** 252n + 2n ** 251n],
    ["2^255 − 1", 2n ** 255n - 1n],
    ["2^256 − 1", 2n ** 256n - 1n],
    ["2^512 − 1", 2n ** 512n - 1n],
  ])("multiplyScalar of %s reduces it mod ℓ, as libsodium does", (_, n) => {
    const reduced = sodium.crypto_core_ristretto255_scalar_reduce(le64(n));
    expect(hex(g().multiplyScalar(n).encode())).toBe(
      hex(sodium.crypto_scalarmult_ristretto255_base(reduced)),
    );
    expect(
      g()
        .multiplyScalar(n)
        .equals(g().multiplyScalar(littleEndian(reduced))),
    ).toBe(true);
  });

  test("multiplyScalar of ±(2^251 − 1), ±2^251, ±ℓ and 2^300", () => {
    for (const n of [2n ** 251n - 1n, 2n ** 251n, L, 2n ** 300n]) {
      expect(five().multiplyScalar(-n).equals(five().multiplyScalar(n).negate()), String(n)).toBe(
        true,
      );
    }
    expect(five().multiplyScalar(L).isIdentity()).toBe(true);
    expect(five().multiplyScalar(-L).isIdentity()).toBe(true);
  });
});

describe("extreme uniform inputs, against libsodium", () => {
  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // 64 bytes of %s
  //   -> 64 bytes of %s (the scalar part: multiplyScalar of their 512-bit integer)
  // test.each([
  //   ["0xff", 0xff],
  //   ["0x00", 0x00],
  //   ["0x80", 0x80],
  // ])("64 bytes of %s", (_, fill) => {
  //   const bytes = new Uint8Array(64).fill(fill);
  //   expect(hex(RistrettoElement.fromUniformBytes(bytes).encode())).toBe(
  //     hex(sodium.crypto_core_ristretto255_from_hash(bytes)),
  //   );
  //   expect(hex(RistrettoScalar.fromUniformBytes(bytes).encode())).toBe(
  //     hex(sodium.crypto_core_ristretto255_scalar_reduce(bytes)),
  //   );
  // });
  test.each([
    ["0xff", 0xff],
    ["0x00", 0x00],
    ["0x80", 0x80],
  ])("64 bytes of %s", (_, fill) => {
    const bytes = new Uint8Array(64).fill(fill);
    expect(hex(RistrettoElement.fromUniformBytes(bytes).encode())).toBe(
      hex(sodium.crypto_core_ristretto255_from_hash(bytes)),
    );
    // libsodium's base multiplication refuses 0, the reduction of the 0x00 bytes.
    const reduced = littleEndian(sodium.crypto_core_ristretto255_scalar_reduce(bytes));
    expect(g().multiplyScalar(littleEndian(bytes)).equals(g().multiplyScalar(reduced))).toBe(true);
  });

  test("bit 255 of each half is ignored by the element derivation", () => {
    const bytes = new Uint8Array(64).fill(0x37);
    const flipped = bytes.slice();
    flipped[31] = (flipped[31] ?? 0) ^ 0x80;
    flipped[63] = (flipped[63] ?? 0) ^ 0x80;
    expect(
      RistrettoElement.fromUniformBytes(flipped).equals(RistrettoElement.fromUniformBytes(bytes)),
    ).toBe(true);
    expect(hex(sodium.crypto_core_ristretto255_from_hash(flipped))).toBe(
      hex(RistrettoElement.fromUniformBytes(bytes).encode()),
    );
  });
});

describe("the bounds of the DST", () => {
  test.each([1, 2, 254, 255])(
    "a dst of %i bytes is noble's hash_to_ristretto255",
    async (length) => {
      const dst = Uint8Array.from({ length }, (_, i) => 0x41 + (i % 26));
      const element = await RistrettoElement.hashToGroup(ascii("abc"), dst);
      const noble = ristretto255_hasher.hashToCurve(ascii("abc"), { DST: dst });
      expect(hex(element.encode())).toBe(hex(noble.toBytes()));
    },
  );

  test.each([256, 1000])("a dst of %i bytes is a RangeError", async (length) => {
    const pending = RistrettoElement.hashToGroup(ascii("abc"), new Uint8Array(length));
    await expect(pending).rejects.toBeInstanceOf(RangeError);
    await expect(pending).rejects.toThrow(/not yet implemented/);
  });

  test("an empty message is hashed", async () => {
    const empty = vectors.vectors.find((vector) => vector.name === "empty");
    expect(empty).toBeDefined();
    const element = await RistrettoElement.hashToGroup(
      new Uint8Array(),
      ascii(RistrettoElement.GENERATOR_DST),
    );
    expect(hex(element.encode())).toBe(empty?.h);
  });
});

describe("inputs changed while the promise runs", () => {
  test("hashToGroup hashes message and dst as they were at the call", async () => {
    const message = ascii(age.message);
    const dst = ascii(RistrettoElement.GENERATOR_DST);
    const pending = RistrettoElement.hashToGroup(message, dst);
    message.fill(0);
    dst.fill(0x41);
    expect(hex((await pending).encode())).toBe(age.h);
  });

  test("deriveGenerator derives from the message as it was at the call", async () => {
    const message = ascii(age.message);
    const pending = RistrettoElement.deriveGenerator(message);
    message.fill(0);
    expect(hex((await pending).encode())).toBe(age.h);
  });

  test("deriveGeneratorWith copies the message before it awaits", async () => {
    const message = ascii(age.message);
    let seen = "";
    const pending = deriveGeneratorWith(message, (uniform) => {
      seen = hex(uniform);
      return RistrettoElement.fromUniformBytes(uniform);
    });
    message.fill(0);
    expect(hex((await pending).encode())).toBe(age.h);
    expect(seen).toBe(age.uniform);
  });
});

describe("values are not shared with the caller", () => {
  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // decode keeps no reference to its input
  //   -> decode keeps no reference to its input (the scalar part: none, a bigint is immutable)
  // test("decode keeps no reference to its input", () => {
  //   const bytes = fromHex(multiples[9] ?? "");
  //   const element = RistrettoElement.decode(bytes);
  //   bytes.fill(0);
  //   expect(hex(element.encode())).toBe(multiples[9]);
  //   const encoding = le32(L - 1n);
  //   const top = RistrettoScalar.decode(encoding);
  //   encoding.fill(0);
  //   expect(hex(top.encode())).toBe(hex(le32(L - 1n)));
  // });
  test("decode keeps no reference to its input", () => {
    const bytes = fromHex(multiples[9] ?? "");
    const element = RistrettoElement.decode(bytes);
    bytes.fill(0);
    expect(hex(element.encode())).toBe(multiples[9]);
  });

  test("fromUniformBytes keeps no reference to its input", () => {
    const bytes = new Uint8Array(64).fill(0x5a);
    const expected = hex(sodium.crypto_core_ristretto255_from_hash(bytes));
    const element = RistrettoElement.fromUniformBytes(bytes);
    bytes.fill(0);
    expect(hex(element.encode())).toBe(expected);
  });

  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // the operations leave their operands unchanged
  //   -> the operations leave their operands unchanged (the scalar part: none, a bigint is immutable)
  // test("the operations leave their operands unchanged", () => {
  //   const p = five();
  //   const q = g();
  //   p.add(q);
  //   p.subtract(q);
  //   p.negate();
  //   p.multiplyScalar(scalar(3n));
  //   expect(hex(p.encode())).toBe(multiples[5]);
  //   expect(hex(q.encode())).toBe(multiples[1]);
  //   const a = scalar(6n);
  //   a.add(scalar(1n));
  //   a.negate();
  //   a.invert();
  //   expect(hex(a.encode())).toBe(hex(le32(6n)));
  // });
  test("the operations leave their operands unchanged", () => {
    const p = five();
    const q = g();
    p.add(q);
    p.subtract(q);
    p.negate();
    p.multiplyScalar(3n);
    p.multiplyScalar(L + 3n);
    expect(hex(p.encode())).toBe(multiples[5]);
    expect(hex(q.encode())).toBe(multiples[1]);
  });
});

describe("the identity", () => {
  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // the identity times any scalar is the identity
  //   -> the identity times any scalar is the identity
  // test("the identity times any scalar is the identity", () => {
  //   const identity = RistrettoElement.identity();
  //   for (const s of [scalar(0n), scalar(1n), scalar(-1n), RistrettoScalar.random()]) {
  //     expect(identity.multiplyScalar(s).isIdentity()).toBe(true);
  //   }
  // });
  test("the identity times any scalar is the identity", () => {
    const identity = RistrettoElement.identity();
    for (const s of [0n, 1n, -1n, L, 2n ** 300n, RistrettoElement.randomScalar()]) {
      expect(identity.multiplyScalar(s).isIdentity()).toBe(true);
    }
  });

  test("the identity is neutral, and its own negation", () => {
    const identity = RistrettoElement.identity();
    expect(identity.add(five()).equals(five())).toBe(true);
    expect(five().subtract(identity).equals(five())).toBe(true);
    expect(identity.negate().isIdentity()).toBe(true);
    expect(hex(identity.negate().encode())).toBe(multiples[0]);
  });

  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // a zero scalar from any factory gives the identity
  //   -> a scalar that reduces to 0 gives the identity
  // test("a zero scalar from any factory gives the identity", () => {
  //   const bytes = new Uint8Array(64);
  //   bytes.set(le32(L));
  //   for (const zero of [
  //     scalar(0n),
  //     RistrettoScalar.decode(new Uint8Array(32)),
  //     RistrettoScalar.fromUniformBytes(bytes),
  //     scalar(5n).subtract(scalar(5n)),
  //   ]) {
  //     expect(zero.isZero()).toBe(true);
  //     expect(five().multiplyScalar(zero).isIdentity()).toBe(true);
  //   }
  // });
  test("a scalar that reduces to 0 gives the identity", () => {
    for (const zero of [0n, -0n, L, -L, 2n * L, 5n - 5n, 2n ** 512n * L]) {
      expect(five().multiplyScalar(zero).isIdentity(), String(zero)).toBe(true);
    }
  });

  test("a scalar that reduces to 0 still runs the multiplication, on a non-zero scalar", () => {
    // noble's ristretto255 points inherit their multiplication from the prototype of
    // their base class, which noble does not freeze; that multiplication refuses 0
    const point = Object.getPrototypeOf(ristretto255.Point.prototype) as {
      multiply(scalar: bigint): unknown;
    };
    const p = five();
    const spy = vi.spyOn(point, "multiply");
    try {
      for (const n of [0n, L, -L, 2n * L, 3n, L + 3n, -1n]) {
        spy.mockClear();
        const product = p.multiplyScalar(n);
        expect(spy, String(n)).toHaveBeenCalledOnce();
        const used = spy.mock.calls[0]?.[0];
        expect(typeof used === "bigint" && used > 0n && used < L, String(n)).toBe(true);
        expect(product.isIdentity(), String(n)).toBe(n % L === 0n);
      }
    } finally {
      spy.mockRestore();
    }
  });
});

describe("the scalar members at their extremes", () => {
  /** `n mod ℓ`, from 0 to ℓ − 1, for any integer `n`. */
  const residue = (n: bigint): bigint => ((n % L) + L) % L;

  const huge: (readonly [string, bigint])[] = [
    ["2^512 − 1", 2n ** 512n - 1n],
    ["−2^300 − 7", -(2n ** 300n) - 7n],
    ["−(ℓ + 3)", -(L + 3n)],
    ["2^200·ℓ + 5", 2n ** 200n * L + 5n],
    ["−(2^1024)", -(2n ** 1024n)],
  ];

  test.each(huge)(
    "invertScalar(%s) is the inverse of its residue, as libsodium computes it",
    (_, n) => {
      const inverse = RistrettoElement.invertScalar(n);
      expect(inverse > 0n && inverse < L).toBe(true);
      expect(residue(n * inverse)).toBe(1n);
      expect(hex(RistrettoElement.encodeScalar(inverse))).toBe(
        hex(sodium.crypto_core_ristretto255_scalar_invert(le32(residue(n)))),
      );
    },
  );

  test.each(huge)(
    "invertScalar(−n) is −invertScalar(n), and invertScalar is its own inverse, for n = %s",
    (_, n) => {
      const inverse = RistrettoElement.invertScalar(n);
      expect(RistrettoElement.invertScalar(-n)).toBe(residue(-inverse));
      expect(RistrettoElement.invertScalar(inverse)).toBe(residue(n));
    },
  );

  test.each([
    ["2^300·ℓ", 2n ** 300n * L],
    ["−5ℓ", -5n * L],
    ["−0n", -0n],
  ])("invertScalar(%s) is a RangeError: it reduces to 0", (_, n) => {
    expect(() => RistrettoElement.invertScalar(n)).toThrow(/invertScalar: 0 has no inverse/);
  });

  test.each(huge)(
    "encodeScalar(%s) is the encoding of its residue, which decodeScalar reads back",
    (_, n) => {
      const encoding = RistrettoElement.encodeScalar(n);
      expect(hex(encoding)).toBe(hex(le32(residue(n))));
      expect(RistrettoElement.decodeScalar(encoding)).toBe(residue(n));
    },
  );

  test("decodeScalar reads 0 and ℓ − 1, the bounds of the canonical encodings", () => {
    expect(RistrettoElement.decodeScalar(new Uint8Array(32))).toBe(0n);
    expect(RistrettoElement.decodeScalar(le32(L - 1n))).toBe(L - 1n);
    expect(() => RistrettoElement.decodeScalar(le32(L))).toThrow(
      /decodeScalar: bytes are not a canonical scalar/,
    );
  });

  test("the diagnostics name the member and the parameter", () => {
    expect(() => RistrettoElement.encodeScalar(1 as never)).toThrow(
      /RistrettoElement\.encodeScalar: n must be a bigint/,
    );
    expect(() => RistrettoElement.invertScalar(1 as never)).toThrow(
      /RistrettoElement\.invertScalar: n must be a bigint/,
    );
    expect(() => RistrettoElement.decodeScalar(new Uint8Array(31))).toThrow(
      /RistrettoElement\.decodeScalar: bytes must be a Uint8Array of 32 bytes/,
    );
    expect(() => g().multiplyScalar(1 as never)).toThrow(/multiplyScalar: n must be a bigint/);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #38    | new: the edge cases of both classes (#35)                     |
// | #40    | scalars are bigints: multiplyScalar of any integer; decodeScalar of a view; the scalar members at their extremes; multiplyScalar of a scalar that reduces to 0 still multiplies (#39) |
