/**
 * The edge cases of the three errors and of the direct scale of a class of `BoundedInt`
 * (#58; docs/core/bounded-int.md, *The errors of a class* and *define*): forms of `error`
 * of the wrong type, errors of 0 in each position, errors with huge or tiny exponents, the
 * errors of `BoundedInt` itself, a class written by hand whose errors break a rule, the
 * errors of a class reused by another, and the steps at the ends of the scales. The same
 * file runs in Node.js and in every headless browser.
 */
import { describe, expect, test } from "vitest";
import {
  BoundedInt,
  type Decimal,
  type Errors,
  type ErrorSpec,
  errors,
  type Quantity,
} from "../src/core/bounded-int.js";

/** The same error in each position. */
const three = (d: Decimal | undefined): Errors => ({ bound: d, quadratic: d, term: d });

/** A class of scale 1, `[0, 100.05)`, with the given `error`, or none when left out. */
const make = (error?: unknown, spec: { min?: Quantity; max?: Quantity; step?: Quantity } = {}) =>
  BoundedInt.define({
    name: "E",
    min: 0,
    max: 100.05,
    step: 0.1,
    ...spec,
    ...(error === undefined ? {} : { error: error as ErrorSpec }),
  });

/** A class of the step `step` over `[0, 1)`. */
const stepped = (step: Quantity) => BoundedInt.define({ name: "S", min: 0, max: 1, step });

describe("BoundedInt.define: an error of the wrong type is a TypeError that names it", () => {
  test.each<[string, unknown, RegExp]>([
    ["{ bound: '1' }", { bound: "1" }, /^BoundedInt\.define: error\.bound must be a bigint/],
    [
      "{ term: NaN }",
      { term: Number.NaN },
      /^BoundedInt\.define: error\.term must be a finite number/,
    ],
    ["null", null, /^BoundedInt\.define: error must be a bigint/],
    ["the string '0.5'", "0.5", /^BoundedInt\.define: error must be a bigint/],
    ["a decimal of one element, [1n]", [1n], /^BoundedInt\.define: error must be a bigint/],
    ["a function", () => 1, /^BoundedInt\.define: error must be a bigint/],
  ])("error %s", (_, error, message) => {
    expect(() => make(error)).toThrow(TypeError);
    expect(() => make(error)).toThrow(message);
  });

  test("error: undefined, from a JavaScript caller, is the same as error left out: half a step", () => {
    const spec = { name: "E", min: 0, max: 1, step: 0.1, error: undefined };
    const C = BoundedInt.define(spec as never);
    expect(errors(C)).toStrictEqual(three([5n, -2]));
  });

  test("{ bound: undefined, quadratic: undefined, term: undefined } is the same as {}", () => {
    const C = make({ bound: undefined, quadratic: undefined, term: undefined });
    expect(errors(C)).toStrictEqual(three(undefined));
  });
});

describe("BoundedInt.define: the messages of a broken rule name the errors", () => {
  test.each<[string, ErrorSpec, RegExp]>([
    ["{ term: -1 }", { term: -1 }, /^BoundedInt\.define: error\.term must be 0 or more$/],
    [
      "{ bound: 1, term: 2 }",
      { bound: 1, term: 2 },
      /^BoundedInt\.define: error\.term must not be above error\.bound$/,
    ],
    [
      "{ bound: 1, quadratic: 1, term: 0.5 }",
      { bound: 1, quadratic: 1, term: 0.5 },
      /^BoundedInt\.define: error\.term must equal error\.bound and error\.quadratic, which are equal$/,
    ],
  ])("error %s", (_, error, message) => {
    expect(() => make(error)).toThrow(RangeError);
    expect(() => make(error)).toThrow(message);
  });

  test("a quantity below 0 is named as given: error must be 0 or more", () => {
    expect(() => make(-0.5)).toThrow(/^BoundedInt\.define: error must be 0 or more$/);
    expect(() => make([-1n, 400])).toThrow(RangeError);
  });
});

