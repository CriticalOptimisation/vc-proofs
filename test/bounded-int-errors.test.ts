/**
 * The three errors of a class of `BoundedInt` (#58; docs/core/bounded-int.md, *The errors
 * of a class*): the forms of `define`'s `error`, the rules between `bound`, the quadratic
 * error kept squared (`quadraticSquared`, #62) and `term`, checked on squares, their storage
 * as frozen decimals in the unit of the values, never inherited, `NO_ERROR_PROCESSING`, the
 * getters that may be `undefined`, the display at the first defined error, decided by its
 * first two digits, and the exports of `bounded-int.ts` for the other modules (`decimal`,
 * `MANTISSA`, `EXPONENT`, `errors`). The exports are read from the module namespace, so that this file compiles
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
  readonly quadraticSquared: Decimal | undefined;
  readonly term: Decimal | undefined;
}

/** `errors(C)`, the export of `bounded-int.ts`. */
function errorsOf(C: typeof BoundedInt): Errors {
  const errors = exported.errors;
  expect(typeof errors).toBe("function");
  return (errors as (C: typeof BoundedInt) => Errors)(C);
}

/** The errors of a single term `d`: `bound` and `term` are `d`, `quadraticSquared` its square. */
const three = (d: Decimal | undefined): Errors => ({
  bound: d,
  quadraticSquared: d === undefined ? undefined : square(d),
  term: d,
});

/** The square of a decimal, normalized: `[5n, -2]` gives `[25n, -4]`. */
function square([n, e]: Decimal): Decimal {
  let [m, f] = [n * n, 2 * e];
  if (m === 0n) return [0n, 0];
  while (m % 10n === 0n) {
    m /= 10n;
    f++;
  }
  return [m, f];
}

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
  // REVIEW PLACEHOLDER (#62: the quadratic error is kept squared)
  // left out, each error is half a step of the class: [5n, −1 − k]
  //   -> left out, bound and term are half a step of the class, [5n, −1 − k], and quadraticSquared its square, [25n, −2 − 2k]
  test("left out, bound and term are half a step of the class, [5n, −1 − k], and quadraticSquared its square, [25n, −2 − 2k]", () => {
    const { Mass, DayCount, Volume } = classes();
    expect(errorsOf(Mass)).toStrictEqual(three([5n, -2]));
    expect(errorsOf(DayCount)).toStrictEqual(three([5n, -1]));
    expect(errorsOf(Volume)).toStrictEqual(three([5n, 2]));
    expect(errorsOf(Mass).quadraticSquared).toStrictEqual([25n, -4]);
    expect(errorsOf(DayCount).quadraticSquared).toStrictEqual([25n, -2]);
    expect(errorsOf(Volume).quadraticSquared).toStrictEqual([25n, 4]);
  });

  test("the class constant error is own, frozen, and holds the normalized decimals: Mass.error.bound is [5n, -2]", () => {
    const { Mass } = classes();
    expect(Object.hasOwn(Mass, "error")).toBe(true);
    const error = Mass.error as unknown as Errors;
    expect(error).toStrictEqual(three([5n, -2]));
    expect(Object.isFrozen(error)).toBe(true);
    expect(Object.isFrozen(error.bound)).toBe(true);
  });

  // REVIEW PLACEHOLDER (#62: the quadratic error is kept squared)
  // a quantity gives three equal errors, normalized: [50n, -2] and 0.5 are [5n, -1]
  //   -> a quantity gives the errors of a single term, normalized: [50n, -2] and 0.5 are [5n, -1], their square [25n, -2]
  test("a quantity gives the errors of a single term, normalized: [50n, -2] and 0.5 are [5n, -1], their square [25n, -2]", () => {
    expect(errorsOf(make({ error: [50n, -2] }))).toStrictEqual(three([5n, -1]));
    expect(errorsOf(classes().Rough)).toStrictEqual(three([5n, -1]));
    expect(make({ error: [50n, -2] }).error as unknown).toStrictEqual(three([5n, -1]));
    expect(errorsOf(make({ error: 0.5 })).quadraticSquared).toStrictEqual([25n, -2]);
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

  // REVIEW PLACEHOLDER (#62: errors(C) gives quadraticSquared; the message names the key quadraticSquared)
  //   /^Bare\.fromValue: Bare\.error must be an object \{ bound\?, quadratic\?, term\? \}$/,
  //   expect(errorsOf(Normal)).toStrictEqual({ bound: undefined, quadratic: [8n, -1], term: undefined });
  test("a class written by hand declares its error as an object only, under the same rules; a bare quantity is a TypeError", () => {
    class Quarter extends BoundedInt {
      static override error = { bound: 0.25, quadratic: 0.25 };
    }
    expect(errorsOf(Quarter)).toStrictEqual(three([25n, -2]));
    class Bare extends BoundedInt {
      static override error = 0.25 as never;
    }
    expect(() => Bare.fromValue(0n)).toThrow(TypeError);
    expect(() => Bare.fromValue(0n)).toThrow(
      /^Bare\.fromValue: Bare\.error must be an object \{ bound\?, quadratic\?, quadraticSquared\?, term\? \}$/,
    );
    class Normal extends BoundedInt {
      static override error = { quadratic: 0.8 } as never;
    }
    expect(errorsOf(Normal)).toStrictEqual({
      bound: undefined,
      quadraticSquared: [64n, -2],
      term: undefined,
    });
    class Squared extends BoundedInt {
      static override error = { quadraticSquared: 0.64 } as never;
    }
    expect(errorsOf(Squared)).toStrictEqual(errorsOf(Normal));
    class Broken extends BoundedInt {
      static override error = { bound: 1, term: 2 } as never;
    }
    expect(() => Broken.fromValue(0n)).toThrow(RangeError);
  });
});

