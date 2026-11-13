/**
 * The classes of `BoundedInt` (#44; docs/core/bounded-int.md): a decimal scale, exact
 * semi-open bounds `[min, max)` checked before any rounding, one exact rounding with ties
 * to even, the integers `low … high` of a class and its number of values, no more than its
 * parent's (#52), the error of a class, and `define`. The classes and the table of
 * examples are those of the page (test/helpers/bounded-int-examples.ts). The same file
 * runs in Node.js and in every headless browser.
 */
import { describe, expect, test } from "vitest";
import { BoundedInt, type Quantity } from "../src/core/bounded-int.js";
import { RistrettoElement } from "../src/core/index.js";
import { classes, constants, examples } from "./helpers/bounded-int-examples.js";

/** The upper bound of `BoundedInt`, tied here to the order of ristretto255. */
const L = RistrettoElement.ORDER;

describe("BoundedInt.define: the class constants", () => {
  test.each(constants)(
    "%s has scale %s, the bounds [%s, %s), and the integers %s to %s",
    (name, scale, min, max, low, high) => {
      const C = classes()[name];
      expect([C.scale, C.min, C.max, C.name]).toEqual([scale, min, max, name]);
      expect(C.fromValue(low).value).toBe(low);
      expect(C.fromValue(high).value).toBe(high);
      expect(() => C.fromValue(low - 1n)).toThrow(RangeError);
      expect(() => C.fromValue(high + 1n)).toThrow(RangeError);
    },
  );

  test.each(constants)(
    "%s (scale %s, [%s, %s)) gives its integers as the static getters low = %s and high = %s",
    (name, _scale, _min, _max, low, high) => {
      const C = classes()[name];
      expect(C.low).toBe(low);
      expect(C.high).toBe(high);
    },
  );

  test.each(constants.map(([name]) => name))("%s is a frozen subclass of BoundedInt", (name) => {
    const C = classes()[name];
    expect(Object.isFrozen(C)).toBe(true);
    expect(Object.getPrototypeOf(C)).toBe(BoundedInt);
    expect(C.from(0)).toBeInstanceOf(C);
  });

  test("a step that is not a power of ten takes the next finer one: 0.025 gives the scale 2", () => {
    expect(BoundedInt.define({ name: "Fine", min: 0, max: 1, step: 0.025 }).scale).toBe(2);
  });

  test("BoundedInt has scale 0 and the bounds [0, 32767.5): the 15-bit integers 0 … 32767, low 0n and high 32767n; no order and no error", () => {
    expect([BoundedInt.scale, BoundedInt.min, BoundedInt.max]).toEqual([0, 0n, 32767.5]);
    expect([BoundedInt.low, BoundedInt.high]).toEqual([0n, 32767n]);
    expect("order" in BoundedInt).toBe(false);
    expect(BoundedInt.error).toBeUndefined();
    expect("integerOnly" in BoundedInt).toBe(false);
    expect(BoundedInt.fromValue(32767n).value).toBe(32767n);
    expect(() => BoundedInt.fromValue(32768n)).toThrow(RangeError);
  });

  test("a class that declares no constant has those of BoundedInt", () => {
    class Plain extends BoundedInt {}
    expect([Plain.scale, Plain.min, Plain.max]).toEqual([0, 0n, 32767.5]);
    expect(Plain.from(32767).value).toBe(32767n);
    expect(Plain.from(0.4).value).toBe(0n);
    expect(() => Plain.from(-1)).toThrow(RangeError);
    expect(() => Plain.from(-1)).toThrow(/^Plain\.from: /);
  });
});

describe("BoundedInt classes: the examples of the page", () => {
  const accepted = examples.filter((row) => row.throws === undefined);
  const refused = examples.filter((row) => row.throws !== undefined);

  test.each(accepted.map((row) => [row.call, row] as const))(
    "%s has the value, valueOf() and toString() of the page",
    (_, row) => {
      const x = row.run(classes());
      expect(x.value).toBe(row.value);
      expect(x.valueOf()).toBe(row.number);
      expect(x.toString()).toBe(row.string);
      expect(`<${x as unknown as string}>`).toBe(`<${row.string ?? ""}>`);
    },
  );

  test.each(refused.map((row) => [row.call, row] as const))(
    "%s throws the error of the page, which names the class",
    (_, row) => {
      const name = row.call.slice(0, row.call.indexOf("."));
      expect(() => row.run(classes())).toThrow(row.throws);
      expect(() => row.run(classes())).toThrow(new RegExp(name));
    },
  );
});

