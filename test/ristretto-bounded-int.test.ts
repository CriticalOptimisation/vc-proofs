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
