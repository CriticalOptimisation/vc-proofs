/**
 * The three errors of a class of `BoundedInt` (#58; docs/core/bounded-int.md, *The errors
 * of a class*): the forms of `define`'s `error`, the rules between `bound`, `quadratic`
 * and `term`, their storage as frozen decimals in the unit of the values, never inherited,
 * the getters that may be `undefined`, the display at the first defined error, and the
 * exports of `bounded-int.ts` for the other modules (`decimal`, `MANTISSA`, `EXPONENT`,
 * `errors`). The exports are read from the module namespace, so that this file compiles
 * and runs before they exist. The same file runs in Node.js and in every headless browser.
 */
import { describe, expect, test } from "vitest";
import * as module from "../src/core/bounded-int.js";
import { BoundedInt, type Decimal } from "../src/core/bounded-int.js";
import { classes } from "./helpers/bounded-int-examples.js";

/** The exports of `bounded-int.ts`, by name. */
const exported = module as unknown as Record<string, unknown>;

/** The errors of a class, as `errors(C)` gives them. */
interface Errors {
  readonly bound: Decimal | undefined;
  readonly quadratic: Decimal | undefined;
  readonly term: Decimal | undefined;
}

/** `errors(C)`, the export of `bounded-int.ts`. */
function errorsOf(C: typeof BoundedInt): Errors {
  const errors = exported.errors;
  expect(typeof errors).toBe("function");
  return (errors as (C: typeof BoundedInt) => Errors)(C);
}

/** The same errors in each position. */
const three = (d: Decimal | undefined): Errors => ({ bound: d, quadratic: d, term: d });

/**
 * A class of the scale `k` from a `step` (0.1 by default: `k = 1`, as `Mass`), with the
 * given `error`, or none when it is left out. Any `error` is passed through, so that this
 * file compiles before `define` takes the object form.
 */
function make(spec: { error?: unknown; step?: unknown; min?: unknown; max?: unknown } = {}) {
  return BoundedInt.define({
    name: "E",
    min: 0,
    max: 100.05,
    step: 0.1,
    ...spec,
  } as never);
}

describe("bounded-int.ts: the exports for the other modules", () => {
  test("decimal, MANTISSA = 0, EXPONENT = 1 and errors are exported", () => {
    expect(exported.MANTISSA).toBe(0);
    expect(exported.EXPONENT).toBe(1);
    expect(typeof exported.decimal).toBe("function");
    const decimal = exported.decimal as (x: unknown, where: string, what: string) => Decimal;
    expect(decimal(0.1, "test", "x")).toEqual([1n, -1]);
    expect(decimal(5n, "test", "x")).toEqual([5n, 0]);
    expect(decimal([23n, -1], "test", "x")).toEqual([23n, -1]);
    expect(() => decimal("1", "Where", "what")).toThrow(/^Where: what must be/);
    expect(typeof exported.errors).toBe("function");
  });
});

describe("BoundedInt.define: the three errors, stored as decimals in the unit of the values", () => {
  test("left out, each error is half a step of the class: [5n, −1 − k]", () => {
    const { Mass, DayCount, Volume } = classes();
    expect(errorsOf(Mass)).toStrictEqual(three([5n, -2]));
    expect(errorsOf(DayCount)).toStrictEqual(three([5n, -1]));
    expect(errorsOf(Volume)).toStrictEqual(three([5n, 2]));
  });

  test("the class constant error is own, frozen, and holds the normalized decimals: Mass.error.bound is [5n, -2]", () => {
    const { Mass } = classes();
    expect(Object.hasOwn(Mass, "error")).toBe(true);
    const error = Mass.error as unknown as Errors;
    expect(error).toStrictEqual(three([5n, -2]));
    expect(Object.isFrozen(error)).toBe(true);
    expect(Object.isFrozen(error.bound)).toBe(true);
  });

  test("a quantity gives three equal errors, normalized: [50n, -2] and 0.5 are [5n, -1]", () => {
    expect(errorsOf(make({ error: [50n, -2] }))).toStrictEqual(three([5n, -1]));
    expect(errorsOf(classes().Rough)).toStrictEqual(three([5n, -1]));
    expect(make({ error: [50n, -2] }).error as unknown).toStrictEqual(three([5n, -1]));
  });

  test("a class never takes the errors of its parent: a child of Rough, made by define or by hand, has half its own step", () => {
    const { Rough } = classes();
    const Child = Rough.define({ name: "Child", min: 0, max: 10.005, step: 0.01 });
    expect(errorsOf(Child)).toStrictEqual(three([5n, -3]));
    class Hand extends Rough {}
    // Hand inherits the scale 1 of Rough, not its error of 0.5.
    expect(Hand.scale).toBe(1);
    expect(errorsOf(Hand)).toStrictEqual(three([5n, -2]));
  });

  test("a class written by hand declares its error as a quantity or an object, under the same rules", () => {
    class Quarter extends BoundedInt {
      static override error = 0.25;
    }
    expect(errorsOf(Quarter)).toStrictEqual(three([25n, -2]));
    class Normal extends BoundedInt {
      static override error = { quadratic: 0.8 } as never;
    }
    expect(errorsOf(Normal)).toStrictEqual({
      bound: undefined,
      quadratic: [8n, -1],
      term: undefined,
    });
    class Broken extends BoundedInt {
      static override error = { bound: 1, term: 2 } as never;
    }
    expect(() => Broken.fromValue(0n)).toThrow(RangeError);
  });
});

