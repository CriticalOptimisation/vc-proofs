/**
 * The class of ristretto255, `context.boundedInt` of a context over `RistrettoElement` (#49, #48;
 * docs/core/blinding-context.md, The class of a group): the integers of Z_ℓ, a subclass of
 * the generic class of `src/core/bounded-int.ts`, named `Ristretto255Scalar`. Its scale is
 * 0, its bounds `[−0.5, ℓ − 0.5)` are `ℓ` equal buckets, one for each integer from 0 to
 * `ℓ − 1`: `low` is `0n`, `high` is `ℓ − 1n`. A class holds no more values than its parent
 * (#52), so no class made from it, by `define` or by hand, holds more than `ℓ`. Its
 * `define` is the generic one, typed as the class it is called on. It takes no `number`:
 * its values need 76 digits. `./core` exports no `BoundedInt` (#48). The same file runs in
 * Node.js and in every headless browser.
 *
 * The class is looked up on a context, `context.boundedInt`. The context is the age-check
 * one of test/vectors/generator-h.json; the class does not await its validation.
 */
import { describe, expect, expectTypeOf, test } from "vitest";
import { BoundedInt as GenericBoundedInt } from "../src/core/bounded-int.js";
import { BlindingContext, RistrettoElement } from "../src/core/index.js";
import generatorVectors from "./vectors/generator-h.json" with { type: "json" };

/** `ℓ`, the order of ristretto255. */
const L = RistrettoElement.ORDER;

/** `ℓ − 0.5`, the bound `max` of the class, as an exact decimal. */
const MAX = [10n * L - 5n, -1] as const;

function fromHex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** The age-check vector of test/vectors/generator-h.json. */
const ageCheck = generatorVectors.vectors.find((v) => v.name === "age-check");
if (ageCheck === undefined) throw new Error("no generator vector age-check");

/** `context.boundedInt`, the class of ristretto255. */
const Scalar = BlindingContext.fromEncoded(
  fromHex(ageCheck.h),
  fromHex(ageCheck.messageHex),
  RistrettoElement,
).boundedInt;

describe("context.boundedInt of ristretto255: the integer of Z_ℓ", () => {
  // REVIEW PLACEHOLDER (#58: define stores the errors of every class it makes, half a step by default)
  // its constants: scale 0, the bounds [−0.5, ℓ − 0.5), no order, no error; low 0n, high ℓ − 1n; the class is frozen
  //   -> its constants: scale 0, the bounds [−0.5, ℓ − 0.5), no order, the errors of half a step; low 0n, high ℓ − 1n; the class is frozen
  //   expect(Scalar.error).toBeUndefined();
  test("its constants: scale 0, the bounds [−0.5, ℓ − 0.5), no order, the errors of half a step; low 0n, high ℓ − 1n; the class is frozen", () => {
    expect(Scalar.scale).toBe(0);
    expect(Scalar.min).toBe(-0.5);
    expect(Scalar.max).toEqual(MAX);
    expect("order" in Scalar).toBe(false);
    expect([Scalar.low, Scalar.high]).toEqual([0n, L - 1n]);
    expect(Scalar.error as unknown).toStrictEqual({
      bound: [5n, -1],
      quadratic: [5n, -1],
      term: [5n, -1],
    });
    expect(Object.isFrozen(Scalar)).toBe(true);
  });

  test("context.boundedInt is a getter: it gives the class itself, the same object for every read and for every context over ristretto255", () => {
    const read = () =>
      (
        BlindingContext.fromEncoded(
          fromHex(ageCheck.h),
          fromHex(ageCheck.messageHex),
          RistrettoElement,
        ) as unknown as { readonly boundedInt: unknown }
      ).boundedInt;
    const first = read();
    expect(first).toBe(Scalar);
    expect(read()).toBe(first);
    expect((first as typeof GenericBoundedInt).fromValue(5n).value).toBe(5n);
    const getter = Object.getOwnPropertyDescriptor(BlindingContext.prototype, "boundedInt");
    expect(typeof getter?.get).toBe("function");
  });

  test("fromValue takes the ℓ integers 0 … ℓ − 1, and refuses −1 and ℓ", () => {
    expect(Scalar.fromValue(0n).value).toBe(0n);
    expect(Scalar.fromValue(L - 1n).value).toBe(L - 1n);
    expect(() => Scalar.fromValue(-1n)).toThrow(RangeError);
    expect(() => Scalar.fromValue(L)).toThrow(RangeError);
    expect(() => Scalar.fromValue(L)).toThrow(/^Ristretto255Scalar\.fromValue: /);
  });

  test("from rounds each bucket [i − 0.5, i + 0.5) to i: −0.5 gives 0, ℓ − 0.6 gives ℓ − 1; below −0.5 and from ℓ − 0.5 it is refused", () => {
    expect(Scalar.from(5n).value).toBe(5n);
    expect(Scalar.from([15n, -1]).value).toBe(2n);
    expect(Scalar.from([-5n, -1]).value).toBe(0n);
    expect(Scalar.from([10n * L - 6n, -1]).value).toBe(L - 1n);
    expect(() => Scalar.from([-6n, -1])).toThrow(RangeError);
    expect(() => Scalar.from(-1n)).toThrow(RangeError);
    expect(() => Scalar.from(MAX)).toThrow(RangeError);
    expect(() => Scalar.from(MAX)).toThrow(/^Ristretto255Scalar\.from: /);
  });

  test("from takes no number: Ristretto255Scalar needs 76 digits", () => {
    expect(() => Scalar.from(5)).toThrow(TypeError);
    expect(() => Scalar.from(5)).toThrow(/^Ristretto255Scalar\.from: .*bigint/);
  });
});

