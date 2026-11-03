/**
 * The edge cases of `BlindingContext` (#39; docs/core/blinding-context.md): wrong
 * types and lengths, a non-canonical `h`, views and Node.js buffers as inputs, the empty
 * message, the arrays it returns, `blind` of zero, openings with each part swapped,
 * wrong argument classes, the rejection of every awaiting member of an invalid context,
 * and the queues of several contexts. Expected values come from
 * test/vectors/generator-h.json, computed apart from the TypeScript code, or from the
 * group classes of #35. The same file runs in Node.js and in every headless browser.
 */
import { describe, expect, test } from "vitest";
import { BlindingContext, RistrettoElement, RistrettoScalar } from "../src/core/index.js";
import * as seams from "../src/core/blinding-context.js";
import contextVectors from "./vectors/blinding-context.json" with { type: "json" };
import generatorVectors from "./vectors/generator-h.json" with { type: "json" };

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** The same bytes, as a view with an offset into a larger buffer. */
function offsetView(bytes: Uint8Array, offset = 5): Uint8Array {
  const buffer = new Uint8Array(bytes.length + offset + 3).fill(0xa5);
  buffer.set(bytes, offset);
  return buffer.subarray(offset, offset + bytes.length);
}

/** The vector `name` of test/vectors/generator-h.json: its message and its h. */
function generator(name: string): { message: Uint8Array; h: Uint8Array } {
  const vector = generatorVectors.vectors.find((v) => v.name === name);
  if (vector === undefined) throw new Error(`no generator vector ${name}`);
  return { message: fromHex(vector.messageHex), h: fromHex(vector.h) };
}

const ageCheck = () => generator("age-check");
const abc = () => generator("abc");
const g = () => RistrettoElement.canonicalGenerator();
const scalar = (n: bigint) => RistrettoScalar.fromBigInt(n);
const ageCheckContext = () => BlindingContext.fromEncoded(ageCheck().h, ageCheck().message);
const invalidContext = () => BlindingContext.fromEncoded(abc().h, ageCheck().message);
/** The seams reach the contexts of their own module: these come from it. */
const seamContext = () => seams.BlindingContext.fromEncoded(ageCheck().h, ageCheck().message);
const macrotasks = async (n: number) => {
  for (let i = 0; i < n; i++) await new Promise((resolve) => setTimeout(resolve, 10));
};

describe("BlindingContext.fromEncoded: wrong inputs throw a TypeError at once", () => {
  const notBytes: [string, unknown][] = [
    ["a number array", Array.from({ length: 32 }, () => 0)],
    ["a string", "00".repeat(32)],
    ["an ArrayBuffer", new ArrayBuffer(32)],
    ["null", null],
    ["undefined", undefined],
  ];

  test.each(notBytes)("h as %s", (_name, h) => {
    expect(() => BlindingContext.fromEncoded(h as Uint8Array, ageCheck().message)).toThrow(
      TypeError,
    );
  });

  test.each([0, 31, 33, 64])("h of %i bytes", (length) => {
    expect(() => BlindingContext.fromEncoded(new Uint8Array(length), ageCheck().message)).toThrow(
      TypeError,
    );
  });

  test.each(notBytes)("message as %s", (_name, message) => {
    expect(() => BlindingContext.fromEncoded(ageCheck().h, message as Uint8Array)).toThrow(
      TypeError,
    );
  });

  test("a non-canonical h is thrown at once, not a rejection", () => {
    // 2^255 − 1 encodes no element: it is above p (RFC 9496, Section 4.3.1).
    const h = new Uint8Array(32).fill(0xff);
    h[31] = 0x7f;
    expect(() => BlindingContext.fromEncoded(h, ageCheck().message)).toThrow(
      /h is not a canonical encoding/,
    );
  });
});