describe("BoundedInt classes: one rounding, ties to even", () => {
  test.each([
    [0.125, 12n],
    [0.135, 14n], // the number is just above 0.135: no tie
    [0.375, 38n],
    [-0.375, -38n],
    [0.625, 62n],
    [-0.625, -62n],
  ] as const)("Reading.from(%s).value is %s", (x, q) => {
    expect(classes().Reading.from(x).value).toBe(q);
  });

  test("rounding is symmetric: from(-x).value is -from(x).value", () => {
    const { Reading } = classes();
    for (const x of [0.005, 0.015, 0.125, 1.005, 7.775, 3.14159]) {
      expect(Reading.from(-x).value).toBe(-Reading.from(x).value);
    }
  });

  test("a bigint is an integer value, scaled exactly: Mass.from(5n) is 5 kg, Mass.fromValue(5n) is 0.5 kg", () => {
    const { Mass } = classes();
    expect(Mass.from(5n).valueOf()).toBe(5);
    expect(Mass.fromValue(5n).valueOf()).toBe(0.5);
  });

  test("with a negative scale, a bigint is rounded too: Volume.from(1500n) and Volume.from(2500n) are 2n", () => {
    const { Volume } = classes();
    expect(Volume.from(1500n).value).toBe(2n);
    expect(Volume.from(2500n).value).toBe(2n);
  });
});

describe("BoundedInt classes: the bounds [min, max), exact, before any rounding", () => {
  test("min is accepted and max refused; just below max is accepted", () => {
    const { Mass, Reading } = classes();
    expect(Mass.from(0).value).toBe(0n);
    expect(() => Mass.from(100.05)).toThrow(RangeError);
    expect(() => Mass.from(100.05)).toThrow(/^Mass\.from: .*Mass\.max/);
    expect(Mass.from([10004999n, -5]).value).toBe(1000n);
    // At 15 digits, the number written 100.04999999999998 is 100.05: refused.
    expect(() => Mass.from(100.04999999999998)).toThrow(RangeError);
    expect(Reading.from(-7.99).value).toBe(-799n);
    expect(() => Reading.from([-7990000000000001n, -15])).toThrow(RangeError);
  });

  test("a value beyond the bounds is refused, even when it would round into them", () => {
    const { Mass } = classes();
    expect(() => Mass.from(-0.04)).toThrow(RangeError);
    expect(() => Mass.from(-0.04)).toThrow(/^Mass\.from: .*Mass\.min/);
    const Load = BoundedInt.define({ name: "Load", min: 0n, max: 123124n, step: 1000n });
    expect(Load.from(123123n).value).toBe(123n);
    expect(() => Load.from(123455n)).toThrow(RangeError);
  });

  test("BoundedInt accepts 0 and 32767, and refuses −1, 32767.5, 32768 and 2^300", () => {
    expect(BoundedInt.from(0n).value).toBe(0n);
    expect(BoundedInt.from(32767).value).toBe(32767n);
    expect(BoundedInt.from(32767.4).value).toBe(32767n);
    expect(() => BoundedInt.from(-1n)).toThrow(RangeError);
    expect(() => BoundedInt.from(32767.5)).toThrow(RangeError);
    expect(() => BoundedInt.fromValue(32768n)).toThrow(/^BoundedInt\.fromValue: /);
    expect(() => BoundedInt.from(2n ** 300n)).toThrow(RangeError);
  });

  test("the bounds may lie anywhere, and need not be on the step", () => {
    const Far = BoundedInt.define({ name: "Far", min: L, max: L + 10n });
    expect(Far.from(L + 9n).value).toBe(L + 9n);
    expect(() => Far.from(L - 1n)).toThrow(RangeError);
    const Odd = BoundedInt.define({ name: "Odd", min: [5223n, -4], max: 1, step: 0.001 });
    expect(Odd.from([5223n, -4]).value).toBe(522n);
    expect(() => Odd.from([52229n, -5])).toThrow(RangeError);
  });
});

