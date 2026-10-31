/**
 * `RistrettoElement` and `RistrettoScalar` (#35; docs/core/ristretto255.md, *Checked
 * against libsodium*) against libsodium 1.0.22, compiled to WebAssembly by
 * libsodium.js (`libsodium-wrappers-sumo`, a development dependency). libsodium is first
 * checked on the RFC 9496 vectors, then it gives every expected value: none comes from
 * code of vc-proofs. The inputs are 64 pairs of 64-byte strings, SHA-512 of a counter,
 * so that a failure is reproducible. The same file runs in Node.js and in every headless
 * browser.
 */
import sodium from "libsodium-wrappers-sumo";
import { beforeAll, describe, expect, test } from "vitest";
import { RistrettoElement, RistrettoScalar } from "../src/core/index.js";
import rfc from "./vectors/rfc9380-rfc9496.json" with { type: "json" };

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** The 32-byte little-endian encoding of a small non-negative integer. */
function le32(n: number): Uint8Array {
  const out = new Uint8Array(32);
  out[0] = n & 0xff;
  out[1] = n >> 8;
  return out;
}

async function sha512(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-512", new TextEncoder().encode(text)));
}

const COUNT = 64;
interface Input {
  readonly i: number;
  readonly u: Uint8Array;
  readonly v: Uint8Array;
}
const inputs: Input[] = [];

beforeAll(async () => {
  await sodium.ready;
  for (let i = 0; i < COUNT; i++) {
    inputs.push({
      i,
      u: await sha512(`vc-proofs/#35/u/${String(i)}`),
      v: await sha512(`vc-proofs/#35/v/${String(i)}`),
    });
  }
});

/** Runs `check` on every input, and names the failing index. */
function each(check: (input: Input) => void): void {
  expect(inputs.length).toBe(COUNT);
  for (const input of inputs) {
    try {
      check(input);
    } catch (error) {
      throw new Error(`input ${String(input.i)}: ${String(error)}`, { cause: error });
    }
  }
}

const element = (bytes: Uint8Array) => RistrettoElement.fromUniformBytes(bytes);
const scalar = (bytes: Uint8Array) => RistrettoScalar.fromUniformBytes(bytes);

describe("libsodium, the oracle, reproduces RFC 9496", () => {
  test("A.1: crypto_scalarmult_ristretto255_base of 1 to 15", () => {
    const encodings = rfc.multiplesOfGenerator.encodings;
    for (let k = 1; k < encodings.length; k++) {
      expect(hex(sodium.crypto_scalarmult_ristretto255_base(le32(k)))).toBe(encodings[k]);
    }
  });

  test("A.3: crypto_core_ristretto255_from_hash", () => {
    for (const vector of rfc.elementDerivation.vectors) {
      expect(hex(sodium.crypto_core_ristretto255_from_hash(fromHex(vector.input)))).toBe(
        vector.output,
      );
    }
  });

  test("A.2: crypto_core_ristretto255_is_valid_point refuses every invalid encoding", () => {
    for (const bad of rfc.invalidEncodings.encodings) {
      expect(sodium.crypto_core_ristretto255_is_valid_point(fromHex(bad))).toBe(false);
    }
  });
});