describe("the define of the class of ristretto255: no class made from it holds more than ℓ integers", () => {
  test("a class made by define holds at most ℓ integers, and a class made from it no more than its parent", () => {
    const Mass = Scalar.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
    expect(Mass.from(2.3).value).toBe(23n);
    expect("order" in Mass).toBe(false);
    const Light = Mass.define({ name: "Light", min: 0, max: 10.05, step: 0.1 });
    expect(Light.from(2.3).value).toBe(23n);
    expect(() => Mass.define({ name: "Heavy", min: 0, max: 100.15, step: 0.1 })).toThrow(
      /^Mass\.define: Heavy must not hold more values than Mass: 1002 > 1001$/,
    );
    expect([Mass.low, Mass.high]).toEqual([0n, 1000n]);
  });

  test("{ min: 0n, max: ℓ } holds ℓ + 1 integers and is refused; [−0.5, ℓ − 0.5) holds ℓ and is accepted", () => {
    expect(() => Scalar.define({ name: "Full", min: 0n, max: L })).toThrow(RangeError);
    expect(() => Scalar.define({ name: "Full", min: 0n, max: L })).toThrow(
      /^Ristretto255Scalar\.define: Full must not hold more values than Ristretto255Scalar: /,
    );
    const Buckets = Scalar.define({ name: "Buckets", min: -0.5, max: MAX });
    expect(Buckets.fromValue(L - 1n).value).toBe(L - 1n);
  });

  test("ℓ integers anywhere: [ℓ, 2ℓ − 0.5), the integers ℓ … 2ℓ − 1, is accepted", () => {
    const Next = Scalar.define({ name: "Next", min: L, max: [20n * L - 5n, -1] });
    expect([Next.low, Next.high]).toEqual([L, 2n * L - 1n]);
  });

  test.each([
    ["256n", 256n],
    ["ℓ", L],
    ["RistrettoElement", RistrettoElement],
  ] as const)("define ignores an order in its spec: it is no limit (%s)", (_, order) => {
    const spec = { name: "Wide", min: -0.5, max: 299.5, order };
    const Wide = Scalar.define(spec);
    expect(Wide.high).toBe(299n);
    expect(Object.hasOwn(Wide, "order")).toBe(false);
    const Light = Wide.define({ ...spec, name: "Light" });
    expect(Light.high).toBe(299n);
  });

  test("the types: define returns the type of the class it is called on, a class written by hand too", () => {
    const Mass = Scalar.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
    expectTypeOf(Mass).toEqualTypeOf<typeof Scalar>();
    class Tagged extends Scalar {
      static readonly tag: string = "tagged";
    }
    const Small = Tagged.define({ name: "Small", min: -0.5, max: 9.5 });
    expectTypeOf(Small).toEqualTypeOf<typeof Tagged>();
    expect(Small.tag).toBe("tagged");
    expect(Object.getPrototypeOf(Small)).toBe(Tagged);
  });
});

