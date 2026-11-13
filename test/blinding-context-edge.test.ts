/**
 * The edge cases of `BlindingContext` (#39, #48; docs/core/blinding-context.md): wrong
 * types and lengths, a non-canonical `h`, a missing group or a bad `ORDER`, views and
 * Node.js buffers as inputs, the empty message, the array it returns, `blind` of zero,
 * openings with each part swapped, wrong values and blinding factors, classes that do not
 * fit the group, the class of a group and its defensive check, the rejection of every
 * awaiting member of an invalid context, the queues of several contexts, and contexts
 * over a group of their own: a small `ORDER`, its diagnostics, its pairing with a
 * ristretto255 context, and the types inferred from it. Values and blinding factors are
 * bounded integers (docs/core/blinding-context.md, The class of a group). Expected values
 * come from test/vectors/generator-h.json, computed apart from the TypeScript code, or
 * from the group classes of #35. The same file runs in Node.js and in every headless
 * browser.
 */
import { afterEach, describe, expect, expectTypeOf, test, vi } from "vitest";
import { BoundedInt as GenericBoundedInt } from "../src/core/bounded-int.js";
import { BlindingContext, RistrettoElement } from "../src/core/index.js";
import type { Blinded, Committed, Group } from "../src/core/index.js";
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
const L = RistrettoElement.ORDER;
const ageCheckContext = () =>
  BlindingContext.fromEncoded(ageCheck().h, ageCheck().message, RistrettoElement);
const invalidContext = () =>
  BlindingContext.fromEncoded(abc().h, ageCheck().message, RistrettoElement);
/** The seams reach the contexts of their own module: these come from it. */
const seamContext = () =>
  seams.BlindingContext.fromEncoded(ageCheck().h, ageCheck().message, RistrettoElement);
const macrotasks = async (n: number) => {
  for (let i = 0; i < n; i++) await new Promise((resolve) => setTimeout(resolve, 10));
};

/** The class of ristretto255, `Ristretto255Scalar`. */
const Scalar = ageCheckContext().boundedInt();
/** A class of values made from it. */
const Days = Scalar.define({ name: "Days", min: -0.5, max: 65535.5 });
/** An opening built by hand, with the integers of its value and of its blinding factor. */
function opening(commitment: RistrettoElement, m: bigint, r: bigint): Blinded<RistrettoElement> {
  return { commitment, value: Days.fromValue(m), blinding: Scalar.fromValue(r) };
}
/** A class of `n` integers `0 … n − 1`, on the generic class, which does not count them. */
function wide(name: string, n: bigint): typeof GenericBoundedInt {
  return GenericBoundedInt.define({ name, min: -0.5, max: [10n * n - 5n, -1] });
}

describe("BlindingContext.fromEncoded: wrong inputs throw a TypeError at once", () => {
  const notBytes: [string, unknown][] = [
    ["a number array", Array.from({ length: 32 }, () => 0)],
    ["a string", "00".repeat(32)],
    ["an ArrayBuffer", new ArrayBuffer(32)],
    ["null", null],
    ["undefined", undefined],
  ];

  test.each(notBytes)("h as %s", (_name, h) => {
    expect(() =>
      BlindingContext.fromEncoded(h as Uint8Array, ageCheck().message, RistrettoElement),
    ).toThrow(TypeError);
  });

  test.each([0, 31, 33, 64])("h of %i bytes", (length) => {
    expect(() =>
      BlindingContext.fromEncoded(new Uint8Array(length), ageCheck().message, RistrettoElement),
    ).toThrow(TypeError);
  });

  test.each(notBytes)("message as %s", (_name, message) => {
    expect(() =>
      BlindingContext.fromEncoded(ageCheck().h, message as Uint8Array, RistrettoElement),
    ).toThrow(TypeError);
  });

  test("a non-canonical h is thrown at once, not a rejection", () => {
    // 2^255 − 1 encodes no element: it is above p (RFC 9496, Section 4.3.1).
    const h = new Uint8Array(32).fill(0xff);
    h[31] = 0x7f;
    expect(() => BlindingContext.fromEncoded(h, ageCheck().message, RistrettoElement)).toThrow(
      /h is not a canonical encoding/,
    );
  });

  test.each<[string, unknown]>([
    ["undefined", undefined],
    ["null", null],
    ["a string", "Ristretto255"],
    ["a bigint", L],
  ])("a group that is %s: the group is required", (_name, group) => {
    expect(() =>
      BlindingContext.fromEncoded(
        ageCheck().h,
        ageCheck().message,
        group as typeof RistrettoElement,
      ),
    ).toThrow(/^BlindingContext\.fromEncoded: group is required$/);
  });

  test.each<[string, unknown]>([
    ["missing", undefined],
    ["a number", 7],
    ["a string", "7"],
    ["null", null],
    ["1n", 1n],
    ["0n", 0n],
    ["negative", -L],
  ])("an ORDER that is %s is a TypeError at once", (_name, order) => {
    const group = { ...ristrettoGroup(), ORDER: order } as unknown as typeof RistrettoElement;
    expect(() => BlindingContext.fromEncoded(ageCheck().h, ageCheck().message, group)).toThrow(
      /^BlindingContext\.fromEncoded: group\.ORDER must be a bigint above 1$/,
    );
  });

  test("a bad ORDER is refused before h is decoded: the group's decode is never called", () => {
    const decode = vi.fn((bytes: Uint8Array) => RistrettoElement.decode(bytes));
    const group = { ...ristrettoGroup(), decode, ORDER: 1n } as unknown as typeof RistrettoElement;
    expect(() => BlindingContext.fromEncoded(ageCheck().h, ageCheck().message, group)).toThrow(
      TypeError,
    );
    expect(decode).not.toHaveBeenCalled();
  });
});

