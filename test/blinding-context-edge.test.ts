/**
 * The edge cases of `BlindingContext` (#39; docs/core/blinding-context.md): wrong
 * types and lengths, a non-canonical `h`, views and Node.js buffers as inputs, the empty
 * message, the array it returns, `blind` of zero, openings with each part swapped,
 * wrong argument classes, the rejection of every awaiting member of an invalid context,
 * the queues of several contexts, and contexts over a group of their own: its
 * diagnostics, its pairing with a ristretto255 context, and the types inferred from it.
 * Scalars are bigints (docs/core/ristretto255.md, Scalars). Expected values come from
 * test/vectors/generator-h.json, computed apart from the TypeScript code, or from the
 * group classes of #35. The same file runs in Node.js and in every headless browser.
 */
import { describe, expect, expectTypeOf, test } from "vitest";
import { BlindingContext, RistrettoElement } from "../src/core/index.js";
import type { Group } from "../src/core/index.js";
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
  test("the empty message and its h make a context that validates", async () => {
    const { h, message } = generator("empty");
    const context = BlindingContext.fromEncoded(h, message);
    expect(hex((await context.h()).encode())).toBe(hex(h));
  });

  test("views with an offset are read at their offset, and copied before the validation", async () => {
    const h = offsetView(ageCheck().h);
    const message = offsetView(ageCheck().message, 7);
    const context = BlindingContext.fromEncoded(h, message);
    new Uint8Array(h.buffer).fill(0);
    new Uint8Array(message.buffer).fill(0);
    expect(hex(await context.serialize())).toBe(contextVectors.context.serialized);
  });

  test.skipIf(typeof globalThis.Buffer === "undefined")(
    "a Node.js Buffer is copied before the validation, though its slice shares memory",
    async () => {
      const h = globalThis.Buffer.from(ageCheck().h);
      const message = globalThis.Buffer.from(ageCheck().message);
      const context = BlindingContext.fromEncoded(h, message);
      h.set(abc().h);
      message.fill(0x61);
      expect(hex((await context.h()).encode())).toBe(contextVectors.context.h);
    },
  );

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
  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // rejects with the same RangeError on every call of every awaiting member
  //   -> rejects with the same RangeError on every call of every awaiting member
  // test("rejects with the same RangeError on every call of every awaiting member", async () => {
  //   const context = invalidContext();
  //   for (let i = 0; i < 2; i++) {
  //     await expect(context.h()).rejects.toThrow(/h is not the generator derived from message/);
  //     await expect(context.serialize()).rejects.toThrow(RangeError);
  //     await expect(context.blind(scalar(1n))).rejects.toThrow(RangeError);
  //     await expect(context.isOpeningOf(scalar(1n), scalar(1n), g())).rejects.toThrow(RangeError);
  //   }
  // });
  test("rejects with the same RangeError on every call of every awaiting member", async () => {
    const context = invalidContext();
    for (let i = 0; i < 2; i++) {
      await expect(context.h()).rejects.toThrow(/h is not the generator derived from message/);
      await expect(context.serialize()).rejects.toThrow(RangeError);
      await expect(context.blind(1n)).rejects.toThrow(RangeError);
      await expect(context.isOpeningOf(1n, 1n, g())).rejects.toThrow(RangeError);
    }
  });

  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // rejects with the RangeError before it looks at the arguments
  //   -> rejects with the RangeError before it looks at the arguments
  // test("rejects with the RangeError before it looks at the arguments", async () => {
  //   const context = invalidContext();
  //   await expect(context.blind(1n as unknown as RistrettoScalar)).rejects.toThrow(RangeError);
  //   await expect(
  //     context.isOpeningOf(null as unknown as RistrettoScalar, scalar(1n), g()),
  //   ).rejects.toThrow(RangeError);
  // });
  test("rejects with the RangeError before it looks at the arguments", async () => {
    const context = invalidContext();
    await expect(context.blind(1 as unknown as bigint)).rejects.toThrow(RangeError);
    await expect(context.isOpeningOf(null as unknown as bigint, 1n, g())).rejects.toThrow(
      RangeError,
    );
  });

  test("still gives its group", () => {
    expect(invalidContext().group).toBe(RistrettoElement);
  });
});

