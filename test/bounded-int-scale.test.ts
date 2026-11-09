/**
 * The classes of `BoundedInt` (#44; docs/core/bounded-int.md): a decimal scale, a
 * semi-open range `[min, end)` of at most `ℓ` integers (`[0, ℓ)` on `BoundedInt`), no
 * limit on the scale but those of a `number`, one exact rounding with ties to even, the three errors of
 * an instance, `valueOf()` rounded at the term error, and the factories `define` and
 * `defineRaw`. The classes and the table of examples are those of the page
 * (test/helpers/bounded-int-examples.ts). The same file runs in Node.js and in every
 * headless browser.
 */
import { describe, expect, test } from "vitest";
import { BoundedInt, RistrettoElement } from "../src/core/index.js";
import { classes, constants, examples } from "./helpers/bounded-int-examples.js";

const L = RistrettoElement.ORDER;

describe("BoundedInt.define and defineRaw: the class constants", () => {
  test.each(constants)(
    "%s has scale %s, the range [%s, %s) and integerOnly %s",
    (name, scale, min, end, integerOnly) => {
      const C = classes()[name];
      expect(C.scale).toBe(scale);
      expect(C.min).toBe(min);
      expect(C.end).toBe(end);
      expect(C.integerOnly).toBe(integerOnly);
      expect(C.name).toBe(name);
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

  // REVIEW PLACEHOLDER (#44: every class has a range; that of BoundedInt is [0, ℓ))
  // BoundedInt itself keeps its defaults: scale 0, integers only, no range
  //   -> BoundedInt itself has scale 0, integers only, and the range [0, ℓ): one integer for
  //      each scalar
  // test("BoundedInt itself keeps its defaults: scale 0, integers only, no range", () => {
  //   expect(BoundedInt.scale).toBe(0);
  //   expect(BoundedInt.integerOnly).toBe(true);
  //   expect(BoundedInt.min).toBeUndefined();
  //   expect(BoundedInt.end).toBeUndefined();
  // });
  test("BoundedInt itself has scale 0, integers only, and the range [0, ℓ): one integer for each scalar", () => {
    expect(BoundedInt.scale).toBe(0);
    expect(BoundedInt.integerOnly).toBe(true);
    expect(BoundedInt.min).toBe(0n);
    expect(BoundedInt.end).toBe(L);
  });

  test("a class that declares no constant has those of BoundedInt, its range included", () => {
    class Plain extends BoundedInt {}
    expect([Plain.scale, Plain.min, Plain.end, Plain.integerOnly]).toEqual([0, 0n, L, true]);
    expect(Plain.from(L - 1n).value).toBe(L - 1n);
    expect(() => Plain.from(-1)).toThrow(RangeError);
    expect(() => Plain.from(-1)).toThrow(/^Plain\.from: /);
  });
});

describe("BoundedInt classes: the examples of the page", () => {
  const accepted = examples.filter((row) => row.throws === undefined);
  const refused = examples.filter((row) => row.throws !== undefined);

  test.each(accepted.map((row) => [row.call, row] as const))(
    "%s has the value, errors, valueOf() and toString() of the page",
    (_, row) => {
      const x = row.run(classes());
      expect(x.value).toBe(row.value);
      expect([x.errorBound, x.quadraticError, x.termError]).toEqual(row.errors);
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

  test("a bigint is a physical integer, scaled exactly: Mass.from(5n) is 5 kg, Mass.fromValue(5n) is 0.5 kg", () => {
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

describe("BoundedInt classes: the range is checked on the integer", () => {
  test("the lowest and the highest integers are accepted, end and min − 1 are refused", () => {
    const { Mass, Reading } = classes();
    expect(Mass.fromValue(0n).value).toBe(0n);
    expect(Mass.fromValue(1000n).value).toBe(1000n);
    expect(() => Mass.fromValue(1001n)).toThrow(RangeError);
    expect(() => Mass.fromValue(-1n)).toThrow(RangeError);
    expect(Reading.from(-7.99).value).toBe(-799n);
    expect(Reading.from(15.99).value).toBe(1599n);
    expect(() => Reading.fromValue(-800n)).toThrow(RangeError);
  });

  test("a value that rounds into the range is accepted, one that rounds out of it is refused", () => {
    const { Mass } = classes();
    expect(Mass.from(-0.04).value).toBe(0n);
    expect(() => Mass.from(-0.06)).toThrow(RangeError);
  });

  // REVIEW PLACEHOLDER (#44: every class has a range; that of BoundedInt is [0, ℓ))
  // BoundedInt has no range: from and fromValue accept any integer
  //   -> BoundedInt has the range [0, ℓ): from and fromValue accept 0 and ℓ − 1, and refuse
  //      −1, ℓ and 2^300
  // test("BoundedInt has no range: from and fromValue accept any integer", () => {
  //   expect(BoundedInt.from(2n ** 300n).value).toBe(2n ** 300n);
  //   expect(BoundedInt.fromValue(-(2n ** 300n)).value).toBe(-(2n ** 300n));
  // });
  test("BoundedInt has the range [0, ℓ): from and fromValue accept 0 and ℓ − 1, and refuse −1, ℓ and 2^300", () => {
    expect(BoundedInt.from(0n).value).toBe(0n);
    expect(BoundedInt.fromValue(L - 1n).value).toBe(L - 1n);
    expect(() => BoundedInt.from(-1n)).toThrow(RangeError);
    expect(() => BoundedInt.fromValue(L)).toThrow(RangeError);
    expect(() => BoundedInt.fromValue(L)).toThrow(/^BoundedInt\.fromValue: /);
    expect(() => BoundedInt.from(2n ** 300n)).toThrow(RangeError);
    expect(() => BoundedInt.fromValue(-(2n ** 300n))).toThrow(RangeError);
  });

  test("a range may lie anywhere, of at most ℓ integers: centered on 0, or from ℓ to ℓ + 10", () => {
    const Centered = BoundedInt.defineRaw({
      name: "Centered",
      scale: 0,
      min: -(L - 1n) / 2n,
      end: (L + 1n) / 2n,
    });
    expect(Centered.fromValue(-(L - 1n) / 2n).value).toBe(-(L - 1n) / 2n);
    const Beyond = BoundedInt.defineRaw({ name: "Beyond", scale: 0, min: L, end: L + 10n });
    expect(Beyond.fromValue(L + 9n).value).toBe(L + 9n);
    expect(() => Beyond.fromValue(L - 1n)).toThrow(RangeError);
  });
});

describe("BoundedInt classes: the errors", () => {
  test("from sets the three errors to half a step by default, whatever the value", () => {
    const { Mass, DayCount } = classes();
    for (const x of [
      Mass.from(12),
      Mass.from(12.3),
      Mass.from(12.34),
      DayCount.from(12),
      BoundedInt.from(12),
    ]) {
      expect([x.errorBound, x.quadraticError, x.termError]).toEqual([0.5, 0.5, 0.5]);
    }
  });

  test("from scales the error its caller gives, in the unit of x", () => {
    const { Mass, Reading, Volume } = classes();
    expect(Mass.from(2.3, 0.2).errorBound).toBe(2);
    expect(Reading.from(2.3, 0.2).errorBound).toBe(20);
    expect(Volume.from(2000, 500).errorBound).toBe(0.5);
  });

  test("fromValue: quadratic defaults to bound, and term to quadratic", () => {
    const { Difference } = classes();
    const x = Difference.fromValue(1n, { bound: 3 });
    expect([x.errorBound, x.quadraticError, x.termError]).toEqual([3, 3, 3]);
    const y = Difference.fromValue(1n, { bound: 3, quadratic: 2 });
    expect([y.errorBound, y.quadraticError, y.termError]).toEqual([3, 2, 2]);
  });

  test.each([
    ["{ bound: 1, quadratic: 2 }", { bound: 1, quadratic: 2 }],
    ["{ bound: 2, quadratic: 1, term: 1.5 }", { bound: 2, quadratic: 1, term: 1.5 }],
    ["{ bound: -1 }", { bound: -1 }],
    ["{ bound: NaN }", { bound: NaN }],
    ["{ bound: Infinity }", { bound: Infinity }],
  ] as const)("fromValue(1n, %s) throws a RangeError", (_, errors) => {
    expect(() => classes().Difference.fromValue(1n, errors)).toThrow(RangeError);
  });

  test("fromValue refuses errors that are not numbers, and a q that is not a bigint, with a TypeError", () => {
    const { Difference } = classes();
    expect(() => Difference.fromValue(1n, { bound: "1" as unknown as number })).toThrow(TypeError);
    expect(() => Difference.fromValue(1 as unknown as bigint)).toThrow(TypeError);
  });

  test("from refuses an error that is negative or not a number", () => {
    const { Mass } = classes();
    expect(() => Mass.from(1, -0.1)).toThrow(RangeError);
    expect(() => Mass.from(1, "0.1" as unknown as number)).toThrow(TypeError);
  });
});

describe("BoundedInt classes: the round trip (R2, R3)", () => {
  /** Every integer of the range of a class, as the number nearest to its decimal. */
  const decimals = (name: "Mass" | "Reading" | "Volume") => {
    const C = classes()[name];
    const out: [bigint, number][] = [];
    for (let q = C.min; q < C.end; q++) out.push([q, Number(`${String(q)}e${String(-C.scale)}`)]);
    return out;
  };

  test.each(["Mass", "Reading", "Volume"] as const)(
    "%s: from(x).valueOf() === x for every decimal x on the step, and from(x).value is its integer",
    (name) => {
      const C = classes()[name];
      for (const [q, x] of decimals(name)) {
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

  test("a bound that is not a bigint is refused with a TypeError", () => {
    class NumberBounds extends BoundedInt {
      static override min = 0 as unknown as bigint;
      static override end = 10 as unknown as bigint;
    }
    expect(() => NumberBounds.from(1)).toThrow(TypeError);
  });

  // REVIEW PLACEHOLDER (#44: no limit of ±22 on the scale)
  // min ≥ end, a fractional scale and a scale beyond ±22 are refused with a RangeError
  //   -> min ≥ end, more than ℓ integers, a fractional scale, and a scale whose step is not
  //      a number above 0 and finite are refused with a RangeError; the scale 23 is valid
  // test("min ≥ end, a fractional scale and a scale beyond ±22 are refused with a RangeError", () => {
  //   class Empty extends BoundedInt {
  //     static override min = 5n;
  //     static override end = 5n;
  //   }
  //   class Fractional extends BoundedInt {
  //     static override scale = 1.5;
  //   }
  //   class Huge extends BoundedInt {
  //     static override scale = 23;
  //   }
  //   expect(() => Empty.from(5)).toThrow(RangeError);
  //   expect(() => Fractional.from(5)).toThrow(RangeError);
  //   expect(() => Huge.from(5)).toThrow(RangeError);
  // });
  test("min ≥ end, more than ℓ integers, a fractional scale, and a scale whose step is not a number above 0 and finite are refused with a RangeError; the scale 23 is valid", () => {
    class Empty extends BoundedInt {
      static override min = 5n;
      static override end = 5n;
    }
    class Wide extends BoundedInt {
      static override min = -1n;
      static override end = L;
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
    class Fine extends BoundedInt {
      static override scale = 23;
    }
    expect(() => Empty.from(5)).toThrow(RangeError);
    expect(() => Wide.from(5)).toThrow(RangeError);
    expect(() => Wide.from(5)).toThrow(/Wide/);
    expect(() => Fractional.from(5)).toThrow(RangeError);
    expect(() => TooFine.fromValue(5n)).toThrow(RangeError);
    expect(() => TooCoarse.fromValue(5n)).toThrow(RangeError);
    expect(Fine.fromValue(5n).valueOf()).toBe(5e-23);
  });

  test("a class with its own valid constants works as one made by define", () => {
    class Days extends BoundedInt {
      static override min = 0n;
      static override end = 365251n;
    }
    expect(Days.from(20000).value).toBe(20000n);
    expect(() => Days.from(365251)).toThrow(RangeError);
    expect(() => Days.from(1.5)).toThrow(TypeError);
  });
});

describe("BoundedInt.define and defineRaw: the refusals", () => {
  // REVIEW PLACEHOLDER (#44: no limits of ±22 and 10^15)
  // define with %s throws, where a valid spec makes a class
  //   -> define with %s throws, where a valid spec makes a class (no row for a step of 1e-23
  //      or an integer of 10^15: both are valid; new rows: a step below 1e-323, more than ℓ
  //      integers)
  //   -> define has no limit at ±22 or at 10^15: a step of 1e-23, and the integers ±10^15
  // test.each([
  //   ["no name", { min: 0, max: 1 }, TypeError],
  //   ["an empty name", { name: "", min: 0, max: 1 }, TypeError],
  //   ["min > max", { name: "X", min: 2, max: 1 }, RangeError],
  //   ["a fractional min without a step", { name: "X", min: 0.5, max: 1 }, TypeError],
  //   ["an infinite max", { name: "X", min: 0, max: Infinity, step: 1 }, TypeError],
  //   ["a step of 0", { name: "X", min: 0, max: 1, step: 0 }, RangeError],
  //   ["a negative step", { name: "X", min: 0, max: 1, step: -0.1 }, RangeError],
  //   ["a step finer than 10^-22", { name: "X", min: 0, max: 1, step: 1e-23 }, RangeError],
  //   ["an integer of 10^15 or more", { name: "X", min: 0, max: 1e15 }, RangeError],
  // ] as const)("define with %s throws, where a valid spec makes a class", (_, spec, error) => {
  //   expect(BoundedInt.define({ name: "Valid", min: 0, max: 1 }).end).toBe(2n);
  //   expect(() => BoundedInt.define(spec as never)).toThrow(error);
  // });
  test.each([
    ["no name", { min: 0, max: 1 }, TypeError],
    ["an empty name", { name: "", min: 0, max: 1 }, TypeError],
    ["min > max", { name: "X", min: 2, max: 1 }, RangeError],
    ["a fractional min without a step", { name: "X", min: 0.5, max: 1 }, TypeError],
    ["an infinite max", { name: "X", min: 0, max: Infinity, step: 1 }, TypeError],
    ["a step of 0", { name: "X", min: 0, max: 1, step: 0 }, RangeError],
    ["a negative step", { name: "X", min: 0, max: 1, step: -0.1 }, RangeError],
    ["a step below 1e-323", { name: "X", min: 0, max: 0, step: 5e-324 }, RangeError],
    ["more than ℓ integers", { name: "X", min: 0n, max: L }, RangeError],
  ] as const)("define with %s throws, where a valid spec makes a class", (_, spec, error) => {
    expect(BoundedInt.define({ name: "Valid", min: 0, max: 1 }).end).toBe(2n);
    expect(() => BoundedInt.define(spec as never)).toThrow(error);
  });

  test("define has no limit at ±22 or at 10^15: a step of 1e-23, and the integers ±10^15", () => {
    expect(BoundedInt.define({ name: "Fine", min: 0, max: 1, step: 1e-23 }).scale).toBe(23);
    const Large = BoundedInt.define({ name: "Large", min: -1e15, max: 1e15 });
    expect([Large.min, Large.end]).toEqual([-(10n ** 15n), 10n ** 15n + 1n]);
    expect(BoundedInt.define({ name: "Full", min: 0n, max: L - 1n }).end).toBe(L);
  });

  test.each([
    ["min ≥ end", { name: "X", scale: 0, min: 1n, end: 1n }, RangeError],
    ["a fractional scale", { name: "X", scale: 0.5, min: 0n, end: 1n }, RangeError],
    ["number bounds", { name: "X", scale: 0, min: 0, end: 1 }, TypeError],
    ["more than ℓ integers", { name: "X", scale: 0, min: 0n, end: L + 1n }, RangeError],
    ["the scale 324", { name: "X", scale: 324, min: 0n, end: 1n }, RangeError],
    ["the scale −309", { name: "X", scale: -309, min: 0n, end: 1n }, RangeError],
  ] as const)("defineRaw with %s throws, where a valid spec makes a class", (_, spec, error) => {
    expect(BoundedInt.defineRaw({ name: "Valid", scale: 0, min: 0n, end: 1n }).end).toBe(1n);
    expect(() => BoundedInt.defineRaw(spec as never)).toThrow(error);
  });

  test("defineRaw has no limit of 10^15", () => {
    const Wide = BoundedInt.defineRaw({
      name: "Wide",
      scale: 0,
      min: -(2n ** 200n),
      end: 2n ** 200n,
    });
    expect(Wide.fromValue(2n ** 199n).value).toBe(2n ** 199n);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #47    | new: the preliminary tests of the decimal classes (#44)       |