/** The members of ristretto255 as a plain object: a group that is not RistrettoElement. */
function ristrettoGroup(): Group<RistrettoElement> {
  return {
    SUITE_NAME: RistrettoElement.SUITE_NAME,
    GENERATOR_DST: RistrettoElement.GENERATOR_DST,
    ORDER: RistrettoElement.ORDER,
    decode: (bytes) => RistrettoElement.decode(bytes),
    hashToGroup: (bytes, dst) => RistrettoElement.hashToGroup(bytes, dst),
    canonicalGenerator: () => g(),
    randomScalar: () => RistrettoElement.randomScalar(),
  };
}

describe("BlindingContext: inputs and outputs", () => {
  test("the empty message and its h make a context that validates", async () => {
    const { h, message } = generator("empty");
    const context = BlindingContext.fromEncoded(h, message, RistrettoElement);
    expect(hex((await context.h()).encode())).toBe(hex(h));
  });

  test("views with an offset are read at their offset, and copied before the validation", async () => {
    const h = offsetView(ageCheck().h);
    const message = offsetView(ageCheck().message, 7);
    const context = BlindingContext.fromEncoded(h, message, RistrettoElement);
    new Uint8Array(h.buffer).fill(0);
    new Uint8Array(message.buffer).fill(0);
    expect(hex(await context.serialize())).toBe(contextVectors.context.serialized);
  });

  test.skipIf(typeof globalThis.Buffer === "undefined")(
    "a Node.js Buffer is copied before the validation, though its slice shares memory",
    async () => {
      const h = globalThis.Buffer.from(ageCheck().h);
      const message = globalThis.Buffer.from(ageCheck().message);
      const context = BlindingContext.fromEncoded(h, message, RistrettoElement);
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
  test("rejects with the same RangeError on every call of every awaiting member", async () => {
    const context = invalidContext();
    for (let i = 0; i < 2; i++) {
      await expect(context.h()).rejects.toThrow(/h is not the generator derived from message/);
      await expect(context.serialize()).rejects.toThrow(RangeError);
      await expect(context.blind(Days.from(1n))).rejects.toThrow(RangeError);
      await expect(context.isOpeningOf(opening(g(), 1n, 1n))).rejects.toThrow(RangeError);
    }
  });

  test("rejects with the RangeError before it looks at the arguments", async () => {
    const context = invalidContext();
    await expect(context.blind(1 as unknown as GenericBoundedInt)).rejects.toThrow(RangeError);
    await expect(context.isOpeningOf(null as unknown as Blinded<RistrettoElement>)).rejects.toThrow(
      RangeError,
    );
    // A class that does not fit the group: the RangeError of the validation, not its own.
    await expect(context.blind(wide("Wide", L + 1n).fromValue(1n))).rejects.toThrow(
      /not the generator derived from message/,
    );
  });

  test("still gives its group, and the class of its group, which awaits nothing", () => {
    expect(invalidContext().group).toBe(RistrettoElement);
    expect(invalidContext().boundedInt()).toBe(Scalar);
  });
});

describe("BlindingContext: commitments and openings", () => {
  test("blind of zero is allowed, and gives r·h", async () => {
    const context = ageCheckContext();
    const blinded = await context.blind(Days.from(0n));
    const r = blinded.blinding.value;
    // REVIEW PLACEHOLDER (#56: a blinding factor may be 0)
    //   blind of zero is allowed, and gives r·h -> the same test, without its assertion:
    //   expect(r).not.toBe(0n);
    expect(blinded.commitment.equals((await context.h()).multiplyScalar(r))).toBe(true);
    expect(await context.isOpeningOf(blinded)).toBe(true);
  });

  test("blind of the lowest and highest values of a class, and of a value of the generic class itself", async () => {
    const context = ageCheckContext();
    const h = await context.h();
    const Byte = Scalar.define({ name: "Byte", min: -0.5, max: 255.5 });
    const Signed = Scalar.define({ name: "Signed", min: -128.5, max: 127.5 });
    const Small = wide("Small", 10n);
    const cases: [GenericBoundedInt, bigint][] = [
      [Byte.fromValue(0n), 0n],
      [Byte.fromValue(255n), 255n],
      [Signed.fromValue(-128n), L - 128n],
      [Signed.fromValue(127n), 127n],
      [Small.fromValue(9n), 9n],
      [Scalar.fromValue(L - 1n), L - 1n],
    ];
    for (const [x, m] of cases) {
      const blinded = await context.blind(x);
      const expected = g().multiplyScalar(m).add(h.multiplyScalar(blinded.blinding.value));
      expect(blinded.commitment.equals(expected), x.toString()).toBe(true);
      expect(await context.isOpeningOf(blinded)).toBe(true);
    }
  });

  test("blind returns a frozen opening: it cannot be changed, and a copy with a changed part is checked again", async () => {
    const context = ageCheckContext();
    const blinded = await context.blind(Days.from(7n));
    expect(Object.isFrozen(blinded)).toBe(true);
    expect(() => {
      (blinded as { value: GenericBoundedInt }).value = Days.from(8n);
    }).toThrow(TypeError);
    expect(blinded.value.value).toBe(7n);
    expect(await context.isOpeningOf({ ...blinded, value: Days.from(8n) })).toBe(false);
  });

  test("a Blinded and a Committed are plain structures of the entry point's types", async () => {
    const context = ageCheckContext();
    const blinded: Blinded<RistrettoElement> = await context.blind(Days.from(20000n));
    const committed: Committed<RistrettoElement> = { commitment: blinded.commitment, type: Days };
    expect(Object.getPrototypeOf(blinded)).toBe(Object.prototype);
    expect(committed.type).toBe(blinded.value.constructor);
    expectTypeOf(blinded.commitment).toEqualTypeOf<RistrettoElement>();
    expectTypeOf(committed.type).toEqualTypeOf<typeof GenericBoundedInt>();
  });

  test("isOpeningOf refuses each part swapped in turn, and −m, −r open −C when both are values of fitting classes", async () => {
    const context = ageCheckContext();
    const Signed = Scalar.define({ name: "Signed", min: -65535.5, max: 65535.5 });
    const x = Signed.fromValue(20000n);
    const blinded = await context.blind(x);
    const other = await context.blind(x);
    const r = blinded.blinding.value;
    const { commitment } = blinded;
    // The integer of r as the value, and the integer of m as the blinding factor.
    expect(
      await context.isOpeningOf({
        commitment,
        value: Scalar.fromValue(r),
        blinding: Scalar.fromValue(20000n),
      }),
    ).toBe(false);
    expect(await context.isOpeningOf({ ...blinded, blinding: other.blinding })).toBe(false);
    expect(await context.isOpeningOf({ ...blinded, commitment: other.commitment })).toBe(false);
    expect(await context.isOpeningOf({ ...blinded, commitment: commitment.negate() })).toBe(false);
    // −m and −r: −r is ℓ − r in the class of the group, and −m a value of Signed.
    const negated = { value: Signed.fromValue(-20000n), blinding: Scalar.fromValue(L - r) };
    expect(await context.isOpeningOf({ ...negated, commitment })).toBe(false);
    expect(await context.isOpeningOf({ ...negated, commitment: commitment.negate() })).toBe(true);
    expect(await context.isOpeningOf(blinded)).toBe(true);
  });

  test("isOpeningOf accepts an opening built by the caller with a blinding factor of 0n: m·g opens with m, the identity with 0, and m·g + h does not", async () => {
    const context = ageCheckContext();
    const h = await context.h();
    const m = 20000n;
    expect(await context.isOpeningOf(opening(g().multiplyScalar(m), m, 0n))).toBe(true);
    expect(await context.isOpeningOf(opening(RistrettoElement.identity(), 0n, 0n))).toBe(true);
    expect(await context.isOpeningOf(opening(g().multiplyScalar(m).add(h), m, 0n))).toBe(false);
    expect(await context.isOpeningOf(opening(g().multiplyScalar(m), m, 1n))).toBe(false);
    expect(await context.isOpeningOf(opening(g().multiplyScalar(m), m + 1n, 0n))).toBe(false);
  });

  const notValues: [string, unknown][] = [
    ["a bigint", 1n],
    ["a number", 1],
    ["a string", "1"],
    ["null", null],
    ["undefined", undefined],
    ["an element", RistrettoElement.canonicalGenerator()],
    ["a plain object", {}],
    ["an object with a value", { value: 1n }],
    ["a fake on the prototype of the generic class", Object.create(GenericBoundedInt.prototype)],
    ["a fake on the prototype of the class of the group", Object.create(Scalar.prototype)],
    ["a class of bounded integers", Days],
  ];

  test.each(notValues)("blind of %s rejects with a TypeError", async (_name, value) => {
    await expect(ageCheckContext().blind(value as GenericBoundedInt)).rejects.toThrow(
      /^BlindingContext\.blind: x must be a bounded integer$/,
    );
  });

  test.each(notValues)(
    "isOpeningOf with %s as opening.value or opening.blinding rejects with a TypeError",
    async (_name, value) => {
      const context = ageCheckContext();
      const good = opening(g(), 1n, 1n);
      await expect(
        context.isOpeningOf({ ...good, value: value as GenericBoundedInt }),
      ).rejects.toThrow(/^BlindingContext\.isOpeningOf: opening\.value must be a bounded integer$/);
      await expect(
        context.isOpeningOf({ ...good, blinding: value as GenericBoundedInt }),
      ).rejects.toThrow(
        /^BlindingContext\.isOpeningOf: opening\.blinding must be a bounded integer$/,
      );
    },
  );

  test.each<[string, unknown]>([
    ["undefined", undefined],
    ["null", null],
    ["a bigint", 1n],
    ["a string", "opening"],
  ])("isOpeningOf of %s, not an object, rejects with a TypeError", async (_name, value) => {
    await expect(ageCheckContext().isOpeningOf(value as Blinded<RistrettoElement>)).rejects.toThrow(
      /^BlindingContext\.isOpeningOf: opening must be an object$/,
    );
  });

  test("isOpeningOf of an object without its parts rejects with a TypeError, the value checked first", async () => {
    const context = ageCheckContext();
    await expect(context.isOpeningOf({} as Blinded<RistrettoElement>)).rejects.toThrow(
      /opening\.value must be/,
    );
    const { value } = opening(g(), 1n, 1n);
    await expect(context.isOpeningOf({ value } as Blinded<RistrettoElement>)).rejects.toThrow(
      /opening\.blinding must be/,
    );
  });

  test("isOpeningOf refuses a blinding factor of any class but the class of the group: Days, a subclass, the generic class", async () => {
    const context = ageCheckContext();
    const good = opening(g(), 1n, 1n);
    const Sub = Scalar.define({ name: "Sub", min: -0.5, max: [10n * L - 5n, -1] });
    for (const blinding of [
      Days.fromValue(1n),
      Sub.fromValue(1n),
      wide("Generic", L).fromValue(1n),
    ]) {
      await expect(context.isOpeningOf({ ...good, blinding })).rejects.toThrow(
        /^BlindingContext\.isOpeningOf: opening\.blinding must be a Ristretto255Scalar$/,
      );
    }
  });

  test.each<[string, unknown]>([
    ["a bigint", 1n],
    ["bytes", new Uint8Array(32)],
    ["null", null],
  ])(
    "isOpeningOf with %s as opening.commitment rejects with the TypeError of the group's equals",
    async (_name, value) => {
      const blinded = { ...opening(g(), 1n, 1n), commitment: value as RistrettoElement };
      await expect(ageCheckContext().isOpeningOf(blinded)).rejects.toThrow(
        /must be a RistrettoElement/,
      );
    },
  );
});

describe("BlindingContext: the class of a value must fit the group", () => {
  test("a class of exactly ℓ integers fits, anywhere: the integers ℓ … 2ℓ − 1 commit as 0 … ℓ − 1", async () => {
    const context = seamContext();
    const Next = GenericBoundedInt.define({
      name: "Next",
      min: L,
      max: [20n * L - 5n, -1],
    });
    expect(Next.high - Next.low + 1n).toBe(L);
    const Exact = wide("Exact", L);
    const shifted = await seams.blindValueWith(context, Next.fromValue(L + 5n), () => 3n);
    const plain = await seams.blindValueWith(context, Exact.fromValue(5n), () => 3n);
    // ℓ + 5 and 5 are the same scalar: within one class, the group tells them apart.
    expect(shifted.commitment.equals(plain.commitment)).toBe(true);
    expect(await context.isOpeningOf(shifted)).toBe(true);
  });

  test("blind and isOpeningOf of a class of ℓ + 1 integers reject with the RangeError, after the TypeErrors of isOpeningOf", async () => {
    const context = ageCheckContext();
    const Wide = wide("Wide", L + 1n);
    await expect(context.blind(Wide.fromValue(5n))).rejects.toThrow(
      /^BlindingContext\.blind: Wide holds more values than the group Ristretto255 has scalars$/,
    );
    const tooWide = { ...opening(g(), 1n, 1n), value: Wide.fromValue(1n) };
    await expect(context.isOpeningOf(tooWide)).rejects.toThrow(
      /^BlindingContext\.isOpeningOf: Wide holds more values than the group Ristretto255 has scalars$/,
    );
    // A blinding factor of the wrong class is a TypeError, checked before the class of the value.
    await expect(context.isOpeningOf({ ...tooWide, blinding: Days.fromValue(1n) })).rejects.toThrow(
      TypeError,
    );
  });

  test("the generic class itself does not fit a group of order 7", async () => {
    const group = { ...ristrettoGroup(), SUITE_NAME: "Small", ORDER: 7n };
    const context = BlindingContext.fromEncoded(await hashOf(group), edgeMessage(), group);
    const error: unknown = await context
      .blind(GenericBoundedInt.fromValue(1n))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RangeError);
    expect((error as Error).message).toBe(
      "BlindingContext.blind: BoundedInt holds more values than the group Small has scalars",
    );
  });

  test("a value whose constructor is not a class of bounded integers is a TypeError", async () => {
    const x = Days.fromValue(1n);
    Object.defineProperty(x, "constructor", { value: Object });
    await expect(ageCheckContext().blind(x)).rejects.toThrow(
      /^BlindingContext\.blind: x must be a bounded integer of a class of bounded integers$/,
    );
    const y = Days.fromValue(1n);
    Object.defineProperty(y, "constructor", { value: 5n });
    await expect(ageCheckContext().blind(y)).rejects.toThrow(TypeError);
  });

  test("a class written by hand with invalid constants rejects with its own RangeError", async () => {
    class Broken extends GenericBoundedInt {
      static override readonly min = 10n;
      static override readonly max = 5n;
      static make(): Broken {
        return new Broken(1n);
      }
    }
    await expect(ageCheckContext().blind(Broken.make())).rejects.toThrow(RangeError);
  });
});

/** The message of the edge groups, and the h of a group for it. */
const edgeMessage = () => new TextEncoder().encode("vc-proofs/test/edge-group");
async function hashOf(group: Group<RistrettoElement>): Promise<Uint8Array> {
  return (
    await RistrettoElement.hashToGroup(edgeMessage(), new TextEncoder().encode(group.GENERATOR_DST))
  ).encode();
}

describe("BlindingContext: the class of a group", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("one class per group object: two plain groups of the same name and order have two classes", () => {
    const first = ristrettoGroup();
    const second = ristrettoGroup();
    const a = BlindingContext.fromEncoded(ageCheck().h, ageCheck().message, first).boundedInt();
    const b = BlindingContext.fromEncoded(ageCheck().h, ageCheck().message, second).boundedInt();
    expect(a.name).toBe("Ristretto255Scalar");
    expect(b.name).toBe("Ristretto255Scalar");
    expect(a).not.toBe(b);
    expect(a).not.toBe(Scalar);
    expect(BlindingContext.fromEncoded(abc().h, abc().message, first).boundedInt()).toBe(a);
  });

  test("the class of a group of order 2 is 0 … 1, and of a huge order 0 … ORDER − 1", () => {
    for (const order of [2n, 2n ** 1024n + 7n]) {
      const group = {
        ...ristrettoGroup(),
        SUITE_NAME: `Order${String(String(order).length)}`,
        ORDER: order,
      };
      const Z = BlindingContext.fromEncoded(ageCheck().h, ageCheck().message, group).boundedInt();
      expect([Z.scale, Z.low, Z.high]).toEqual([0, 0n, order - 1n]);
      expect(Object.isFrozen(Z)).toBe(true);
      expect(Object.getPrototypeOf(Z)).toBe(GenericBoundedInt);
    }
  });

  test("the defensive check: a class made with other constants than scale 0, low 0n, high ORDER − 1n is a RangeError at once, and nothing is cached", () => {
    const group = { ...ristrettoGroup(), SUITE_NAME: "Checked" };
    const wrong = GenericBoundedInt.define({ name: "Checked", min: -0.5, max: 100.5, step: 0.1 });
    const define = vi.spyOn(GenericBoundedInt, "define").mockReturnValueOnce(wrong);
    expect(() => BlindingContext.fromEncoded(ageCheck().h, ageCheck().message, group)).toThrow(
      /^BlindingContext\.fromEncoded: the class of the group Checked is not the integers 0 … ORDER − 1$/,
    );
    expect(define).toHaveBeenCalledTimes(1);
    define.mockRestore();
    const Z = BlindingContext.fromEncoded(ageCheck().h, ageCheck().message, group).boundedInt();
    expect([Z.scale, Z.low, Z.high]).toEqual([0, 0n, L - 1n]);
  });

  test("a value of the class of one group fits another group of the same order, but is no blinding factor there", async () => {
    const group = { ...ristrettoGroup(), SUITE_NAME: "Twin", GENERATOR_DST: "vc-proofs-test-twin" };
    const twin = BlindingContext.fromEncoded(await hashOf(group), edgeMessage(), group);
    const blinded = await twin.blind(Scalar.fromValue(5n));
    expect(blinded.blinding.constructor).toBe(twin.boundedInt());
    expect(await twin.isOpeningOf(blinded)).toBe(true);
    const age = ageCheckContext();
    await expect(age.isOpeningOf(blinded)).rejects.toThrow(
      /opening\.blinding must be a Ristretto255Scalar/,
    );
  });
});