describe("BlindingContext: inputs and outputs", () => {
  test("the empty message and its h make a valid context", async () => {
    const { h, message } = generator("empty");
    const context = BlindingContext.fromEncoded(h, message);
    expect(context.message.length).toBe(0);
    expect(hex((await context.h()).encode())).toBe(hex(h));
  });

  test("views with an offset are read at their offset, and copied", async () => {
    const h = offsetView(ageCheck().h);
    const message = offsetView(ageCheck().message, 7);
    const context = BlindingContext.fromEncoded(h, message);
    new Uint8Array(h.buffer).fill(0);
    new Uint8Array(message.buffer).fill(0);
    expect(hex(context.message)).toBe(contextVectors.context.messageHex);
    expect(hex(await context.serialize())).toBe(contextVectors.context.serialized);
  });

  test.skipIf(typeof globalThis.Buffer === "undefined")(
    "a Node.js Buffer is copied, though its slice shares memory",
    async () => {
      const h = globalThis.Buffer.from(ageCheck().h);
      const message = globalThis.Buffer.from(ageCheck().message);
      const context = BlindingContext.fromEncoded(h, message);
      h.set(abc().h);
      message.fill(0x61);
      expect(hex(context.message)).toBe(contextVectors.context.messageHex);
      expect(hex((await context.h()).encode())).toBe(contextVectors.context.h);
    },
  );

  test("message gives a new array on each call", () => {
    const context = ageCheckContext();
    const first = context.message;
    expect(context.message).not.toBe(first);
    first.fill(0);
    expect(hex(context.message)).toBe(contextVectors.context.messageHex);
  });

  test("serialize() gives a new array on each call", async () => {
    const context = ageCheckContext();
    const first = await context.serialize();
    expect(await context.serialize()).not.toBe(first);
    first.fill(0);
    expect(hex(await context.serialize())).toBe(contextVectors.context.serialized);
  });

  test("h() is the decoded h, equal to the generator derived from the message", async () => {
    const h = await ageCheckContext().h();
    expect(h.equals(await RistrettoElement.deriveGenerator(ageCheck().message))).toBe(true);
  });
});

describe("BlindingContext: an invalid context", () => {
  test("rejects with the same RangeError on every call of every awaiting member", async () => {
    const context = invalidContext();
    for (let i = 0; i < 2; i++) {
      await expect(context.h()).rejects.toThrow(/h is not the generator derived from message/);
      await expect(context.serialize()).rejects.toThrow(RangeError);
      await expect(context.blind(scalar(1n))).rejects.toThrow(RangeError);
      await expect(context.isOpeningOf(scalar(1n), scalar(1n), g())).rejects.toThrow(RangeError);
    }
  });

  test("rejects with the RangeError before it looks at the arguments", async () => {
    const context = invalidContext();
    await expect(context.blind(1n as unknown as RistrettoScalar)).rejects.toThrow(RangeError);
    await expect(
      context.isOpeningOf(null as unknown as RistrettoScalar, scalar(1n), g()),
    ).rejects.toThrow(RangeError);
  });

  test("still gives its group and its message", () => {
    const context = invalidContext();
    expect(context.group).toBe(RistrettoElement);
    expect(hex(context.message)).toBe(contextVectors.context.messageHex);
  });
});