describe("BlindingContext: commitments and openings", () => {
  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // blind of zero is allowed, and gives r·h
  //   -> blind of zero is allowed, and gives r·h
  // test("blind of zero is allowed, and gives r·h", async () => {
  //   const context = ageCheckContext();
  //   const { commitment, blinding } = await context.blind(scalar(0n));
  //   expect(blinding.isZero()).toBe(false);
  //   expect(commitment.equals((await context.h()).multiplyScalar(blinding))).toBe(true);
  //   expect(await context.isOpeningOf(scalar(0n), blinding, commitment)).toBe(true);
  // });
  test("blind of zero is allowed, and gives r·h", async () => {
    const context = ageCheckContext();
    const { commitment, blinding } = await context.blind(0n);
    expect(blinding).not.toBe(0n);
    expect(commitment.equals((await context.h()).multiplyScalar(blinding))).toBe(true);
    expect(await context.isOpeningOf(0n, blinding, commitment)).toBe(true);
  });

  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // isOpeningOf refuses each part swapped in turn
  //   -> isOpeningOf refuses each part swapped in turn, and −m, −r open −C
  // test("isOpeningOf refuses each part swapped in turn", async () => {
  //   const context = ageCheckContext();
  //   const m = scalar(20000n);
  //   const { commitment, blinding } = await context.blind(m);
  //   const other = await context.blind(m);
  //   expect(await context.isOpeningOf(blinding, m, commitment)).toBe(false);
  //   expect(await context.isOpeningOf(m, other.blinding, commitment)).toBe(false);
  //   expect(await context.isOpeningOf(m, blinding, other.commitment)).toBe(false);
  //   expect(await context.isOpeningOf(m, blinding, commitment.negate())).toBe(false);
  //   expect(await context.isOpeningOf(m.negate(), blinding.negate(), commitment)).toBe(false);
  //   expect(await context.isOpeningOf(m, blinding, commitment)).toBe(true);
  // });
  test("isOpeningOf refuses each part swapped in turn", async () => {
    const context = ageCheckContext();
    const m = 20000n;
    const { commitment, blinding } = await context.blind(m);
    const other = await context.blind(m);
    expect(await context.isOpeningOf(blinding, m, commitment)).toBe(false);
    expect(await context.isOpeningOf(m, other.blinding, commitment)).toBe(false);
    expect(await context.isOpeningOf(m, blinding, other.commitment)).toBe(false);
    expect(await context.isOpeningOf(m, blinding, commitment.negate())).toBe(false);
    expect(await context.isOpeningOf(-m, -blinding, commitment)).toBe(false);
    // −m and −r open −C: a negative scalar is a valid one.
    expect(await context.isOpeningOf(-m, -blinding, commitment.negate())).toBe(true);
    expect(await context.isOpeningOf(m, blinding, commitment)).toBe(true);
  });

  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // blind of %s rejects with a TypeError; isOpeningOf with %s as scalar or blinding rejects with a TypeError; isOpeningOf with %s as commitment rejects with a TypeError (the notScalars include a bigint)
  //   -> the same three, with a number and a string in place of the bigint; the commitment test: isOpeningOf with %s as commitment rejects with the TypeError of the group's equals
  // const notScalars: [string, unknown][] = [
  //   ["a bigint", 1n],
  //   ["null", null],
  //   ["an element", RistrettoElement.canonicalGenerator()],
  //   ["a plain object", {}],
  // ];
  //
  // test.each(notScalars)("blind of %s rejects with a TypeError", async (_name, value) => {
  //   await expect(ageCheckContext().blind(value as RistrettoScalar)).rejects.toThrow(
  //     /blind: scalar must be a RistrettoScalar/,
  //   );
  // });
  //
  // test.each(notScalars)(
  //   "isOpeningOf with %s as scalar or blinding rejects with a TypeError",
  //   async (_name, value) => {
  //     const context = ageCheckContext();
  //     const one = scalar(1n);
  //     await expect(context.isOpeningOf(value as RistrettoScalar, one, g())).rejects.toThrow(
  //       /isOpeningOf: scalar must be a RistrettoScalar/,
  //     );
  //     await expect(context.isOpeningOf(one, value as RistrettoScalar, g())).rejects.toThrow(
  //       /isOpeningOf: blinding must be a RistrettoScalar/,
  //     );
  //   },
  // );
  //
  // test.each<[string, unknown]>([
  //   ["a scalar", RistrettoScalar.fromBigInt(1n)],
  //   ["bytes", new Uint8Array(32)],
  //   ["null", null],
  // ])("isOpeningOf with %s as commitment rejects with a TypeError", async (_name, value) => {
  //   const one = scalar(1n);
  //   await expect(
  //     ageCheckContext().isOpeningOf(one, one, value as RistrettoElement),
  //   ).rejects.toThrow(/isOpeningOf: commitment must be a RistrettoElement/);
  // });
  const notScalars: [string, unknown][] = [
    ["a number", 1],
    ["a string", "1"],
    ["null", null],
    ["an element", RistrettoElement.canonicalGenerator()],
    ["a plain object", {}],
  ];

  test.each(notScalars)("blind of %s rejects with a TypeError", async (_name, value) => {
    await expect(ageCheckContext().blind(value as bigint)).rejects.toThrow(
      /blind: scalar must be a bigint/,
    );
  });

  test.each(notScalars)(
    "isOpeningOf with %s as scalar or blinding rejects with a TypeError",
    async (_name, value) => {
      const context = ageCheckContext();
      await expect(context.isOpeningOf(value as bigint, 1n, g())).rejects.toThrow(
        /isOpeningOf: scalar must be a bigint/,
      );
      await expect(context.isOpeningOf(1n, value as bigint, g())).rejects.toThrow(
        /isOpeningOf: blinding must be a bigint/,
      );
    },
  );

  test.each<[string, unknown]>([
    ["a bigint", 1n],
    ["bytes", new Uint8Array(32)],
    ["null", null],
  ])(
    "isOpeningOf with %s as commitment rejects with the TypeError of the group's equals",
    async (_name, value) => {
      await expect(
        ageCheckContext().isOpeningOf(1n, 1n, value as RistrettoElement),
      ).rejects.toThrow(/must be a RistrettoElement/);
    },
  );
});