describe("BlindingContext: the queues of blindings", () => {
  test("two contexts do not share a queue", async () => {
    const used = seamContext();
    const unused = seamContext();
    await used.blind(Days.from(1n));
    await macrotasks(20);
    expect(seams.queuedBlindings(used)).toBeGreaterThan(0);
    expect(seams.queuedBlindings(unused)).toBe(0);
    await unused.blind(Days.from(1n));
    expect(seams.queuedBlindings(unused)).toBe(0);
  });

  test("a context only validated, or invalid, holds no pair", async () => {
    const validated = seamContext();
    await validated.h();
    await validated.serialize();
    validated.boundedInt();
    const invalid = seams.BlindingContext.fromEncoded(
      abc().h,
      ageCheck().message,
      RistrettoElement,
    );
    await expect(invalid.blind(Days.from(1n))).rejects.toThrow(RangeError);
    await expect(invalid.isOpeningOf(opening(g(), 1n, 1n))).rejects.toThrow(RangeError);
    await macrotasks(5);
    expect(seams.queuedBlindings(validated)).toBe(0);
    expect(seams.queuedBlindings(invalid)).toBe(0);
  });

  test("a refused argument takes no pair from the queue", async () => {
    const context = seamContext();
    await context.blind(Days.from(1n));
    await macrotasks(20);
    const before = seams.queuedBlindings(context);
    expect(before).toBeGreaterThan(0);
    await expect(context.blind(1n as unknown as GenericBoundedInt)).rejects.toThrow(TypeError);
    await expect(context.blind(wide("Wide", L + 1n).fromValue(1n))).rejects.toThrow(RangeError);
    await expect(
      context.isOpeningOf({ ...opening(g(), 1n, 1n), blinding: Days.fromValue(1n) }),
    ).rejects.toThrow(TypeError);
    expect(seams.queuedBlindings(context)).toBe(before);
  });

  test("isOpeningOf also starts the queue, and takes its pairs from it", async () => {
    const context = seamContext();
    const blinded = await seams.blindValueWith(context, Days.from(7n), () => 3n);
    expect(seams.queuedBlindings(context)).toBe(0);
    expect(await context.isOpeningOf(blinded)).toBe(true);
    await macrotasks(20);
    const full = seams.queuedBlindings(context);
    expect(full).toBeGreaterThan(0);
    expect(await context.isOpeningOf(blinded)).toBe(true);
    expect(seams.queuedBlindings(context)).toBe(full - 1);
  });

  test("30 concurrent blinds, three times the queue, all open and are distinct", async () => {
    const context = seamContext();
    await context.blind(Days.from(0n));
    await macrotasks(20);
    const blinded = await Promise.all(
      Array.from({ length: 30 }, (_, i) => context.blind(Days.fromValue(BigInt(i)))),
    );
    const opens = await Promise.all(blinded.map((b) => context.isOpeningOf(b)));
    expect(opens.every(Boolean)).toBe(true);
    expect(new Set(blinded.map((b) => b.blinding.value)).size).toBe(30);
  });

  test("blindWith rejects an invalid context with the RangeError, and a draw that is not a bigint", async () => {
    const invalid = seams.BlindingContext.fromEncoded(
      abc().h,
      ageCheck().message,
      RistrettoElement,
    );
    await expect(seams.blindWith(invalid, 1n, () => 1n)).rejects.toThrow(RangeError);
    await expect(seams.blindWith(seamContext(), 1n, () => 1 as unknown as bigint)).rejects.toThrow(
      /blindWith: draw\(\) must be a bigint/,
    );
  });

  test("blindValueWith rejects an invalid context, a value that is not a bounded integer or does not fit, and a draw that is not a bigint or not of the class of the group", async () => {
    const invalid = seams.BlindingContext.fromEncoded(
      abc().h,
      ageCheck().message,
      RistrettoElement,
    );
    await expect(seams.blindValueWith(invalid, Days.from(1n), () => 1n)).rejects.toThrow(
      RangeError,
    );
    const context = seamContext();
    await expect(
      seams.blindValueWith(context, 1n as unknown as GenericBoundedInt, () => 1n),
    ).rejects.toThrow(/^blindValueWith: x must be a bounded integer$/);
    await expect(
      seams.blindValueWith(context, wide("Wide", L + 1n).fromValue(1n), () => 1n),
    ).rejects.toThrow(
      /^blindValueWith: Wide holds more values than the group Ristretto255 has scalars$/,
    );
    await expect(
      seams.blindValueWith(context, Days.from(1n), () => 1 as unknown as bigint),
    ).rejects.toThrow(/blindValueWith: draw\(\) must be a bigint/);
    await expect(seams.blindValueWith(context, Days.from(1n), () => L)).rejects.toThrow(RangeError);
    await expect(seams.blindValueWith(context, Days.from(1n), () => -1n)).rejects.toThrow(
      RangeError,
    );
  });

  // REVIEW PLACEHOLDER (#56: a draw of 0n is a blinding factor like any other)
  //   blindValueWith draws again on 0n, and its opening is frozen
  //   -> blindValueWith uses a draw of 0n as it is: the commitment is m·g, its opening is frozen, and isOpeningOf accepts it
  // test("blindValueWith draws again on 0n, and its opening is frozen", async () => {
  //   const draws = [0n, 0n, 5n];
  //   const blinded = await seams.blindValueWith(
  //     seamContext(),
  //     Days.from(2n),
  //     () => draws.shift() ?? 0n,
  //   );
  //   expect(draws).toEqual([]);
  //   expect(blinded.blinding.value).toBe(5n);
  //   expect(Object.isFrozen(blinded)).toBe(true);
  // });
  test("blindValueWith uses a draw of 0n as it is: the commitment is m·g, its opening is frozen, and isOpeningOf accepts it", async () => {
    const draws = [0n, 0n, 5n];
    const context = seamContext();
    const x = Days.from(2n);
    const blinded = await seams.blindValueWith(context, x, () => draws.shift() ?? 0n);
    expect(draws).toEqual([0n, 5n]);
    expect(blinded.blinding.value).toBe(0n);
    expect(blinded.blinding.constructor).toBe(context.boundedInt());
    expect(blinded.commitment.equals(g().multiplyScalar(x.value))).toBe(true);
    expect(Object.isFrozen(blinded)).toBe(true);
    expect(await context.isOpeningOf(blinded)).toBe(true);
  });

  test("the seams refuse what is not a context", async () => {
    expect(() => seams.queuedBlindings({} as BlindingContext<RistrettoElement>)).toThrow(TypeError);
    await expect(
      seams.blindWith({} as BlindingContext<RistrettoElement>, 1n, () => 1n),
    ).rejects.toThrow(TypeError);
    await expect(
      seams.blindValueWith({} as BlindingContext<RistrettoElement>, Days.from(1n), () => 1n),
    ).rejects.toThrow(/^blindValueWith: context must be a BlindingContext$/);
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
      ORDER: RistrettoElement.ORDER,
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

  test("RistrettoElement given as the group makes the age-check context", async () => {
    const context = ageCheckContext();
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

  test("over a group of its own, a value must still be a bounded integer, and a commitment is refused by the group's equals", async () => {
    const group = plainGroup();
    const context = BlindingContext.fromEncoded(await hOf(group), message(), group);
    await expect(context.blind(1n as unknown as GenericBoundedInt)).rejects.toThrow(
      /^BlindingContext\.blind: x must be a bounded integer$/,
    );
    const Z = context.boundedInt();
    expect(Z.name).toBe("EdgeScalar");
    const bad = {
      commitment: {} as RistrettoElement,
      value: Days.fromValue(1n),
      blinding: Z.fromValue(1n),
    };
    await expect(context.isOpeningOf(bad)).rejects.toThrow(TypeError);
  });

  // REVIEW PLACEHOLDER (#56: a scalar of 0n drawn by the group is kept)
  //   a scalar of 0n drawn by the group is drawn again, for blind and for the queue
  //   -> a scalar of 0n drawn by the group is kept, for blind and for the queue
  // test("a scalar of 0n drawn by the group is drawn again, for blind and for the queue", async () => {
  //   let draws = 0;
  //   const group = plainGroup({
  //     randomScalar: () => (++draws % 2 === 1 ? 0n : RistrettoElement.randomScalar()),
  //   });
  //   const context = BlindingContext.fromEncoded(await hOf(group), message(), group);
  //   const blinded = await context.blind(Days.from(5n));
  //   expect(blinded.blinding.value).not.toBe(0n);
  //   expect(draws).toBeGreaterThanOrEqual(2);
  //   await macrotasks(20);
  //   expect(await context.isOpeningOf(blinded)).toBe(true);
  // });
  test("a scalar of 0n drawn by the group is kept, for blind and for the queue", async () => {
    // The draws: 0n, one random scalar, then 0n for ever. A group that drew 0n every time
    // would make a context that draws again on 0n loop for ever.
    let draws = 0;
    const group = plainGroup({
      randomScalar: () => (++draws === 2 ? RistrettoElement.randomScalar() : 0n),
    });
    const context = BlindingContext.fromEncoded(await hOf(group), message(), group);
    const first = await context.blind(Days.from(5n));
    expect(first.blinding.value).toBe(0n);
    expect(first.commitment.equals(group.canonicalGenerator().multiplyScalar(5n))).toBe(true);
    await macrotasks(20);
    // The random scalar, then nine 0n.
    expect(seams.queuedBlindings(context)).toBe(10);
    // Takes the random scalar from the queue as its s.
    expect(await context.isOpeningOf(first)).toBe(true);
    // Takes a 0n from the queue as its r.
    const second = await context.blind(Days.from(7n));
    expect(second.blinding.value).toBe(0n);
    expect(second.commitment.equals(group.canonicalGenerator().multiplyScalar(7n))).toBe(true);
    expect(await context.isOpeningOf(second)).toBe(true);
  });

  test("a group of a small order: the class 0 … 6 of ORDER 7, and the classes that fit it", async () => {
    const group = plainGroup({
      SUITE_NAME: "Seven",
      GENERATOR_DST: "vc-proofs-test-seven",
      ORDER: 7n,
      // The draws stay within the class of the group: 0 … 6.
      randomScalar: () => RistrettoElement.randomScalar() % 7n,
    });
    const context = BlindingContext.fromEncoded(await hOf(group), message(), group);
    const Z = context.boundedInt();
    expect([Z.name, Z.low, Z.high]).toEqual(["SevenScalar", 0n, 6n]);
    const Week = Z.define({ name: "Week", min: -0.5, max: 6.5 });
    const blinded = await context.blind(Week.from(3n));
    expect(blinded.blinding.constructor).toBe(Z);
    // REVIEW PLACEHOLDER (#56: a blinding factor may be 0)
    //   the same test, with the range of the blinding factor 1 … 6 -> 0 … 6:
    //   expect(blinded.blinding.value >= 1n && blinded.blinding.value <= 6n).toBe(true);
    expect(blinded.blinding.value >= 0n && blinded.blinding.value <= 6n).toBe(true);
    expect(await context.isOpeningOf(blinded)).toBe(true);
    // Eight integers do not fit; nor does the class of ristretto255.
    const Eight = wide("Eight", 8n);
    await expect(context.blind(Eight.fromValue(0n))).rejects.toThrow(
      /^BlindingContext\.blind: Eight holds more values than the group Seven has scalars$/,
    );
    await expect(context.blind(Days.from(3n))).rejects.toThrow(
      /^BlindingContext\.blind: Days holds more values than the group Seven has scalars$/,
    );
    expect(() => Z.define({ name: "Eight", min: -0.5, max: 7.5 })).toThrow(RangeError);
  });

  test("a context over another group and a ristretto255 context side by side: each opening is a TypeError in the other context, whose class of blinding factors differs", async () => {
    const group = plainGroup();
    const other = BlindingContext.fromEncoded(await hOf(group), message(), group);
    const age = ageCheckContext();
    expect(other.group).toBe(group);
    expect(age.group).toBe(RistrettoElement);
    expect(new TextDecoder().decode((await other.serialize()).subarray(0, 4))).toBe("Edge");
    expect(hex(await age.serialize())).toBe(contextVectors.context.serialized);
    expect(other.boundedInt()).not.toBe(age.boundedInt());
    const x = Days.from(5n);
    const fromOther = await other.blind(x);
    const fromAge = await age.blind(x);
    expect(await other.isOpeningOf(fromOther)).toBe(true);
    expect(await age.isOpeningOf(fromAge)).toBe(true);
    // Each opening holds only in the context that made it: elsewhere, its blinding factor
    // is of another class.
    await expect(age.isOpeningOf(fromOther)).rejects.toThrow(
      /opening\.blinding must be a Ristretto255Scalar/,
    );
    await expect(other.isOpeningOf(fromAge)).rejects.toThrow(
      /opening\.blinding must be a EdgeScalar/,
    );
    // The same integers, as a blinding factor of the right class: the opening is false.
    const moved = { ...fromOther, blinding: Scalar.fromValue(fromOther.blinding.value) };
    expect(await age.isOpeningOf(moved)).toBe(false);
  });

  test("the types are inferred from the group, with no default, and values and blinding factors are bounded integers", async () => {
    // Checked by tsc, which type-checks the tests; at run time these are no-ops.
    expectTypeOf(RistrettoElement).toExtend<Group<RistrettoElement>>();
    expectTypeOf<ReturnType<typeof RistrettoElement.randomScalar>>().toEqualTypeOf<bigint>();
    expectTypeOf<Parameters<RistrettoElement["multiplyScalar"]>[0]>().toEqualTypeOf<bigint>();
    type Context = BlindingContext<RistrettoElement>;
    type Opening = Blinded<RistrettoElement>;
    // No default: the parameter is inferred from the group, never assumed.
    // @ts-expect-error -- BlindingContext needs the type of its elements
    expectTypeOf<BlindingContext>();
    // @ts-expect-error -- Blinded needs the type of its elements
    expectTypeOf<Blinded>();
    // @ts-expect-error -- Committed needs the type of its elements
    expectTypeOf<Committed>();
    const age = ageCheckContext();
    expectTypeOf(age).toEqualTypeOf<Context>();
    expectTypeOf(age.h()).toEqualTypeOf<Promise<RistrettoElement>>();
    expectTypeOf<Parameters<Context["blind"]>[0]>().toEqualTypeOf<GenericBoundedInt>();
    expectTypeOf<Awaited<ReturnType<Context["blind"]>>>().toEqualTypeOf<Opening>();
    expectTypeOf<Opening["blinding"]>().toEqualTypeOf<GenericBoundedInt>();
    expectTypeOf<Parameters<Context["isOpeningOf"]>[0]>().toEqualTypeOf<Opening>();
    expectTypeOf(age.boundedInt()).toEqualTypeOf<typeof GenericBoundedInt>();
    // The group is required: fromEncoded takes exactly three parameters, none optional.
    expectTypeOf<Parameters<typeof BlindingContext.fromEncoded>["length"]>().toEqualTypeOf<3>();
    const group = plainGroup();
    const other = BlindingContext.fromEncoded(await hOf(group), message(), group);
    expectTypeOf(other).toEqualTypeOf<Context>();
    expectTypeOf(other.group).toEqualTypeOf<Group<RistrettoElement>>();
    expect((await other.h()).equals(RistrettoElement.decode(await hOf(group)))).toBe(true);
  });
});

describe("bigint scalars far beyond ℓ, through blindWith", () => {
  /** A value of the class of the group: the residue of `n` mod ℓ. */
  const residue = (n: bigint) => Scalar.fromValue(((n % L) + L) % L);

  test("blindWith of huge and negative bigint scalars counts mod ℓ, and isOpeningOf opens them by their residues", async () => {
    const context = seamContext();
    for (const m of [-(2n ** 1024n) + 3n, 2n ** 512n - 1n, -L - 1n]) {
      const r = 2n ** 300n + 17n;
      const { commitment } = await seams.blindWith(context, m, () => r);
      const opened = { commitment, value: residue(m), blinding: residue(r) };
      expect(await context.isOpeningOf(opened), String(m)).toBe(true);
      const next = { ...opened, value: Scalar.fromValue((residue(m).value + 1n) % L) };
      expect(await context.isOpeningOf(next)).toBe(false);
    }
  });

  test("blindWith of a huge negative draw commits with its residue", async () => {
    const context = seamContext();
    const r = -(2n ** 600n) - 11n;
    const { commitment, blinding } = await seams.blindWith(context, 9n, () => r);
    expect(blinding).toBe(r);
    const opened = { commitment, value: Days.fromValue(9n), blinding: residue(r) };
    expect(await context.isOpeningOf(opened)).toBe(true);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #40    | new: the edge cases of BlindingContext, of its group, of bigint scalars (#39) |
// | #55    | values are bounded integers; a missing group, bad ORDER, wrong classes, the class of a group, order 7 (#48) |
// | #60    | a draw of 0n is kept, by the seams and by the group; isOpeningOf of a blinding factor of 0n (#56) |