describe("BoundedInt.define: errors of 0, in each position", () => {
  test("0 gives three errors of 0: the getters give 0, and every digit is shown", () => {
    const C = make(0);
    expect(errors(C)).toStrictEqual(three([0n, 0]));
    expect([C.errorBound, C.quadraticError, C.termError]).toEqual([0, 0, 0]);
    expect(C.fromValue(123n).toString()).toBe("12.3");
  });

  test("{ term: 0 } and { quadratic: 0 } stay alone; { bound: 0 } alone too", () => {
    expect(errors(make({ term: 0 }))).toStrictEqual({
      bound: undefined,
      quadratic: undefined,
      term: [0n, 0],
    });
    expect(errors(make({ quadratic: 0 }))).toStrictEqual({
      bound: undefined,
      quadratic: [0n, 0],
      term: undefined,
    });
    expect(errors(make({ bound: 0 }))).toStrictEqual({
      bound: [0n, 0],
      quadratic: undefined,
      term: undefined,
    });
  });

  test("{ bound: 0, term: 0 } fills quadratic with 0; { bound: 0, term: 0.1 } is a RangeError", () => {
    expect(errors(make({ bound: 0, term: 0 }))).toStrictEqual(three([0n, 0]));
    expect(() => make({ bound: 0, term: 0.1 })).toThrow(RangeError);
  });

  test("a term of 0 shows every digit even with a larger quadratic and bound", () => {
    const C = make({ bound: 30, quadratic: 5, term: 0 });
    expect(C.fromValue(123n).toString()).toBe("12.3");
  });
});

describe("BoundedInt.define: errors with huge or tiny exponents", () => {
  test("a bound of 10^10000 and a term of 10^-10000 are kept as given, and compared without building their powers", () => {
    const C = make({ bound: [1n, 10000], term: [1n, -10000] });
    expect(errors(C)).toStrictEqual({
      bound: [1n, 10000],
      quadratic: undefined,
      term: [1n, -10000],
    });
    // The term, far below a step, shows every digit.
    expect(C.fromValue(123n).toString()).toBe("12.3");
    expect(C.termError).toBe(0);
    expect(C.errorBound).toBe(Infinity);
  });

  test("an error of 10^400 hides every digit: the value shows as 0", () => {
    const C = make([1n, 400]);
    expect(errors(C)).toStrictEqual(three([1n, 400]));
    const x = C.fromValue(1000n);
    expect([x.toString(), x.valueOf()]).toEqual(["0", 0]);
  });

  test("errors equal once normalized are equal: { bound: [100n, -2], quadratic: 1 } fills term with [1n, 0]", () => {
    expect(errors(make({ bound: [100n, -2], quadratic: 1 }))).toStrictEqual(three([1n, 0]));
  });
});

describe("errors(C): BoundedInt itself, and the errors of a class reused", () => {
  test("errors(BoundedInt) is half its step, [5n, -1], frozen; BoundedInt.error stays undefined", () => {
    const e = errors(BoundedInt);
    expect(e).toStrictEqual(three([5n, -1]));
    expect(Object.isFrozen(e)).toBe(true);
    expect(Object.isFrozen(e.bound)).toBe(true);
    expect(BoundedInt.error).toBeUndefined();
    expect(errors(BoundedInt)).toBe(e);
  });

  test("errors(C) of a class made by define is its constant error, the same object", () => {
    const C = make({ bound: 3, quadratic: 2, term: 1 });
    expect(errors(C)).toBe(C.error);
  });

  test("the errors of one class given to define make another with the same errors, in the unit of the values, whatever its scale", () => {
    const A = make({ bound: 3, term: 1 });
    const B = BoundedInt.define({ name: "B", min: 0, max: 1000, step: 10, error: errors(A) });
    expect(B.scale).toBe(-1);
    expect(errors(B)).toStrictEqual({ bound: [3n, 0], quadratic: undefined, term: [1n, 0] });
  });

  test("a child of a class without errors ({}) has half its own step: errors are never inherited", () => {
    const None = make({});
    const Child = None.define({ name: "Child", min: 0, max: 10.05, step: 0.1 });
    expect(errors(Child)).toStrictEqual(three([5n, -2]));
    class Hand extends None {}
    expect(errors(Hand)).toStrictEqual(three([5n, -2]));
  });

  // REVIEW PLACEHOLDER (#58, review of #59: the constant error of a class is an ErrorSpec only)
  //   static override error = 0.5;
  test("a class written by hand with its own scale: half its step by default, its error in the unit of the values", () => {
    class Cents extends BoundedInt {
      static override scale = 2;
    }
    expect(errors(Cents)).toStrictEqual(three([5n, -3]));
    class Coarse extends BoundedInt {
      static override scale = 2;
      static override error = { term: 0.5, quadratic: 0.5 };
    }
    expect(errors(Coarse)).toStrictEqual(three([5n, -1]));
  });
});