describe("the class of ristretto255 and the generic class", () => {
  test("it extends the generic class of bounded-int.ts; its instances are instances of both; its messages name Ristretto255Scalar", () => {
    expect(Scalar).not.toBe(GenericBoundedInt);
    expect(Object.getPrototypeOf(Scalar)).toBe(GenericBoundedInt);
    expect(Scalar.name).toBe("Ristretto255Scalar");
    const x = Scalar.from(5n);
    expect(x).toBeInstanceOf(Scalar);
    expect(x).toBeInstanceOf(GenericBoundedInt);
    expect("order" in GenericBoundedInt).toBe(false);
  });

  test("a class made by its define is a frozen subclass of it, whose prototype chain reaches the generic class", () => {
    const Mass = Scalar.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
    expect(Object.isFrozen(Mass)).toBe(true);
    expect(Object.getPrototypeOf(Mass)).toBe(Scalar);
    expect(Object.getPrototypeOf(Scalar)).toBe(GenericBoundedInt);
    expect(Mass.from(0)).toBeInstanceOf(Mass);
  });

  test("a class written by hand holds no more than ℓ integers, refused at its first use", () => {
    class Full extends Scalar {
      static override readonly min = 0n;
      static override readonly max = L;
    }
    expect(() => Full.from(5n)).toThrow(RangeError);
    expect(() => Full.from(5n)).toThrow(
      /^Full\.from: Full must not hold more values than Ristretto255Scalar: /,
    );
  });

  test("a class written by hand bounds the classes made from it: Byte, of 256 values, refuses one of 257", () => {
    class Byte extends Scalar {
      static override readonly min = -0.5;
      static override readonly max = 255.5;
    }
    expect(Byte.from(5).value).toBe(5n);
    expect(() => Byte.define({ name: "Wider", min: -0.5, max: 256.5 })).toThrow(
      /^Byte\.define: Wider must not hold more values than Byte: 257 > 256$/,
    );
    expect(Byte.define({ name: "Code", min: 999.5, max: 1255.5 }).high).toBe(1255n);
    expect([Byte.low, Byte.high]).toEqual([0n, 255n]);
  });
});

describe("the class of ristretto255: edge cases", () => {
  test("define accepts order: undefined, ignored as any other key", () => {
    // The type refuses it (exactOptionalPropertyTypes); a caller in JavaScript may pass it.
    const spec = { name: "Byte", min: -0.5, max: 255.5, order: undefined };
    const Byte = Scalar.define(spec);
    expect("order" in Byte).toBe(false);
    expect(Byte.from(255).value).toBe(255n);
  });

  test.each([
    ["null", null],
    ["a string", "Byte"],
    ["a bigint", 256n],
  ] as const)("define on %s keeps the TypeError of the generic define", (_, spec) => {
    expect(() => Scalar.define(spec as never)).toThrow(TypeError);
    expect(() => Scalar.define(spec as never)).toThrow(
      /^Ristretto255Scalar\.define: spec must be an object$/,
    );
  });

  test("valueOf() and toString() of ℓ − 1: the nearest number, and the 76 exact digits", () => {
    const top = Scalar.fromValue(L - 1n);
    expect(top.toString()).toBe((L - 1n).toString());
    expect(top.toString()).toHaveLength(76);
    expect(top.valueOf()).toBe(Number(L - 1n));
  });

  // REVIEW PLACEHOLDER (#58: errorBound is a number or undefined; undefined gives NaN, which fails)
  // errorBound is ½ / ℓ: half a step over the ℓ steps of [−0.5, ℓ − 0.5)
  //   expect(Math.abs(Scalar.errorBound - expected) / expected).toBeLessThan(1e-15);
  test("errorBound is ½ / ℓ: half a step over the ℓ steps of [−0.5, ℓ − 0.5)", () => {
    const expected = 0.5 / Number(L);
    expect(Math.abs((Scalar.errorBound ?? Number.NaN) - expected) / expected).toBeLessThan(1e-15);
    expect(Scalar.quadraticError).toBe(Scalar.errorBound);
    expect(Scalar.termError).toBe(Scalar.errorBound);
  });

  test("the ties near the top round to even: ℓ − 1.5 gives ℓ − 1, ℓ − 2.5 gives ℓ − 3 (ℓ is odd)", () => {
    expect(L % 2n).toBe(1n);
    expect(Scalar.from([10n * L - 15n, -1]).value).toBe(L - 1n);
    expect(Scalar.from([10n * L - 25n, -1]).value).toBe(L - 3n);
  });

  test("at 400 digits: just below max gives ℓ − 1, just below min is refused", () => {
    const tiny = 10n ** 399n;
    expect(Scalar.from([(10n * L - 5n) * tiny - 1n, -400]).value).toBe(L - 1n);
    expect(Scalar.from([-5n * tiny, -400]).value).toBe(0n);
    expect(() => Scalar.from([-5n * tiny - 1n, -400])).toThrow(RangeError);
    expect(() => Scalar.from([-5n * tiny - 1n, -400])).toThrow(
      /^Ristretto255Scalar\.from: x is below Ristretto255Scalar\.min$/,
    );
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #51    | new: the BoundedInt of Z_ℓ, its define without order, and its edge cases (#49) |
// | #53    | no order: at most ℓ integers, by define or by hand; low and high; define typed as its class (#52) |
// | #55    | the class of ristretto255 from context.boundedInt(), Ristretto255Scalar (#48) |