describe("BlindingContext: the queues of blindings", () => {
  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // two contexts do not share a queue
  //   -> two contexts do not share a queue
  // test("two contexts do not share a queue", async () => {
  //   const used = seamContext();
  //   const unused = seamContext();
  //   await used.blind(scalar(1n));
  //   await macrotasks(20);
  //   expect(seams.queuedBlindings(used)).toBeGreaterThan(0);
  //   expect(seams.queuedBlindings(unused)).toBe(0);
  //   await unused.blind(scalar(1n));
  //   expect(seams.queuedBlindings(unused)).toBe(0);
  // });
  test("two contexts do not share a queue", async () => {
    const used = seamContext();
    const unused = seamContext();
    await used.blind(1n);
    await macrotasks(20);
    expect(seams.queuedBlindings(used)).toBeGreaterThan(0);
    expect(seams.queuedBlindings(unused)).toBe(0);
    await unused.blind(1n);
    expect(seams.queuedBlindings(unused)).toBe(0);
  });

  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // a context only validated, or invalid, holds no pair
  //   -> a context only validated, or invalid, holds no pair
  // test("a context only validated, or invalid, holds no pair", async () => {
  //   const validated = seamContext();
  //   await validated.h();
  //   await validated.serialize();
  //   const invalid = seams.BlindingContext.fromEncoded(abc().h, ageCheck().message);
  //   await expect(invalid.blind(scalar(1n))).rejects.toThrow(RangeError);
  //   await expect(invalid.isOpeningOf(scalar(1n), scalar(1n), g())).rejects.toThrow(RangeError);
  //   await macrotasks(5);
  //   expect(seams.queuedBlindings(validated)).toBe(0);
  //   expect(seams.queuedBlindings(invalid)).toBe(0);
  // });
  test("a context only validated, or invalid, holds no pair", async () => {
    const validated = seamContext();
    await validated.h();
    await validated.serialize();
    const invalid = seams.BlindingContext.fromEncoded(abc().h, ageCheck().message);
    await expect(invalid.blind(1n)).rejects.toThrow(RangeError);
    await expect(invalid.isOpeningOf(1n, 1n, g())).rejects.toThrow(RangeError);
    await macrotasks(5);
    expect(seams.queuedBlindings(validated)).toBe(0);
    expect(seams.queuedBlindings(invalid)).toBe(0);
  });

  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // isOpeningOf also starts the queue, and takes its pairs from it
  //   -> isOpeningOf also starts the queue, and takes its pairs from it
  // test("isOpeningOf also starts the queue, and takes its pairs from it", async () => {
  //   const context = seamContext();
  //   const { commitment, blinding } = await seams.blindWith(context, scalar(7n), () => scalar(3n));
  //   expect(seams.queuedBlindings(context)).toBe(0);
  //   expect(await context.isOpeningOf(scalar(7n), blinding, commitment)).toBe(true);
  //   await macrotasks(20);
  //   const full = seams.queuedBlindings(context);
  //   expect(full).toBeGreaterThan(0);
  //   expect(await context.isOpeningOf(scalar(7n), blinding, commitment)).toBe(true);
  //   expect(seams.queuedBlindings(context)).toBe(full - 1);
  // });
  test("isOpeningOf also starts the queue, and takes its pairs from it", async () => {
    const context = seamContext();
    const { commitment, blinding } = await seams.blindWith(context, 7n, () => 3n);
    expect(seams.queuedBlindings(context)).toBe(0);
    expect(await context.isOpeningOf(7n, blinding, commitment)).toBe(true);
    await macrotasks(20);
    const full = seams.queuedBlindings(context);
    expect(full).toBeGreaterThan(0);
    expect(await context.isOpeningOf(7n, blinding, commitment)).toBe(true);
    expect(seams.queuedBlindings(context)).toBe(full - 1);
  });

  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // blindWith rejects an invalid context with the RangeError, and a draw of another class
  //   -> blindWith rejects an invalid context with the RangeError, and a draw that is not a bigint
  // test("blindWith rejects an invalid context with the RangeError, and a draw of another class", async () => {
  //   const invalid = seams.BlindingContext.fromEncoded(abc().h, ageCheck().message);
  //   await expect(seams.blindWith(invalid, scalar(1n), () => scalar(1n))).rejects.toThrow(
  //     RangeError,
  //   );
  //   await expect(
  //     seams.blindWith(seamContext(), scalar(1n), () => 1n as unknown as RistrettoScalar),
  //   ).rejects.toThrow(TypeError);
  // });
  test("blindWith rejects an invalid context with the RangeError, and a draw that is not a bigint", async () => {
    const invalid = seams.BlindingContext.fromEncoded(abc().h, ageCheck().message);
    await expect(seams.blindWith(invalid, 1n, () => 1n)).rejects.toThrow(RangeError);
    await expect(seams.blindWith(seamContext(), 1n, () => 1 as unknown as bigint)).rejects.toThrow(
      /blindWith: draw\(\) must be a bigint/,
    );
  });

  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // the seams refuse what is not a context
  //   -> the seams refuse what is not a context
  // test("the seams refuse what is not a context", async () => {
  //   expect(() => seams.queuedBlindings({} as BlindingContext)).toThrow(TypeError);
  //   await expect(
  //     seams.blindWith({} as BlindingContext, scalar(1n), () => scalar(1n)),
  //   ).rejects.toThrow(TypeError);
  // });
  test("the seams refuse what is not a context", async () => {
    expect(() => seams.queuedBlindings({} as BlindingContext)).toThrow(TypeError);
    await expect(seams.blindWith({} as BlindingContext, 1n, () => 1n)).rejects.toThrow(TypeError);
  });
});