// REVIEW PLACEHOLDER (#52: no order; a class holds no more values than its parent)
// an unsigned byte is [−0.5, 255.5) at the step 1: its 256 values round to 0 … 255
//   -> an unsigned byte is [−0.5, 255.5) at the step 1: its 256 values round to 0 … 255, low 0n and high 255n
// a signed byte is [−128.5, 127.5): 256 values; [−128, 128) rounds to 257, one too many
//   -> a signed byte is [−128.5, 127.5): 256 values; made from it, [−128, 128) rounds to 257, one too many
// the order counts the values, fractions too: 0.00 … 2.55 at the step 0.01 are 256
//   -> a class of another step counts the same: 0.00 … 2.55 at the step 0.01 are 256, 0.00 … 2.56 are 257
// the order is a bigint or a form with ORDER, and is inherited
//   -> a class holds no more values than its parent: from Byte, Percent passes and Word is refused
//   -> define ignores an order in its spec, as any other key it does not know
// Byte declares the order 256n; Percent, made from it, inherits it; Word, of 65536 values, is refused
//   -> a class holds no more values than its parent: from Byte, Percent passes and Word is refused
//   -> a class made from BoundedInt has no limit: DayCount holds 365251 values, more than BoundedInt
// describe("BoundedInt classes: the order, the number of distinct values", () => {
//   test("an unsigned byte is [−0.5, 255.5) at the step 1: its 256 values round to 0 … 255", () => {
//     const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5, step: 1, order: 256n });
//     expect(Byte.order).toBe(256n);
//     expect(Byte.from(-0.5).value).toBe(0n);
//     expect(Byte.from(255.49).value).toBe(255n);
//     expect(() => Byte.from(255.5)).toThrow(RangeError);
//     expect(() => Byte.from(-0.51)).toThrow(RangeError);
//     expect(() =>
//       BoundedInt.define({ name: "Small", min: -0.5, max: 255.5, step: 1, order: 255n }),
//     ).toThrow(RangeError);
//   });
//
//   test("a signed byte is [−128.5, 127.5): 256 values; [−128, 128) rounds to 257, one too many", () => {
//     const Signed = BoundedInt.define({ name: "S", min: -128.5, max: 127.5, step: 1, order: 256n });
//     expect([Signed.fromValue(-128n).value, Signed.fromValue(127n).value]).toEqual([-128n, 127n]);
//     expect(() => BoundedInt.define({ name: "J", min: -128, max: 128, order: 256n })).toThrow(
//       RangeError,
//     );
//   });
//
//   test("the order counts the values, fractions too: 0.00 … 2.55 at the step 0.01 are 256", () => {
//     const Fine = BoundedInt.define({
//       name: "Fine",
//       min: [-5n, -3],
//       max: [2555n, -3],
//       step: 0.01,
//       order: 256n,
//     });
//     expect(Fine.from(2.55).value).toBe(255n);
//   });
//
//   test("the order is a bigint or a form with ORDER, and is inherited", () => {
//     const Group = { ORDER: 11n };
//     const A = BoundedInt.define({ name: "A", min: -0.5, max: 10.5, order: Group });
//     expect(A.order).toBe(11n);
//     const B = A.define({ name: "B", min: -0.5, max: 10.5 });
//     expect(B.order).toBe(11n);
//     expect(() => A.define({ name: "C", min: -0.5, max: 11.5 })).toThrow(RangeError);
//     expect(BoundedInt.define({ name: "D", min: 0, max: 1, order: RistrettoElement }).order).toBe(L);
//   });
// });
//
// describe("BoundedInt classes: an order roots a family of classes", () => {
//   test("Byte declares the order 256n; Percent, made from it, inherits it; Word, of 65536 values, is refused", () => {
//     const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5, step: 1, order: 256n });
//     const Percent = Byte.define({ name: "Percent", min: -0.5, max: 100.5, step: 1 });
//     expect(Percent.order).toBe(256n);
//     expect(Percent.from(100).value).toBe(100n);
//     expect(() => Byte.define({ name: "Word", min: -0.5, max: 65535.5, step: 1 })).toThrow(
//       RangeError,
//     );
//     expect(
//       BoundedInt.define({ name: "Word", min: -0.5, max: 65535.5, step: 1 }).order,
//     ).toBeUndefined();
//   });
// });
describe("BoundedInt classes: the number of values, high − low + 1", () => {
  test("an unsigned byte is [−0.5, 255.5) at the step 1: its 256 values round to 0 … 255, low 0n and high 255n", () => {
    const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5, step: 1 });
    expect([Byte.low, Byte.high]).toEqual([0n, 255n]);
    expect(Byte.from(-0.5).value).toBe(0n);
    expect(Byte.from(255.49).value).toBe(255n);
    expect(() => Byte.from(255.5)).toThrow(RangeError);
    expect(() => Byte.from(-0.51)).toThrow(RangeError);
  });

  test("a signed byte is [−128.5, 127.5): 256 values; made from it, [−128, 128) rounds to 257, one too many", () => {
    const Signed = BoundedInt.define({ name: "S", min: -128.5, max: 127.5, step: 1 });
    expect([Signed.fromValue(-128n).value, Signed.fromValue(127n).value]).toEqual([-128n, 127n]);
    expect(() => Signed.define({ name: "J", min: -128, max: 128 })).toThrow(RangeError);
    expect(() => Signed.define({ name: "J", min: -128, max: 128 })).toThrow(
      /^S\.define: J must not hold more values than S: 257 > 256$/,
    );
    expect([Signed.low, Signed.high]).toEqual([-128n, 127n]);
  });
});