// REVIEW PLACEHOLDER (#62: the quadratic error is kept squared, and quadraticSquared is a key of its own)
//   ["{ quadratic: 0.8 }", { quadratic: 0.8 }, { bound: undefined, quadratic: [8n, -1], term: undefined }],
//   ["{ bound: 3, quadratic: 2, term: 1 }", { bound: 3, quadratic: 2, term: 1 }, { bound: [3n, 0], quadratic: [2n, 0], term: [1n, 0] }],
//   (and every row whose expected errors named quadratic: now quadraticSquared, the square)
describe("BoundedInt.define: the rules of the three errors, on squares (the table of the page)", () => {
  test.each([
    ["{}", {}, three(undefined)],
    [
      "{ bound: 1 }",
      { bound: 1 },
      { bound: [1n, 0], quadraticSquared: undefined, term: undefined },
    ],
    [
      "{ quadratic: 0.8 }",
      { quadratic: 0.8 },
      { bound: undefined, quadraticSquared: [64n, -2], term: undefined },
    ],
    [
      "{ quadraticSquared: 0.64 }",
      { quadraticSquared: 0.64 },
      { bound: undefined, quadraticSquared: [64n, -2], term: undefined },
    ],
    [
      "{ quadratic: 0.8, quadraticSquared: 0.64 }",
      { quadratic: 0.8, quadraticSquared: 0.64 },
      { bound: undefined, quadraticSquared: [64n, -2], term: undefined },
    ],
    [
      "{ quadraticSquared: 40 digits }: every digit kept",
      { quadraticSquared: [1234567890123456789012345678901234567891n, -40] },
      {
        bound: undefined,
        quadraticSquared: [1234567890123456789012345678901234567891n, -40],
        term: undefined,
      },
    ],
    ["{ bound: 1, quadratic: 1 }", { bound: 1, quadratic: 1 }, three([1n, 0])],
    ["{ quadratic: 0.8, term: 0.8 }", { quadratic: 0.8, term: 0.8 }, three([8n, -1])],
    [
      "{ quadraticSquared: 0.64, term: 0.8 }",
      { quadraticSquared: 0.64, term: 0.8 },
      three([8n, -1]),
    ],
    [
      "{ bound: 0.8, quadraticSquared: 0.64 }",
      { bound: 0.8, quadraticSquared: 0.64 },
      three([8n, -1]),
    ],
    [
      "{ bound: 1, term: 0.5 }",
      { bound: 1, term: 0.5 },
      { bound: [1n, 0], quadraticSquared: undefined, term: [5n, -1] },
    ],
    [
      "{ bound: 3, quadratic: 2, term: 1 }",
      { bound: 3, quadratic: 2, term: 1 },
      { bound: [3n, 0], quadraticSquared: [4n, 0], term: [1n, 0] },
    ],
    [
      "{ bound: 3, quadraticSquared: 2, term: 1 }",
      { bound: 3, quadraticSquared: 2, term: 1 },
      { bound: [3n, 0], quadraticSquared: [2n, 0], term: [1n, 0] },
    ],
    [
      "{ bound: undefined, quadratic: 0.8 }",
      { bound: undefined, quadratic: 0.8 },
      { bound: undefined, quadraticSquared: [64n, -2], term: undefined },
    ],
    [
      "{ bound: 1, other: 5 }",
      { bound: 1, other: 5 },
      { bound: [1n, 0], quadraticSquared: undefined, term: undefined },
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
    [
      "{ quadraticSquared: 2, bound: 1 }: quadraticSquared above the square of bound",
      { quadraticSquared: 2, bound: 1 },
    ],
    [
      "{ quadraticSquared: 0.5, term: 1 }: the square of term above quadraticSquared",
      { quadraticSquared: 0.5, term: 1 },
    ],
    ["{ term: -1 }: below 0", { term: -1 }],
  ] as const)("error %s is a RangeError", (_, error) => {
    expect(() => make({ error })).toThrow(RangeError);
  });
});

describe("BoundedInt.define: quadratic is squared on input, quadraticSquared kept as it is", () => {
  test("quadratic and quadraticSquared that agree give the same errors; that disagree, a RangeError that names both", () => {
    expect(errorsOf(make({ error: { quadratic: 0.8, quadraticSquared: 0.64 } }))).toStrictEqual(
      errorsOf(make({ error: { quadratic: 0.8 } })),
    );
    expect(() => make({ error: { quadratic: 0.8, quadraticSquared: 0.6 } })).toThrow(
      /^BoundedInt\.define: error\.quadraticSquared must be the square of error\.quadratic$/,
    );
  });

  test.each([
    ["quadratic", { quadratic: -1 }],
    ["quadraticSquared", { quadraticSquared: -1 }],
    ["quadratic", { quadratic: [-8n, -1] }],
  ] as const)("a negative %s is a RangeError that names it, before any square", (key, error) => {
    expect(() => make({ error })).toThrow(RangeError);
    expect(() => make({ error })).toThrow(
      new RegExp(`^BoundedInt\\.define: error\\.${key} must be 0 or more$`),
    );
  });

  test("the messages name the key given, and compare like with like", () => {
    expect(() => make({ error: { quadratic: 2, bound: 1 } })).toThrow(
      /^BoundedInt\.define: error\.quadratic must not be above error\.bound$/,
    );
    expect(() => make({ error: { quadraticSquared: 2, bound: 1 } })).toThrow(
      /^BoundedInt\.define: error\.quadraticSquared must not be above the square of error\.bound$/,
    );
    expect(() => make({ error: { quadraticSquared: 0.5, term: 1 } })).toThrow(
      /^BoundedInt\.define: the square of error\.term must not be above error\.quadraticSquared$/,
    );
  });
});

describe("NO_ERROR_PROCESSING: the errors disabled, by name", () => {
  /** `NO_ERROR_PROCESSING`, the export of `bounded-int.ts`. */
  const none = () => exported.NO_ERROR_PROCESSING as Errors | undefined;

  test("it is exported, frozen, and holds three undefined errors", () => {
    expect(none()).toStrictEqual(three(undefined));
    expect(Object.isFrozen(none())).toBe(true);
  });

  test("define takes it as it takes {}: errors(C) is NO_ERROR_PROCESSING, the getters undefined, every digit shown", () => {
    const C = make({ error: none() });
    expect(errorsOf(C)).toBe(none());
    expect([C.errorBound, C.quadraticError, C.termError]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(C.fromValue(123n).toString()).toBe("12.3");
  });

  test("a class written by hand may declare it as its error", () => {
    const value = none();
    class Raw extends BoundedInt {
      static override error = value as never;
    }
    expect(errorsOf(Raw)).toBe(value);
  });
});

describe("BoundedInt classes: the getters, relative to max − min, or undefined", () => {
  test("each getter gives its own error: 3, 2 and 1 over [0, 100) are 0.03, 0.02 and 0.01", () => {
    const C = make({ min: 0, max: 100, error: { bound: 3, quadratic: 2, term: 1 } });
    expect(C.errorBound).toBeCloseTo(0.03, 15);
    expect(C.quadraticError).toBe(0.02);
    expect(C.termError).toBeCloseTo(0.01, 15);
  });

  test("quadraticError is the number nearest to the root: { quadraticSquared: 2 } over a range of 1 is Math.SQRT2", () => {
    const C = make({ min: 0, max: 1, step: 0.001, error: { quadraticSquared: 2, bound: 2 } });
    expect(C.quadraticError).toBe(Math.SQRT2);
  });

  test("quadraticError is errorBound or termError itself when quadraticSquared is the square of bound or of term", () => {
    const { Mass, Reading } = classes();
    expect(Mass.quadraticError).toBe(Mass.errorBound);
    expect(Reading.quadraticError).toBe(Reading.termError);
    const B = make({ min: 0, max: 3, error: { bound: 0.7, quadraticSquared: 0.49, term: 0.1 } });
    expect(B.quadraticError).toBe(B.errorBound);
    const T = make({ min: 0, max: 3, error: { bound: 0.7, quadraticSquared: 0.01, term: 0.1 } });
    expect(T.quadraticError).toBe(T.termError);
  });

  test("quadraticError does not underflow: half a step of 1e-200 over a range of 1 is 5e-201", () => {
    const C = BoundedInt.define({ name: "Fine", min: 0, max: 1, step: [1n, -200] });
    expect(C.errorBound).toBe(5e-201);
    expect(C.quadraticError).toBe(5e-201);
  });

  test("an undefined error gives undefined: { quadratic: 0.8 } has no errorBound and no termError; {} has none", () => {
    const Normal = make({ min: 0, max: 100, error: { quadratic: 0.8 } });
    expect(Normal.errorBound).toBeUndefined();
    expect(Normal.quadraticError).toBe(0.008);
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

  test("at quadraticSquared alone, given squared: 0.25 is 500 steps, rounded at 10^3 steps, 123", () => {
    expect(shown({ quadraticSquared: 0.25 })).toEqual(["123", 123]);
  });
});

describe("BoundedInt classes: the first two digits of the error decide the display (the Kilo table of the page)", () => {
  /** 12.34 in a class of step 0.1 (k = 1), the integer 123n, with the given error. */
  const kilo = (error: unknown) =>
    make({ min: 0, max: 100.05, step: 0.1, error }).from(12.34).toString();

  test.each([
    ["{ quadratic: 0.5 }: 5 steps, j = 1", { quadratic: 0.5 }, "12"],
    ["{ quadratic: 0.49 }: 4.9 steps, j = 0", { quadratic: 0.49 }, "12.3"],
    [
      "{ quadraticSquared: 0.2499…9 }: just below 5 steps, j = 0",
      { quadraticSquared: [24999999999999999999n, -20] },
      "12.3",
    ],
    [
      "{ quadraticSquared: 0.2500…01 }: just above 5 steps, j = 1",
      { quadraticSquared: [25000000000000000001n, -20] },
      "12",
    ],
    ["{ quadraticSquared: 0.25 }: exactly 5 steps, j = 1", { quadraticSquared: [25n, -2] }, "12"],
    [
      "{ term: 0.4999…9 }: just below 5 steps, j = 0",
      { term: [4999999999999999999n, -19] },
      "12.3",
    ],
    ["{ term: 0.5000…01 }: just above 5 steps, j = 1", { term: [5000000000000000001n, -19] }, "12"],
    [
      "{ bound: 0.4999…9 }: just below 5 steps, j = 0",
      { bound: [4999999999999999999n, -19] },
      "12.3",
    ],
    [
      "{ bound: 0.5000…01 }: just above 5 steps, j = 1",
      { bound: [5000000000000000001n, -19] },
      "12",
    ],
    [
      "{ bound: 3, quadratic: 0.5, term: 0.05 }: the term decides, j = 0",
      { bound: 3, quadratic: 0.5, term: 0.05 },
      "12.3",
    ],
  ] as const)("error %s", (_, error, expected) => {
    expect(kilo(error)).toBe(expected);
  });

  test("a long quadraticSquared decides as its first two digits: 24.99…9, 25.00…01, 25, 2499.9…9 and 2500 steps² at k = 3", () => {
    // 4·Q crosses 10^2 at Q = 25 steps² (j = 1 from there) and 10^4 at 2500 steps² (j = 2).
    const at = (error: unknown) =>
      make({ min: 0, max: 1000, step: 0.001, error }).fromValue(123456n).toString();
    const below = 249999999999999999999999999999n;
    const above = 250000000000000000000000000001n;
    expect(at({ quadraticSquared: [below, -34] })).toBe("123.456");
    expect(at({ quadraticSquared: [above, -34] })).toBe("123.46");
    expect(at({ quadraticSquared: [25n, -6] })).toBe("123.46");
    expect(at({ quadraticSquared: [below, -32] })).toBe("123.46");
    expect(at({ quadraticSquared: [25n, -4] })).toBe("123.5");
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #59    | new: the three errors, their rules, getters, display; the exports of bounded-int.ts; a hand-written error is an object only (#58) |