describe("BlindingContext over a group of its own", () => {
  const encoder = new TextEncoder();
  const message = () => encoder.encode("vc-proofs/test/edge-group");

  /**
   * The arithmetic of ristretto255 under another suite name and tag, with 3·g as its
   * generator, as a plain object rather than a class.
   */
  function plainGroup(overrides: Partial<Group<RistrettoElement>> = {}) {
    const group: Group<RistrettoElement> = {
      SUITE_NAME: "Edge",
      GENERATOR_DST: "vc-proofs-test-edge-group",
      decode: (bytes) => RistrettoElement.decode(bytes),
      hashToGroup: (bytes, dst) => RistrettoElement.hashToGroup(bytes, dst),
      canonicalGenerator: () => g().multiplyScalar(3n),
      randomScalar: () => RistrettoElement.randomScalar(),
      ...overrides,
    };
    return group;
  }

  async function hOf(group: Group<RistrettoElement>): Promise<Uint8Array> {
    return (
      await RistrettoElement.hashToGroup(message(), encoder.encode(group.GENERATOR_DST))
    ).encode();
  }

  test("a group left undefined is the default group", async () => {
    const context = BlindingContext.fromEncoded(ageCheck().h, ageCheck().message, undefined);
    expect(context.group).toBe(RistrettoElement);
    expect(hex(await context.serialize())).toBe(contextVectors.context.serialized);
  });

  test("a refusal of the group's decode is a TypeError at once, with the refusal as its cause", () => {
    const refusal = new TypeError("refused by the group");
    const group = plainGroup({
      decode: () => {
        throw refusal;
      },
    });
    let thrown: unknown;
    try {
      BlindingContext.fromEncoded(ageCheck().h, message(), group);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TypeError);
    expect((thrown as Error).message).toMatch(/h is not a canonical encoding/);
    expect((thrown as Error).cause).toBe(refusal);
  });

  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // a wrong argument is named after the group when its classes have no name
  //   -> over a group of its own, a scalar must still be a bigint, and a commitment is refused by the group's equals
  // test("a wrong argument is named after the group when its classes have no name", async () => {
  //   const group = plainGroup();
  //   const context = BlindingContext.fromEncoded(await hOf(group), message(), group);
  //   const one = scalar(1n);
  //   await expect(context.blind(1n as unknown as RistrettoScalar)).rejects.toThrow(
  //     /blind: scalar must be a scalar of the group/,
  //   );
  //   await expect(context.isOpeningOf(one, one, {} as RistrettoElement)).rejects.toThrow(
  //     /isOpeningOf: commitment must be an element of the group/,
  //   );
  // });
  test("over a group of its own, a scalar must still be a bigint, and a commitment is refused by the group's equals", async () => {
    const group = plainGroup();
    const context = BlindingContext.fromEncoded(await hOf(group), message(), group);
    await expect(context.blind(1 as unknown as bigint)).rejects.toThrow(
      /blind: scalar must be a bigint/,
    );
    await expect(context.isOpeningOf(1n, 1n, {} as RistrettoElement)).rejects.toThrow(TypeError);
  });

  test("a scalar of 0n drawn by the group is drawn again, for blind and for the queue", async () => {
    let draws = 0;
    const group = plainGroup({
      randomScalar: () => (++draws % 2 === 1 ? 0n : RistrettoElement.randomScalar()),
    });
    const context = BlindingContext.fromEncoded(await hOf(group), message(), group);
    const { commitment, blinding } = await context.blind(5n);
    expect(blinding).not.toBe(0n);
    expect(draws).toBeGreaterThanOrEqual(2);
    await macrotasks(20);
    expect(await context.isOpeningOf(5n, blinding, commitment)).toBe(true);
  });

  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // a context over another group and a ristretto255 context side by side
  //   -> a context over another group and a ristretto255 context side by side
  // test("a context over another group and a ristretto255 context side by side", async () => {
  //   const group = plainGroup();
  //   const other = BlindingContext.fromEncoded(await hOf(group), message(), group);
  //   const age = BlindingContext.fromEncoded(ageCheck().h, ageCheck().message);
  //   expect(other.group).toBe(group);
  //   expect(age.group).toBe(RistrettoElement);
  //   expect(new TextDecoder().decode((await other.serialize()).subarray(0, 4))).toBe("Edge");
  //   expect(hex(await age.serialize())).toBe(contextVectors.context.serialized);
  //   const m = scalar(5n);
  //   const fromOther = await other.blind(m);
  //   const fromAge = await age.blind(m);
  //   expect(await other.isOpeningOf(m, fromOther.blinding, fromOther.commitment)).toBe(true);
  //   expect(await age.isOpeningOf(m, fromAge.blinding, fromAge.commitment)).toBe(true);
  //   // Each opening holds only in the context that made it.
  //   expect(await age.isOpeningOf(m, fromOther.blinding, fromOther.commitment)).toBe(false);
  //   expect(await other.isOpeningOf(m, fromAge.blinding, fromAge.commitment)).toBe(false);
  // });
  test("a context over another group and a ristretto255 context side by side", async () => {
    const group = plainGroup();
    const other = BlindingContext.fromEncoded(await hOf(group), message(), group);
    const age = BlindingContext.fromEncoded(ageCheck().h, ageCheck().message);
    expect(other.group).toBe(group);
    expect(age.group).toBe(RistrettoElement);
    expect(new TextDecoder().decode((await other.serialize()).subarray(0, 4))).toBe("Edge");
    expect(hex(await age.serialize())).toBe(contextVectors.context.serialized);
    const m = 5n;
    const fromOther = await other.blind(m);
    const fromAge = await age.blind(m);
    expect(await other.isOpeningOf(m, fromOther.blinding, fromOther.commitment)).toBe(true);
    expect(await age.isOpeningOf(m, fromAge.blinding, fromAge.commitment)).toBe(true);
    // Each opening holds only in the context that made it.
    expect(await age.isOpeningOf(m, fromOther.blinding, fromOther.commitment)).toBe(false);
    expect(await other.isOpeningOf(m, fromAge.blinding, fromAge.commitment)).toBe(false);
  });

  // REVIEW PLACEHOLDER (PR #40: scalars are bigints)
  // the types are inferred from the group, and default to ristretto255
  //   -> the types are inferred from the group, default to ristretto255, and scalars are bigints
  // test("the types are inferred from the group, and default to ristretto255", async () => {
  //   // Checked by tsc, which type-checks the tests; at run time these are no-ops.
  //   expectTypeOf(RistrettoElement).toExtend<Group<RistrettoElement, RistrettoScalar>>();
  //   const age = BlindingContext.fromEncoded(ageCheck().h, ageCheck().message);
  //   // `BlindingContext` alone is `BlindingContext<RistrettoElement, RistrettoScalar>`.
  //   expectTypeOf(age).toEqualTypeOf<BlindingContext>();
  //   expectTypeOf(age.h()).toEqualTypeOf<Promise<RistrettoElement>>();
  //   expectTypeOf<Parameters<BlindingContext["blind"]>[0]>().toEqualTypeOf<RistrettoScalar>();
  //   const group = plainGroup();
  //   const other = BlindingContext.fromEncoded(await hOf(group), message(), group);
  //   expectTypeOf(other).toEqualTypeOf<BlindingContext>();
  //   expectTypeOf(other.group).toEqualTypeOf<Group<RistrettoElement, RistrettoScalar>>();
  //   expect((await other.h()).equals(RistrettoElement.decode(await hOf(group)))).toBe(true);
  // });
  test("the types are inferred from the group, default to ristretto255, and scalars are bigints", async () => {
    // Checked by tsc, which type-checks the tests; at run time these are no-ops.
    expectTypeOf(RistrettoElement).toExtend<Group<RistrettoElement>>();
    expectTypeOf<ReturnType<typeof RistrettoElement.randomScalar>>().toEqualTypeOf<bigint>();
    expectTypeOf<Parameters<RistrettoElement["multiplyScalar"]>[0]>().toEqualTypeOf<bigint>();
    const age = BlindingContext.fromEncoded(ageCheck().h, ageCheck().message);
    // `BlindingContext` alone is `BlindingContext<RistrettoElement>`.
    expectTypeOf(age).toEqualTypeOf<BlindingContext>();
    expectTypeOf(age.h()).toEqualTypeOf<Promise<RistrettoElement>>();
    expectTypeOf<Parameters<BlindingContext["blind"]>[0]>().toEqualTypeOf<bigint>();
    expectTypeOf<
      Awaited<ReturnType<BlindingContext["blind"]>>["blinding"]
    >().toEqualTypeOf<bigint>();
    const group = plainGroup();
    const other = BlindingContext.fromEncoded(await hOf(group), message(), group);
    expectTypeOf(other).toEqualTypeOf<BlindingContext>();
    expectTypeOf(other.group).toEqualTypeOf<Group<RistrettoElement>>();
    expect((await other.h()).equals(RistrettoElement.decode(await hOf(group)))).toBe(true);
  });
});

describe("bigint scalars far beyond ℓ", () => {
  const L = RistrettoElement.ORDER;

  test("blind and isOpeningOf of huge and negative scalars count mod ℓ", async () => {
    const context = ageCheckContext();
    for (const m of [-(2n ** 1024n) + 3n, 2n ** 512n - 1n, -L - 1n]) {
      const { commitment, blinding } = await context.blind(m);
      const residue = ((m % L) + L) % L;
      expect(await context.isOpeningOf(residue, blinding, commitment), String(m)).toBe(true);
      expect(await context.isOpeningOf(m, blinding - 2n ** 700n * L, commitment)).toBe(true);
      expect(await context.isOpeningOf(residue + 1n, blinding, commitment)).toBe(false);
    }
  });

  test("blindWith of a huge negative draw commits with its residue", async () => {
    const context = seamContext();
    const r = -(2n ** 600n) - 11n;
    const { commitment, blinding } = await seams.blindWith(context, 9n, () => r);
    expect(blinding).toBe(r);
    expect(await context.isOpeningOf(9n, ((r % L) + L) % L, commitment)).toBe(true);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #40    | new: the edge cases of BlindingContext, of its group, of bigint scalars (#39) |
