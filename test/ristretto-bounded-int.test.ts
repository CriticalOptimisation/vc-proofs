/**
 * The `BoundedInt` of `./core` (#49; docs/core/bounded-int.md): the integer of Z_ℓ, a
 * subclass of the generic class of `src/core/bounded-int.ts`, defined in
 * `src/core/ristretto.ts`. Its scale is 0, its bounds `[−0.5, ℓ − 0.5)` are `ℓ` equal
 * buckets, one for each integer from 0 to `ℓ − 1`, and its order is `ℓ`, which every class
 * made from it inherits. Its `define` takes no `order`. It takes no `number`: its values need
 * 76 digits. A class written by hand may still redeclare `order`: nothing prevents it. The
 * same file runs in Node.js and in every headless browser.
 */
import { describe, expect, expectTypeOf, test } from "vitest";
import { BoundedInt as GenericBoundedInt } from "../src/core/bounded-int.js";
import { BoundedInt, RistrettoElement } from "../src/core/index.js";

/** `ℓ`, the order of ristretto255. */
const L = RistrettoElement.ORDER;

/** `ℓ − 0.5`, the bound `max` of `BoundedInt`, as an exact decimal. */
const MAX = [10n * L - 5n, -1] as const;

describe("BoundedInt of ./core: the integer of Z_ℓ", () => {
  test("its constants: scale 0, the bounds [−0.5, ℓ − 0.5), the order ℓ, no error; the class is frozen", () => {
    expect(BoundedInt.scale).toBe(0);
    expect(BoundedInt.min).toBe(-0.5);
    expect(BoundedInt.max).toEqual(MAX);
    expect(BoundedInt.order).toBe(L);
    expect(BoundedInt.error).toBeUndefined();
    expect(Object.isFrozen(BoundedInt)).toBe(true);
  });

  test("fromValue takes the ℓ integers 0 … ℓ − 1, and refuses −1 and ℓ", () => {
    expect(BoundedInt.fromValue(0n).value).toBe(0n);
    expect(BoundedInt.fromValue(L - 1n).value).toBe(L - 1n);
    expect(() => BoundedInt.fromValue(-1n)).toThrow(RangeError);
    expect(() => BoundedInt.fromValue(L)).toThrow(RangeError);
    expect(() => BoundedInt.fromValue(L)).toThrow(/^BoundedInt\.fromValue: /);
  });

  test("from rounds each bucket [i − 0.5, i + 0.5) to i: −0.5 gives 0, ℓ − 0.6 gives ℓ − 1; below −0.5 and from ℓ − 0.5 it is refused", () => {
    expect(BoundedInt.from(5n).value).toBe(5n);
    expect(BoundedInt.from([15n, -1]).value).toBe(2n);
    expect(BoundedInt.from([-5n, -1]).value).toBe(0n);
    expect(BoundedInt.from([10n * L - 6n, -1]).value).toBe(L - 1n);
    expect(() => BoundedInt.from([-6n, -1])).toThrow(RangeError);
    expect(() => BoundedInt.from(-1n)).toThrow(RangeError);
    expect(() => BoundedInt.from(MAX)).toThrow(RangeError);
    expect(() => BoundedInt.from(MAX)).toThrow(/^BoundedInt\.from: /);
  });

  test("from takes no number: BoundedInt needs 76 digits", () => {
    expect(() => BoundedInt.from(5)).toThrow(TypeError);
    expect(() => BoundedInt.from(5)).toThrow(/^BoundedInt\.from: .*bigint/);
  });
});

describe("BoundedInt.define of ./core: no order, the order ℓ inherited", () => {
  test("a class made by define inherits the order ℓ, and so does a class made from it", () => {
    const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
    expect(Mass.order).toBe(L);
    expect(Mass.from(2.3).value).toBe(23n);
    const Light = Mass.define({ name: "Light", min: 0, max: 10.05, step: 0.1 });
    expect(Light.order).toBe(L);
    expect(Light.from(2.3).value).toBe(23n);
  });

  test.each([
    ["256n", 256n],
    ["ℓ", L],
    ["RistrettoElement", RistrettoElement],
  ] as const)("define refuses the order %s with a TypeError", (_, order) => {
    const spec = { name: "Byte", min: -0.5, max: 255.5, order };
    expect(() => BoundedInt.define(spec as never)).toThrow(TypeError);
    expect(() => BoundedInt.define(spec as never)).toThrow(/^BoundedInt\.define: /);
  });

  test("the define of a class made from BoundedInt refuses an order too", () => {
    const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
    const spec = { name: "Light", min: 0, max: 10.05, step: 0.1, order: 1001n };
    expect(() => Mass.define(spec as never)).toThrow(TypeError);
    expect(() => Mass.define(spec as never)).toThrow(/^Mass\.define: /);
  });

  test("{ min: 0n, max: ℓ } holds ℓ + 1 integers and is refused; [−0.5, ℓ − 0.5) holds ℓ and is accepted", () => {
    expect(() => BoundedInt.define({ name: "Full", min: 0n, max: L })).toThrow(RangeError);
    const Buckets = BoundedInt.define({ name: "Buckets", min: -0.5, max: MAX });
    expect(Buckets.fromValue(L - 1n).value).toBe(L - 1n);
  });

  test("the types: the spec of define has no order, on BoundedInt and on the classes made from it", () => {
    // @ts-expect-error: define takes no order
    expect(() => BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5, order: 256n })).toThrow(
      TypeError,
    );
    const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
    // @ts-expect-error: nor does the define of a class made from it
    expect(() => Mass.define({ name: "Light", min: 0, max: 10.05, order: 256n })).toThrow(
      TypeError,
    );
    expectTypeOf(Mass).toEqualTypeOf<typeof BoundedInt>();
  });
});