describe("BoundedInt classes: no more values than the parent", () => {
  test("a class holds no more values than its parent: from Byte, Percent passes and Word is refused", () => {
    const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 });
    const Percent = Byte.define({ name: "Percent", min: -0.5, max: 100.5 });
    expect(() => Byte.define({ name: "Word", min: -0.5, max: 65535.5 })).toThrow(RangeError);
    expect(() => Byte.define({ name: "Word", min: -0.5, max: 65535.5 })).toThrow(
      /^Byte\.define: Word must not hold more values than Byte: 65536 > 256$/,
    );
    expect([Percent.low, Percent.high]).toEqual([0n, 100n]);
    expect(Percent.from(100).value).toBe(100n);
    const Same = Byte.define({ name: "Same", min: -0.5, max: 255.5 });
    expect(Same.high).toBe(255n);
  });

  test("only the number counts, not the place: Code, 1000 … 1255, outside Byte, passes; 1000 … 1256 is refused", () => {
    const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 });
    const Code = Byte.define({ name: "Code", min: 999.5, max: 1255.5 });
    expect(() => Byte.define({ name: "Wider", min: 999.5, max: 1256.5 })).toThrow(RangeError);
    expect([Code.low, Code.high]).toEqual([1000n, 1255n]);
    expect(Code.from(1255).value).toBe(1255n);
  });

  test("a class of another step counts the same: 0.00 … 2.55 at the step 0.01 are 256, 0.00 … 2.56 are 257", () => {
    const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 });
    const Cents = Byte.define({ name: "Cents", min: 0, max: 2.555, step: 0.01 });
    expect(() => Byte.define({ name: "More", min: 0, max: 2.565, step: 0.01 })).toThrow(RangeError);
    expect([Cents.scale, Cents.low, Cents.high]).toEqual([2, 0n, 255n]);
    expect(Cents.from(2.55).value).toBe(255n);
  });

  test("the rule holds from parent to child: from Percent, 101 values, a class of 102 is refused though Byte holds 256", () => {
    const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 });
    const Percent = Byte.define({ name: "Percent", min: -0.5, max: 100.5 });
    expect(() => Percent.define({ name: "Q", min: -0.5, max: 101.5 })).toThrow(
      /^Percent\.define: Q must not hold more values than Percent: 102 > 101$/,
    );
    expect(Percent.define({ name: "P", min: 1, max: 101.5 }).high).toBe(101n);
  });

  test("a class made from BoundedInt has no limit: DayCount holds 365251 values, more than BoundedInt", () => {
    const { DayCount } = classes();
    expect(DayCount.high - DayCount.low + 1n).toBe(365251n);
    expect(BoundedInt.high - BoundedInt.low + 1n).toBe(32768n);
    expect(DayCount.from(365250).value).toBe(365250n);
  });

  test("a class written by hand under Byte, with 257 values, is refused at its first use", () => {
    const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 });
    class Big extends Byte {
      static override min = -0.5;
      static override max = 256.5;
    }
    expect(() => Big.from(5)).toThrow(RangeError);
    expect(() => Big.from(5)).toThrow(
      /^Big\.from: Big must not hold more values than Byte: 257 > 256$/,
    );
    class Fits extends Byte {
      static override min = 9.5;
      static override max = 265.5;
    }
    expect(Fits.from(265).value).toBe(265n);
  });

  test("define ignores an order in its spec, as any other key it does not know", () => {
    const spec = { name: "Wide", min: -0.5, max: 299.5, order: 256n };
    const Wide = BoundedInt.define(spec);
    expect(Wide.high).toBe(299n);
    expect(Object.hasOwn(Wide, "order")).toBe(false);
    const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 });
    const Loose = { name: "Loose", min: -0.5, max: 99.5, order: 1n };
    expect(Byte.define(Loose).high).toBe(99n);
  });
});