describe("BlindingContext: commitments and openings", () => {
  test("blind of zero is allowed, and gives r·h", async () => {
    const context = ageCheckContext();
    const { commitment, blinding } = await context.blind(scalar(0n));
    expect(blinding.isZero()).toBe(false);
    expect(commitment.equals((await context.h()).multiplyScalar(blinding))).toBe(true);
    expect(await context.isOpeningOf(scalar(0n), blinding, commitment)).toBe(true);
  });

  test("isOpeningOf refuses each part swapped in turn", async () => {
    const context = ageCheckContext();
    const m = scalar(20000n);
    const { commitment, blinding } = await context.blind(m);
    const other = await context.blind(m);
    expect(await context.isOpeningOf(blinding, m, commitment)).toBe(false);
    expect(await context.isOpeningOf(m, other.blinding, commitment)).toBe(false);
    expect(await context.isOpeningOf(m, blinding, other.commitment)).toBe(false);
    expect(await context.isOpeningOf(m, blinding, commitment.negate())).toBe(false);
    expect(await context.isOpeningOf(m.negate(), blinding.negate(), commitment)).toBe(false);
    expect(await context.isOpeningOf(m, blinding, commitment)).toBe(true);
  });

  const notScalars: [string, unknown][] = [
    ["a bigint", 1n],
    ["null", null],
    ["an element", RistrettoElement.canonicalGenerator()],
    ["a plain object", {}],
  ];

  test.each(notScalars)("blind of %s rejects with a TypeError", async (_name, value) => {
    await expect(ageCheckContext().blind(value as RistrettoScalar)).rejects.toThrow(
      /blind: scalar must be a RistrettoScalar/,
    );
  });

  test.each(notScalars)(
    "isOpeningOf with %s as scalar or blinding rejects with a TypeError",
    async (_name, value) => {
      const context = ageCheckContext();
      const one = scalar(1n);
      await expect(context.isOpeningOf(value as RistrettoScalar, one, g())).rejects.toThrow(
        /isOpeningOf: scalar must be a RistrettoScalar/,
      );
      await expect(context.isOpeningOf(one, value as RistrettoScalar, g())).rejects.toThrow(
        /isOpeningOf: blinding must be a RistrettoScalar/,
      );
    },
  );

  test.each<[string, unknown]>([
    ["a scalar", RistrettoScalar.fromBigInt(1n)],
    ["bytes", new Uint8Array(32)],
    ["null", null],
  ])("isOpeningOf with %s as commitment rejects with a TypeError", async (_name, value) => {
    const one = scalar(1n);
    await expect(
      ageCheckContext().isOpeningOf(one, one, value as RistrettoElement),
    ).rejects.toThrow(/isOpeningOf: commitment must be a RistrettoElement/);
  });
});

describe("BlindingContext: the queues of blindings", () => {
  test("two contexts do not share a queue", async () => {
    const used = seamContext();
    const unused = seamContext();
    await used.blind(scalar(1n));
    await macrotasks(20);
    expect(seams.queuedBlindings(used)).toBeGreaterThan(0);
    expect(seams.queuedBlindings(unused)).toBe(0);
    await unused.blind(scalar(1n));
    expect(seams.queuedBlindings(unused)).toBe(0);
  });

  test("a context only validated, or invalid, holds no pair", async () => {
    const validated = seamContext();
    await validated.h();
    await validated.serialize();
    const invalid = seams.BlindingContext.fromEncoded(abc().h, ageCheck().message);
    await expect(invalid.blind(scalar(1n))).rejects.toThrow(RangeError);
    await expect(invalid.isOpeningOf(scalar(1n), scalar(1n), g())).rejects.toThrow(RangeError);
    await macrotasks(5);
    expect(seams.queuedBlindings(validated)).toBe(0);
    expect(seams.queuedBlindings(invalid)).toBe(0);
  });

  test("isOpeningOf also starts the queue, and takes its pairs from it", async () => {
    const context = seamContext();
    const { commitment, blinding } = await seams.blindWith(context, scalar(7n), () => scalar(3n));
    expect(seams.queuedBlindings(context)).toBe(0);
    expect(await context.isOpeningOf(scalar(7n), blinding, commitment)).toBe(true);
    await macrotasks(20);
    const full = seams.queuedBlindings(context);
    expect(full).toBeGreaterThan(0);
    expect(await context.isOpeningOf(scalar(7n), blinding, commitment)).toBe(true);
    expect(seams.queuedBlindings(context)).toBe(full - 1);
  });

  test("blindWith rejects an invalid context with the RangeError, and a draw of another class", async () => {
    const invalid = seams.BlindingContext.fromEncoded(abc().h, ageCheck().message);
    await expect(seams.blindWith(invalid, scalar(1n), () => scalar(1n))).rejects.toThrow(
      RangeError,
    );
    await expect(
      seams.blindWith(seamContext(), scalar(1n), () => 1n as unknown as RistrettoScalar),
    ).rejects.toThrow(TypeError);
  });

  test("the seams refuse what is not a context", async () => {
    expect(() => seams.queuedBlindings({} as BlindingContext)).toThrow(TypeError);
    await expect(
      seams.blindWith({} as BlindingContext, scalar(1n), () => scalar(1n)),
    ).rejects.toThrow(TypeError);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #39    | new: the edge cases of BlindingContext                        |