describe("BoundedInt of ./core and the generic class", () => {
  test("it extends the generic class of bounded-int.ts; its instances are instances of both; its messages name BoundedInt", () => {
    expect(BoundedInt).not.toBe(GenericBoundedInt);
    expect(Object.getPrototypeOf(BoundedInt)).toBe(GenericBoundedInt);
    expect(BoundedInt.name).toBe("BoundedInt");
    const x = BoundedInt.from(5n);
    expect(x).toBeInstanceOf(BoundedInt);
    expect(x).toBeInstanceOf(GenericBoundedInt);
    expect(GenericBoundedInt.order).toBeUndefined();
  });

  test("a class made by its define is a frozen subclass of it, whose prototype chain reaches the generic class", () => {
    const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
    expect(Object.isFrozen(Mass)).toBe(true);
    expect(Object.getPrototypeOf(Mass)).toBe(BoundedInt);
    expect(Object.getPrototypeOf(BoundedInt)).toBe(GenericBoundedInt);
    expect(Mass.from(0)).toBeInstanceOf(Mass);
  });

  test("a class written by hand may redeclare the order: nothing prevents it", () => {
    class Byte extends BoundedInt {
      static override readonly min = -0.5;
      static override readonly max = 255.5;
      static override readonly order = 256n;
    }
    expect(Byte.order).toBe(256n);
    expect(Byte.from(5).value).toBe(5n);
    expect(BoundedInt.order).toBe(L);
  });
});

describe("BoundedInt of ./core: edge cases", () => {
  test("define accepts order: undefined, as if left out: the class inherits ℓ", () => {
    // The type refuses it (exactOptionalPropertyTypes); a caller in JavaScript may pass it.
    const spec = { name: "Byte", min: -0.5, max: 255.5, order: undefined };
    const Byte = BoundedInt.define(spec as never);
    expect(Byte.order).toBe(L);
    expect(Byte.from(255).value).toBe(255n);
  });

  test.each([
    ["null", null],
    ["a string", "Byte"],
    ["a bigint", 256n],
  ] as const)("define on %s keeps the TypeError of the generic define", (_, spec) => {
    expect(() => BoundedInt.define(spec as never)).toThrow(TypeError);
    expect(() => BoundedInt.define(spec as never)).toThrow(
      /^BoundedInt\.define: spec must be an object$/,
    );
  });

  test("valueOf() and toString() of ℓ − 1: the nearest number, and the 76 exact digits", () => {
    const top = BoundedInt.fromValue(L - 1n);
    expect(top.toString()).toBe((L - 1n).toString());
    expect(top.toString()).toHaveLength(76);
    expect(top.valueOf()).toBe(Number(L - 1n));
  });

  test("errorBound is ½ / ℓ: half a step over the ℓ steps of [−0.5, ℓ − 0.5)", () => {
    const expected = 0.5 / Number(L);
    expect(Math.abs(BoundedInt.errorBound - expected) / expected).toBeLessThan(1e-15);
    expect(BoundedInt.quadraticError).toBe(BoundedInt.errorBound);
    expect(BoundedInt.termError).toBe(BoundedInt.errorBound);
  });

  test("the ties near the top round to even: ℓ − 1.5 gives ℓ − 1, ℓ − 2.5 gives ℓ − 3 (ℓ is odd)", () => {
    expect(L % 2n).toBe(1n);
    expect(BoundedInt.from([10n * L - 15n, -1]).value).toBe(L - 1n);
    expect(BoundedInt.from([10n * L - 25n, -1]).value).toBe(L - 3n);
  });

  test("at 400 digits: just below max gives ℓ − 1, just below min is refused", () => {
    const tiny = 10n ** 399n;
    expect(BoundedInt.from([(10n * L - 5n) * tiny - 1n, -400]).value).toBe(L - 1n);
    expect(BoundedInt.from([-5n * tiny, -400]).value).toBe(0n);
    expect(() => BoundedInt.from([-5n * tiny - 1n, -400])).toThrow(RangeError);
    expect(() => BoundedInt.from([-5n * tiny - 1n, -400])).toThrow(
      /^BoundedInt\.from: x is below BoundedInt\.min$/,
    );
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #51    | new: the BoundedInt of Z_ℓ, its define without order, and its edge cases (#49) |