// REVIEW PLACEHOLDER (#58, review of #59: a bare quantity is a TypeError, before its sign is read)
//   ["-1", -1, RangeError],
describe("a class written by hand whose errors are invalid is refused at its first use", () => {
  test.each<[string, unknown, typeof TypeError | typeof RangeError]>([
    ["{ bound: 1, quadratic: 1, term: 0.5 }", { bound: 1, quadratic: 1, term: 0.5 }, RangeError],
    ["{ quadratic: 2, bound: 1 }", { quadratic: 2, bound: 1 }, RangeError],
    ["{ term: -1 }", { term: -1 }, RangeError],
    ["-1", -1, TypeError],
    ["0.5, a bare quantity", 0.5, TypeError],
    ["the decimal [5n, -1], a bare quantity", [5n, -1], TypeError],
    ["null", null, TypeError],
    ["{ bound: '1' }", { bound: "1" }, TypeError],
    ["'x'", "x", TypeError],
  ])("error %s", (_, error, kind) => {
    class Broken extends BoundedInt {
      static override error = error as ErrorSpec;
    }
    expect(() => errors(Broken)).toThrow(kind);
    expect(() => Broken.fromValue(0n)).toThrow(kind);
    expect(() => Broken.errorBound).toThrow(kind);
    expect(() => errors(Broken)).toThrow(/^Broken\.errors: Broken\.error/);
  });
});

describe("BoundedInt.define: the scale k = 1 − digits(n) − e, at the ends", () => {
  test.each<[string, Quantity, number]>([
    ["0.025", 0.025, 2],
    ["[1n, 3]", [1n, 3], -3],
    ["[10n, 2]", [10n, 2], -3],
    ["0.1", 0.1, 1],
    ["[9461n, 12]", [9461n, 12], -15],
    ["1e308", 1e308, -308],
    ["10^308, [1n, 308]", [1n, 308], -308],
    ["[99n, 307], 9.9 · 10^308", [99n, 307], -308],
    ["10^-323, [1n, -323]", [1n, -323], 323],
    ["10^-323 with a trailing zero, [10n, -324]", [10n, -324], 323],
    ["[99n, -324], 9.9 · 10^-323", [99n, -324], 323],
  ])("the step %s gives the scale %i", (_, step, k) => {
    expect(stepped(step).scale).toBe(k);
  });

  test.each<[string, Quantity, RegExp]>([
    ["10^309, [1n, 309]", [1n, 309], /^BoundedInt\.define: step must be below 10\^309$/],
    ["[10n, 308]", [10n, 308], /^BoundedInt\.define: step must be below 10\^309$/],
    ["9 · 10^-324, [9n, -324]", [9n, -324], /^BoundedInt\.define: step must be 10\^-323 or more$/],
    ["[1n, -400]", [1n, -400], /^BoundedInt\.define: step must be 10\^-323 or more$/],
  ])("the step %s is a RangeError", (_, step, message) => {
    expect(() => stepped(step)).toThrow(RangeError);
    expect(() => stepped(step)).toThrow(message);
  });

  test("the default errors follow the scale at its ends: half of 10^308 and half of 10^-323", () => {
    expect(errors(stepped([1n, 308]))).toStrictEqual(three([5n, 307]));
    expect(errors(stepped([1n, -323]))).toStrictEqual(three([5n, -324]));
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #59    | new: the edge cases of the three errors and of the direct scale (#58) |