describe("BoundedInt classes: no more values than the parent, edge cases", () => {
  test("a chain of three classes of 256 values each, in other places and at other steps, passes; one more value is refused at the end", () => {
    const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 });
    const Code = Byte.define({ name: "Code", min: 999.5, max: 1255.5 });
    const Cents = Code.define({ name: "Cents", min: 0, max: 2.555, step: 0.01 });
    expect([Cents.low, Cents.high]).toEqual([0n, 255n]);
    expect(Object.getPrototypeOf(Object.getPrototypeOf(Cents))).toBe(Byte);
    expect(() => Cents.define({ name: "More", min: 0, max: 2.565, step: 0.01 })).toThrow(
      /^Cents\.define: More must not hold more values than Cents: 257 > 256$/,
    );
  });

  test("a count exactly equal to the parent's passes; a tie at a bound counts as it rounds, to even", () => {
    const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 });
    // [0.5, 256.5): 0.5 rounds to 0, the values just below 256.5 to 256: 257 values.
    expect(() => Byte.define({ name: "Tie", min: 0.5, max: 256.5 })).toThrow(
      /^Byte\.define: Tie must not hold more values than Byte: 257 > 256$/,
    );
    // [1.5, 257.5): 1.5 rounds to 2, so 2 … 257: 256 values, exactly as many as Byte.
    const Even = Byte.define({ name: "Even", min: 1.5, max: 257.5 });
    expect([Even.low, Even.high]).toEqual([2n, 257n]);
    // [0, 256): the values just below 256 round to 256: 257 values.
    expect(() => Byte.define({ name: "Open", min: 0, max: 256 })).toThrow(RangeError);
  });

  test("a parent of negative scale counts its values in its own steps: 0 … 255 thousands are 256", () => {
    const Thousands = BoundedInt.define({ name: "Thousands", min: -500, max: 255500, step: 1000 });
    expect([Thousands.scale, Thousands.low, Thousands.high]).toEqual([-3, 0n, 255n]);
    expect(Thousands.define({ name: "Units", min: -0.5, max: 255.5 }).high).toBe(255n);
    expect(() => Thousands.define({ name: "More", min: -0.5, max: 256.5 })).toThrow(
      /^Thousands\.define: More must not hold more values than Thousands: 257 > 256$/,
    );
  });

  test("a parent written by hand with invalid constants gives its own error first, at the first use of its child", () => {
    const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 });
    class Bad extends Byte {
      static override min: Quantity = 5n;
      static override max: Quantity = 5n;
    }
    class Child extends Bad {
      static override min = -0.5;
      static override max = 9.5;
    }
    class Broken extends Bad {
      static override min = 0n;
    }
    expect(() => Child.from(1)).toThrow(RangeError);
    expect(() => Child.from(1)).toThrow(/^Child\.from: Bad\.min must be below Bad\.max$/);
    // Broken is invalid too, but its parent is checked first.
    expect(() => Broken.fromValue(1n)).toThrow(
      /^Broken\.fromValue: Bad\.min must be below Bad\.max$/,
    );
    expect(() => Bad.define({ name: "Sub", min: -0.5, max: 9.5 })).toThrow(
      /^Bad\.define: Bad\.min must be below Bad\.max$/,
    );
  });

  test("low and high throw, as the other members, for a class written by hand with invalid constants", () => {
    class NoMax extends BoundedInt {
      static override min = 1n;
    }
    class Empty extends BoundedInt {
      static override min = 5n;
      static override max = 5n;
    }
    expect(() => NoMax.low).toThrow(TypeError);
    expect(() => NoMax.low).toThrow(
      /^NoMax\.low: NoMax must declare both min and max, or neither$/,
    );
    expect(() => NoMax.high).toThrow(/^NoMax\.high: /);
    expect(() => Empty.high).toThrow(RangeError);
    expect(() => Empty.high).toThrow(/^Empty\.high: Empty\.min must be below Empty\.max$/);
  });

  test("define on a frozen class written by hand makes a frozen subclass of it, held to its count", () => {
    const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 });
    class Hand extends Byte {
      static override min = -0.5;
      static override max = 99.5;
    }
    Object.freeze(Hand);
    const Sub = Hand.define({ name: "Sub", min: 899.5, max: 999.5 });
    expect(Object.isFrozen(Sub)).toBe(true);
    expect(Object.getPrototypeOf(Sub)).toBe(Hand);
    expect([Sub.low, Sub.high]).toEqual([900n, 999n]);
    expect(Sub.from(999)).toBeInstanceOf(Hand);
    expect(() => Hand.define({ name: "Over", min: -0.5, max: 100.5 })).toThrow(
      /^Hand\.define: Over must not hold more values than Hand: 101 > 100$/,
    );
  });
});

