/**
 * The `BoundedInt` of `./core` (#49; docs/core/bounded-int.md): the integer of Z_ℓ, a
 * subclass of the generic class of `src/core/bounded-int.ts`, defined in
 * `src/core/ristretto.ts`. Its scale is 0, its bounds `[−0.5, ℓ − 0.5)` are `ℓ` equal
 * buckets, one for each integer from 0 to `ℓ − 1`: `low` is `0n`, `high` is `ℓ − 1n`. It has
 * no `order` (#52): a class holds no more values than its parent, so no class made from it,
 * by `define` or by hand, holds more than `ℓ`. Its `define` is the generic one, typed as the
 * class it is called on. It takes no `number`: its values need 76 digits. The same file runs
 * in Node.js and in every headless browser.
 */
import { describe, expect, expectTypeOf, test } from "vitest";
import { BoundedInt as GenericBoundedInt } from "../src/core/bounded-int.js";
import { BoundedInt, RistrettoElement } from "../src/core/index.js";

/** `ℓ`, the order of ristretto255. */
const L = RistrettoElement.ORDER;

/** `ℓ − 0.5`, the bound `max` of `BoundedInt`, as an exact decimal. */
const MAX = [10n * L - 5n, -1] as const;

describe("BoundedInt of ./core: the integer of Z_ℓ", () => {
  // REVIEW PLACEHOLDER (#52: no order)
  // its constants: scale 0, the bounds [−0.5, ℓ − 0.5), the order ℓ, no error; the class is frozen
  //   -> its constants: scale 0, the bounds [−0.5, ℓ − 0.5), no order, no error; low 0n, high ℓ − 1n; the class is frozen
  //   expect(BoundedInt.order).toBe(L);
  test("its constants: scale 0, the bounds [−0.5, ℓ − 0.5), no order, no error; low 0n, high ℓ − 1n; the class is frozen", () => {
    expect(BoundedInt.scale).toBe(0);
    expect(BoundedInt.min).toBe(-0.5);
    expect(BoundedInt.max).toEqual(MAX);
    expect("order" in BoundedInt).toBe(false);
    expect([BoundedInt.low, BoundedInt.high]).toEqual([0n, L - 1n]);
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

describe("BoundedInt.define of ./core: no class made from it holds more than ℓ integers", () => {
  // REVIEW PLACEHOLDER (#52: no order; a class holds no more values than its parent)
  // a class made by define inherits the order ℓ, and so does a class made from it
  //   -> a class made by define holds at most ℓ integers, and a class made from it no more than its parent
  // define refuses the order 256n / ℓ / RistrettoElement with a TypeError
  //   -> define ignores an order in its spec: it is no limit
  // the define of a class made from BoundedInt refuses an order too
  //   -> define ignores an order in its spec: it is no limit
  // { min: 0n, max: ℓ } holds ℓ + 1 integers and is refused; [−0.5, ℓ − 0.5) holds ℓ and is accepted
  //   -> converted in place: the message names BoundedInt
  // the types: the spec of define has no order, on BoundedInt and on the classes made from it
  //   -> the types: define returns the type of the class it is called on, a class written by hand too
  // test("a class made by define inherits the order ℓ, and so does a class made from it", () => {
  //   const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
  //   expect(Mass.order).toBe(L);
  //   expect(Mass.from(2.3).value).toBe(23n);
  //   const Light = Mass.define({ name: "Light", min: 0, max: 10.05, step: 0.1 });
  //   expect(Light.order).toBe(L);
  //   expect(Light.from(2.3).value).toBe(23n);
  // });
  //
  // test.each([
  //   ["256n", 256n],
  //   ["ℓ", L],
  //   ["RistrettoElement", RistrettoElement],
  // ] as const)("define refuses the order %s with a TypeError", (_, order) => {
  //   const spec = { name: "Byte", min: -0.5, max: 255.5, order };
  //   expect(() => BoundedInt.define(spec as never)).toThrow(TypeError);
  //   expect(() => BoundedInt.define(spec as never)).toThrow(/^BoundedInt\.define: /);
  // });
  //
  // test("the define of a class made from BoundedInt refuses an order too", () => {
  //   const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
  //   const spec = { name: "Light", min: 0, max: 10.05, step: 0.1, order: 1001n };
  //   expect(() => Mass.define(spec as never)).toThrow(TypeError);
  //   expect(() => Mass.define(spec as never)).toThrow(/^Mass\.define: /);
  // });
  //
  // test("{ min: 0n, max: ℓ } holds ℓ + 1 integers and is refused; [−0.5, ℓ − 0.5) holds ℓ and is accepted", () => {
  //   expect(() => BoundedInt.define({ name: "Full", min: 0n, max: L })).toThrow(RangeError);
  //   const Buckets = BoundedInt.define({ name: "Buckets", min: -0.5, max: MAX });
  //   expect(Buckets.fromValue(L - 1n).value).toBe(L - 1n);
  // });
  //
  // test("the types: the spec of define has no order, on BoundedInt and on the classes made from it", () => {
  //   // @ts-expect-error: define takes no order
  //   expect(() => BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5, order: 256n })).toThrow(
  //     TypeError,
  //   );
  //   const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
  //   // @ts-expect-error: nor does the define of a class made from it
  //   expect(() => Mass.define({ name: "Light", min: 0, max: 10.05, order: 256n })).toThrow(
  //     TypeError,
  //   );
  //   expectTypeOf(Mass).toEqualTypeOf<typeof BoundedInt>();
  // });
  test("a class made by define holds at most ℓ integers, and a class made from it no more than its parent", () => {
    const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
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
    expect(() => BoundedInt.define({ name: "Full", min: 0n, max: L })).toThrow(RangeError);
    expect(() => BoundedInt.define({ name: "Full", min: 0n, max: L })).toThrow(
      /^BoundedInt\.define: Full must not hold more values than BoundedInt: /,
    );
    const Buckets = BoundedInt.define({ name: "Buckets", min: -0.5, max: MAX });
    expect(Buckets.fromValue(L - 1n).value).toBe(L - 1n);
  });

  test("ℓ integers anywhere: [ℓ, 2ℓ − 0.5), the integers ℓ … 2ℓ − 1, is accepted", () => {
    const Next = BoundedInt.define({ name: "Next", min: L, max: [20n * L - 5n, -1] });
    expect([Next.low, Next.high]).toEqual([L, 2n * L - 1n]);
  });

  test.each([
    ["256n", 256n],
    ["ℓ", L],
    ["RistrettoElement", RistrettoElement],
  ] as const)("define ignores an order in its spec: it is no limit (%s)", (_, order) => {
    const spec = { name: "Wide", min: -0.5, max: 299.5, order };
    const Wide = BoundedInt.define(spec);
    expect(Wide.high).toBe(299n);
    expect(Object.hasOwn(Wide, "order")).toBe(false);
    const Light = Wide.define({ ...spec, name: "Light" });
    expect(Light.high).toBe(299n);
  });

  test("the types: define returns the type of the class it is called on, a class written by hand too", () => {
    const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
    expectTypeOf(Mass).toEqualTypeOf<typeof BoundedInt>();
    class Tagged extends BoundedInt {
      static readonly tag: string = "tagged";
    }
    const Small = Tagged.define({ name: "Small", min: -0.5, max: 9.5 });
    expectTypeOf(Small).toEqualTypeOf<typeof Tagged>();
    expect(Small.tag).toBe("tagged");
    expect(Object.getPrototypeOf(Small)).toBe(Tagged);
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
    expect("order" in GenericBoundedInt).toBe(false);
  });

  test("a class made by its define is a frozen subclass of it, whose prototype chain reaches the generic class", () => {
    const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
    expect(Object.isFrozen(Mass)).toBe(true);
    expect(Object.getPrototypeOf(Mass)).toBe(BoundedInt);
    expect(Object.getPrototypeOf(BoundedInt)).toBe(GenericBoundedInt);
    expect(Mass.from(0)).toBeInstanceOf(Mass);
  });

  // REVIEW PLACEHOLDER (#52: no order; a class holds no more values than its parent)
  // a class written by hand may redeclare the order: nothing prevents it
  //   -> a class written by hand holds no more than ℓ integers, refused at its first use
  //   -> a class written by hand bounds the classes made from it: Byte, of 256 values, refuses one of 257
  // test("a class written by hand may redeclare the order: nothing prevents it", () => {
  //   class Byte extends BoundedInt {
  //     static override readonly min = -0.5;
  //     static override readonly max = 255.5;
  //     static override readonly order = 256n;
  //   }
  //   expect(Byte.order).toBe(256n);
  //   expect(Byte.from(5).value).toBe(5n);
  //   expect(BoundedInt.order).toBe(L);
  // });
  test("a class written by hand holds no more than ℓ integers, refused at its first use", () => {
    class Full extends BoundedInt {
      static override readonly min = 0n;
      static override readonly max = L;
    }
    expect(() => Full.from(5n)).toThrow(RangeError);
    expect(() => Full.from(5n)).toThrow(
      /^Full\.from: Full must not hold more values than BoundedInt: /,
    );
  });

  test("a class written by hand bounds the classes made from it: Byte, of 256 values, refuses one of 257", () => {
    class Byte extends BoundedInt {
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

describe("BoundedInt of ./core: edge cases", () => {
  // REVIEW PLACEHOLDER (#52: no order)
  // define accepts order: undefined, as if left out: the class inherits ℓ
  //   -> define accepts order: undefined, ignored as any other key
  //   expect(Byte.order).toBe(L);
  test("define accepts order: undefined, ignored as any other key", () => {
    // The type refuses it (exactOptionalPropertyTypes); a caller in JavaScript may pass it.
    const spec = { name: "Byte", min: -0.5, max: 255.5, order: undefined };
    const Byte = BoundedInt.define(spec);
    expect("order" in Byte).toBe(false);
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