describe("RistrettoElement against libsodium", () => {
  test("fromUniformBytes is crypto_core_ristretto255_from_hash", () => {
    each(({ u }) => {
      expect(hex(element(u).encode())).toBe(hex(sodium.crypto_core_ristretto255_from_hash(u)));
    });
  });

  test("add is crypto_core_ristretto255_add", () => {
    each(({ u, v }) => {
      const expected = sodium.crypto_core_ristretto255_add(
        sodium.crypto_core_ristretto255_from_hash(u),
        sodium.crypto_core_ristretto255_from_hash(v),
      );
      expect(hex(element(u).add(element(v)).encode())).toBe(hex(expected));
    });
  });

  test("subtract is crypto_core_ristretto255_sub", () => {
    each(({ u, v }) => {
      const expected = sodium.crypto_core_ristretto255_sub(
        sodium.crypto_core_ristretto255_from_hash(u),
        sodium.crypto_core_ristretto255_from_hash(v),
      );
      expect(hex(element(u).subtract(element(v)).encode())).toBe(hex(expected));
    });
  });

  test("multiplyScalar on a derived point is crypto_scalarmult_ristretto255", () => {
    each(({ u, v }) => {
      const s = sodium.crypto_core_ristretto255_scalar_reduce(v);
      const expected = sodium.crypto_scalarmult_ristretto255(
        s,
        sodium.crypto_core_ristretto255_from_hash(u),
      );
      expect(hex(element(u).multiplyScalar(scalar(v)).encode())).toBe(hex(expected));
    });
  });

  test("multiplyScalar on g is crypto_scalarmult_ristretto255_base", () => {
    each(({ u }) => {
      const s = sodium.crypto_core_ristretto255_scalar_reduce(u);
      const expected = sodium.crypto_scalarmult_ristretto255_base(s);
      const actual = RistrettoElement.canonicalGenerator().multiplyScalar(scalar(u));
      expect(hex(actual.encode())).toBe(hex(expected));
    });
  });

  test("decode accepts exactly what crypto_core_ristretto255_is_valid_point accepts", () => {
    const candidates: Uint8Array[] = [
      ...rfc.invalidEncodings.encodings.map(fromHex),
      ...rfc.multiplesOfGenerator.encodings.map(fromHex),
    ];
    for (const { u, v } of inputs) {
      candidates.push(u.slice(0, 32), v.slice(32, 64));
      candidates.push(sodium.crypto_core_ristretto255_from_hash(u));
    }
    let accepted = 0;
    for (const candidate of candidates) {
      let decoded: boolean;
      try {
        RistrettoElement.decode(candidate);
        decoded = true;
      } catch (error) {
        expect(error).toBeInstanceOf(TypeError);
        decoded = false;
      }
      expect(decoded, hex(candidate)).toBe(
        sodium.crypto_core_ristretto255_is_valid_point(candidate),
      );
      if (decoded) accepted++;
    }
    // Both outcomes occur, so the comparison is not vacuous.
    expect(accepted).toBeGreaterThan(COUNT);
    expect(accepted).toBeLessThan(candidates.length);
  });
});

describe("RistrettoScalar against libsodium", () => {
  test("fromUniformBytes is crypto_core_ristretto255_scalar_reduce", () => {
    each(({ u }) => {
      expect(hex(scalar(u).encode())).toBe(hex(sodium.crypto_core_ristretto255_scalar_reduce(u)));
    });
  });

  test.each(["add", "subtract", "multiply"] as const)("%s is its libsodium counterpart", (name) => {
    each(({ u, v }) => {
      const a = sodium.crypto_core_ristretto255_scalar_reduce(u);
      const b = sodium.crypto_core_ristretto255_scalar_reduce(v);
      const counterpart = {
        add: sodium.crypto_core_ristretto255_scalar_add,
        subtract: sodium.crypto_core_ristretto255_scalar_sub,
        multiply: sodium.crypto_core_ristretto255_scalar_mul,
      }[name];
      const actual = scalar(u)[name](scalar(v));
      expect(hex(actual.encode())).toBe(hex(counterpart(a, b)));
    });
  });

  test("negate is crypto_core_ristretto255_scalar_negate", () => {
    each(({ u }) => {
      const a = sodium.crypto_core_ristretto255_scalar_reduce(u);
      expect(hex(scalar(u).negate().encode())).toBe(
        hex(sodium.crypto_core_ristretto255_scalar_negate(a)),
      );
    });
  });

  test("invert is crypto_core_ristretto255_scalar_invert", () => {
    each(({ u }) => {
      const a = sodium.crypto_core_ristretto255_scalar_reduce(u);
      expect(hex(scalar(u).invert().encode())).toBe(
        hex(sodium.crypto_core_ristretto255_scalar_invert(a)),
      );
    });
  });

  test("decode reads libsodium's encodings: decode(reduce(u)) encodes back to them", () => {
    each(({ u }) => {
      const a = sodium.crypto_core_ristretto255_scalar_reduce(u);
      expect(hex(RistrettoScalar.decode(a).encode())).toBe(hex(a));
    });
  });
});