describe("BoundedInt classes: the errors, relative to max − min", () => {
  test("half a step by default: Mass's error is 0.05 kg over 100.05 kg", () => {
    const { Mass, DayCount } = classes();
    expect(Mass.errorBound).toBeCloseTo(0.05 / 100.05, 15);
    expect(DayCount.errorBound).toBeCloseTo(0.5 / 365251, 15);
    expect(BoundedInt.errorBound).toBeCloseTo(0.5 / 32767.5, 15);
  });

  test("define takes the error in the unit of the values: Rough is known to 0.5 kg", () => {
    const { Rough } = classes();
    expect(Rough.errorBound).toBeCloseTo(0.5 / 100.05, 15);
  });

  test("for the values of one class, the three errors are the bound", () => {
    const { Rough } = classes();
    expect([Rough.quadraticError, Rough.termError]).toEqual([Rough.errorBound, Rough.errorBound]);
  });

  test("an instance carries no error of its own", () => {
    const x = classes().Rough.from(2.3);
    for (const name of ["errorBound", "quadraticError", "termError", "error"]) {
      expect(name in x).toBe(false);
    }
  });
});

describe("BoundedInt classes: the round trip (R2, R3)", () => {
  /** Every integer of a class, as the number nearest to its decimal. */
  const decimals = (name: "Mass" | "Reading" | "Volume", low: bigint, high: bigint) => {
    const C = classes()[name];
    const out: [bigint, number][] = [];
    for (let q = low; q <= high; q++) out.push([q, Number(`${String(q)}e${String(-C.scale)}`)]);
    return out;
  };

  test.each([
    ["Mass", 0n, 1000n],
    ["Reading", -799n, 1599n],
    ["Volume", 0n, 1000n],
  ] as const)(
    "%s: from(x).valueOf() === x for every decimal x on the step, and from(x).value is its integer",
    (name, low, high) => {
      const C = classes()[name];
      for (const [q, x] of decimals(name, low, high)) {
        const y = C.from(x);
        expect(y.value).toBe(q);
        expect(y.valueOf()).toBe(x);
        expect(C.from(y.valueOf()).value).toBe(y.value);
        expect(String(y.valueOf())).toBe(String(x));
      }
    },
  );
});