describe("BoundedInt.define: the rules of the three errors (the table of the page)", () => {
  test.each([
    ["{}", {}, three(undefined)],
    ["{ bound: 1 }", { bound: 1 }, { bound: [1n, 0], quadratic: undefined, term: undefined }],
    [
      "{ quadratic: 0.8 }",
      { quadratic: 0.8 },
      { bound: undefined, quadratic: [8n, -1], term: undefined },
    ],
    ["{ bound: 1, quadratic: 1 }", { bound: 1, quadratic: 1 }, three([1n, 0])],
    ["{ quadratic: 0.8, term: 0.8 }", { quadratic: 0.8, term: 0.8 }, three([8n, -1])],
    [
      "{ bound: 1, term: 0.5 }",
      { bound: 1, term: 0.5 },
      { bound: [1n, 0], quadratic: undefined, term: [5n, -1] },
    ],
    [
      "{ bound: 3, quadratic: 2, term: 1 }",
      { bound: 3, quadratic: 2, term: 1 },
      { bound: [3n, 0], quadratic: [2n, 0], term: [1n, 0] },
    ],
    [
      "{ bound: undefined, quadratic: 0.8 }",
      { bound: undefined, quadratic: 0.8 },
      { bound: undefined, quadratic: [8n, -1], term: undefined },
    ],
    [
      "{ bound: 1, other: 5 }",
      { bound: 1, other: 5 },
      { bound: [1n, 0], quadratic: undefined, term: undefined },
    ],
  ] as const)("error %s gives its errors", (_, error, expected) => {
    expect(errorsOf(make({ error }))).toStrictEqual(expected);
  });

  test.each([
    [
      "{ bound: 1, quadratic: 1, term: 0.5 }: bound = quadratic, term must equal them",
      { bound: 1, quadratic: 1, term: 0.5 },
    ],
    [
      "{ bound: 1, quadratic: 0.5, term: 0.5 }: quadratic = term, bound must equal them",
      { bound: 1, quadratic: 0.5, term: 0.5 },
    ],
    ["{ bound: 1, term: 2 }: term above bound", { bound: 1, term: 2 }],
    ["{ quadratic: 2, bound: 1 }: quadratic above bound", { quadratic: 2, bound: 1 }],
    ["{ term: -1 }: below 0", { term: -1 }],
  ] as const)("error %s is a RangeError", (_, error) => {
    expect(() => make({ error })).toThrow(RangeError);
  });
});

describe("BoundedInt classes: the getters, relative to max − min, or undefined", () => {
  test("each getter gives its own error: 3, 2 and 1 over [0, 100) are 0.03, 0.02 and 0.01", () => {
    const C = make({ min: 0, max: 100, error: { bound: 3, quadratic: 2, term: 1 } });
    expect(C.errorBound).toBeCloseTo(0.03, 15);
    expect(C.quadraticError).toBeCloseTo(0.02, 15);
    expect(C.termError).toBeCloseTo(0.01, 15);
  });

  test("an undefined error gives undefined: { quadratic: 0.8 } has no errorBound and no termError; {} has none", () => {
    const Normal = make({ min: 0, max: 100, error: { quadratic: 0.8 } });
    expect(Normal.errorBound).toBeUndefined();
    expect(Normal.quadraticError).toBeCloseTo(0.008, 15);
    expect(Normal.termError).toBeUndefined();
    const None = make({ error: {} });
    expect([None.errorBound, None.quadraticError, None.termError]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe("BoundedInt classes: the display at the first defined of term, quadratic and bound", () => {
  /** 123.456 in a class of step 0.001 (k = 3) with the given error. */
  const shown = (error: unknown) => {
    const x = make({ min: 0, max: 1000, step: 0.001, error }).fromValue(123456n);
    return [x.toString(), x.valueOf()];
  };

  test("at term: 0.05 is 50 steps, rounded at 10^2 steps, 123.5", () => {
    expect(shown({ bound: 3, quadratic: 0.5, term: 0.05 })).toEqual(["123.5", 123.5]);
  });

  test("at quadratic when term is undefined: 0.5 is 500 steps, rounded at 10^3 steps, 123", () => {
    expect(shown({ bound: 3, quadratic: 0.5 })).toEqual(["123", 123]);
  });

  test("at bound when it is the only one: 30 is 30000 steps, rounded at 10^4 steps, 120", () => {
    expect(shown({ bound: 30 })).toEqual(["120", 120]);
  });

  test("every digit when the three are undefined: {} shows 123.456", () => {
    expect(shown({})).toEqual(["123.456", 123.456]);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