describe("BoundedInt classes: the checks of a class written by hand", () => {
  test("a class with one bound only is refused with a TypeError that names it", () => {
    class OneBound extends BoundedInt {
      static override min = 0n;
    }
    expect(() => OneBound.from(1)).toThrow(TypeError);
    expect(() => OneBound.from(1)).toThrow(/OneBound/);
  });

  test("a bound that is not a quantity is refused with a TypeError", () => {
    class StringBounds extends BoundedInt {
      static override min = "0" as never;
      static override max = 10n;
    }
    expect(() => StringBounds.from(1)).toThrow(TypeError);
  });

  // REVIEW PLACEHOLDER (#52: no order)
  // min ≥ max, a fractional scale, a scale beyond −308 … 323, a bad order and a negative error are refused; the scale 23 is valid
  //   -> min ≥ max, a fractional scale, a scale beyond −308 … 323 and a negative error are refused; the scale 23 is valid
  //   the classes ZeroOrder (static order = 0n, a RangeError) and NumberOrder (static order = 8, a
  //   TypeError) are removed: order is no constant of the class.
  //   class ZeroOrder extends BoundedInt {
  //     static override order = 0n;
  //   }
  //   class NumberOrder extends BoundedInt {
  //     static override order = 8 as never;
  //   }
  //   expect(() => ZeroOrder.fromValue(5n)).toThrow(RangeError);
  //   expect(() => NumberOrder.fromValue(5n)).toThrow(TypeError);
  // REVIEW PLACEHOLDER (#58, review of #59: the constant error of a class is an ErrorSpec only)
  //   class Negative extends BoundedInt {
  //     static override error = -1n;
  //   }
  test("min ≥ max, a fractional scale, a scale beyond −308 … 323 and a negative error are refused; the scale 23 is valid", () => {
    class Empty extends BoundedInt {
      static override min = 5n;
      static override max = 5n;
    }
    class Fractional extends BoundedInt {
      static override scale = 1.5;
    }
    class TooFine extends BoundedInt {
      static override scale = 324;
    }
    class TooCoarse extends BoundedInt {
      static override scale = -309;
    }
    class Negative extends BoundedInt {
      static override error = { bound: -1n };
    }
    class Fine extends BoundedInt {
      static override scale = 23;
    }
    expect(() => Empty.from(5)).toThrow(RangeError);
    expect(() => Fractional.from(5)).toThrow(RangeError);
    expect(() => TooFine.fromValue(5n)).toThrow(RangeError);
    expect(() => TooCoarse.fromValue(5n)).toThrow(RangeError);
    expect(() => Negative.fromValue(5n)).toThrow(RangeError);
    expect(() => Negative.fromValue(5n)).toThrow(/Negative/);
    expect(Fine.fromValue(5n).valueOf()).toBe(5e-23);
  });

  test("a class with its own valid constants works as one made by define", () => {
    class Days extends BoundedInt {
      static override min = 0n;
      static override max = 365251n;
    }
    expect(Days.from(20000).value).toBe(20000n);
    expect(() => Days.from(365251)).toThrow(RangeError);
    expect(Days.from(1.5).value).toBe(2n);
  });
});

describe("BoundedInt.define: the refusals", () => {
  test.each([
    ["no name", { min: 0, max: 1 }, TypeError],
    ["an empty name", { name: "", min: 0, max: 1 }, TypeError],
    ["min = max", { name: "X", min: 1, max: 1 }, RangeError],
    ["min > max", { name: "X", min: 2, max: 1 }, RangeError],
    ["a string min", { name: "X", min: "0", max: 1 }, TypeError],
    ["an infinite max", { name: "X", min: 0, max: Infinity, step: 1 }, TypeError],
    ["a step of 0", { name: "X", min: 0, max: 1, step: 0 }, RangeError],
    ["a negative step", { name: "X", min: 0, max: 1, step: -0.1 }, RangeError],
    ["a step below 1e-323", { name: "X", min: 0, max: 1, step: 5e-324 }, RangeError],
    // REVIEW PLACEHOLDER (#52: no order; define ignores an order in its spec)
    // define with more values than order throws, where a valid spec makes a class
    //   -> a class holds no more values than its parent: from Byte, Percent passes and Word is refused
    // define with an order that is a number throws, where a valid spec makes a class
    //   -> define ignores an order in its spec, as any other key it does not know
    // ["more values than order", { name: "X", min: 0, max: 257, order: 256n }, RangeError],
    // ["an order that is a number", { name: "X", min: 0, max: 1, order: 256 }, TypeError],
    ["a negative error", { name: "X", min: 0, max: 1, error: -1 }, RangeError],
  ] as const)("define with %s throws, where a valid spec makes a class", (_, spec, error) => {
    expect(BoundedInt.define({ name: "Valid", min: 0, max: 1 }).max).toBe(1);
    expect(() => BoundedInt.define(spec as never)).toThrow(error);
  });

  test("define has no limit on the bounds: ±10^15 and beyond, up to 2^300, with bigints", () => {
    const Large = BoundedInt.define({ name: "Large", min: -1e15, max: 1e15 });
    expect(Large.from(-(10n ** 15n)).value).toBe(-(10n ** 15n));
    const Huge = BoundedInt.define({ name: "Huge", min: -(2n ** 300n), max: 2n ** 300n });
    expect(Huge.from(2n ** 299n).value).toBe(2n ** 299n);
  });
});

describe("BoundedInt classes: a number only where 15 digits are enough", () => {
  test("a class whose largest bound, in steps and rounded up, is below 10^15 takes a number", () => {
    const Within = BoundedInt.define({
      name: "Within",
      min: -999999999999999,
      max: 999999999999999,
    });
    expect(Within.from(999999999999998).value).toBe(999999999999998n);
    expect(Within.from(-7).value).toBe(-7n);
    const Fine = BoundedInt.define({ name: "Fine", min: 0, max: [999n, -3], step: [1n, -15] });
    expect(Fine.from(0.5).value).toBe(500000000000000n);
  });

  test("a class that needs 16 digits refuses a number with a TypeError, and takes a bigint or a decimal", () => {
    const Wide = BoundedInt.define({ name: "Wide", min: 0, max: 1e15 });
    expect(() => Wide.from(5)).toThrow(TypeError);
    expect(() => Wide.from(5)).toThrow(/^Wide\.from: Wide needs more than 15 digits/);
    expect(Wide.from(5n).value).toBe(5n);
    expect(Wide.from([50n, -1]).value).toBe(5n);
  });

  test("1.005 at the scale 16 would be 10049999999999999: the class refuses the number", () => {
    const K16 = BoundedInt.define({ name: "K16", min: 0, max: 2, step: [1n, -16] });
    expect(() => K16.from(1.005)).toThrow(TypeError);
    expect(K16.from([1005n, -3]).value).toBe(10050000000000000n);
    const K2 = BoundedInt.define({ name: "K2", min: 0, max: 2, step: 0.01 });
    expect(K2.from(1.005).value).toBe(100n);
  });

  test("the larger bound counts, not max − min: [10^15, 10^15 + 10) refuses a number", () => {
    const Far = BoundedInt.define({ name: "Far", min: 1e15, max: 1e15 + 10 });
    expect(() => Far.from(1e15 + 1)).toThrow(TypeError);
    expect(Far.from(10n ** 15n + 1n).value).toBe(10n ** 15n + 1n);
  });

  test("BoundedInt, [0, 32767.5), takes a number; a class of 76 digits does not", () => {
    expect(BoundedInt.from(5).value).toBe(5n);
    const Unsigned = BoundedInt.define({ name: "Unsigned", min: 0n, max: L });
    expect(() => Unsigned.from(5)).toThrow(TypeError);
    expect(Unsigned.from(5n).value).toBe(5n);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #47    | new: the preliminary tests of the decimal classes; the bounds [min, max), kept exactly; the order and the error of a class (#44) |
// | #51    | imports the generic BoundedInt of bounded-int.ts; placeholders of #47 removed (#49) |
// | #53    | no order: no more values than the parent, low and high, define ignores order; its edge cases (#52) |
// | #59    | a hand-written negative error as { bound: -1n } (#58) |
