/**
 * The edge cases of `LinearCombination` (#50; docs/core/linear-combination.md): a negative
 * scale, very large and very small decimal coefficients and the limits of the scale, a
 * coefficient that is a multiple of ℓ, a zero coefficient's part in the scale, results at
 * `low` and at `high`, the class of a group itself as a term, a class written by hand and
 * the generic class, a result that holds exactly ℓ integers or one more, the order of the
 * checks, a context whose validation failed, the errors that the rules of `define` fill in,
 * and errors of more than 40 digits kept exact. The same file runs in Node.js and in every
 * headless browser.
 */
import { describe, expect, test } from "vitest";
import { errors, BoundedInt as GenericBoundedInt } from "../src/core/bounded-int.js";
import type { Blinded, Committed } from "../src/core/index.js";
import { BlindingContext, LinearCombination, RistrettoElement } from "../src/core/index.js";
import generatorVectors from "./vectors/generator-h.json" with { type: "json" };

function fromHex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** The vector `name` of test/vectors/generator-h.json: its message and its h. */
function generator(name: string): { message: Uint8Array; h: Uint8Array } {
  const vector = generatorVectors.vectors.find((v) => v.name === name);
  if (vector === undefined) throw new Error(`no generator vector ${name}`);
  return { message: fromHex(vector.messageHex), h: fromHex(vector.h) };
}

const ageCheck = () => generator("age-check");
const ristrettoContext = () =>
  BlindingContext.fromEncoded(ageCheck().h, ageCheck().message, RistrettoElement);
/** The h of the vector abc with the message of age-check: its validation fails. */
const invalidContext = () =>
  BlindingContext.fromEncoded(generator("abc").h, ageCheck().message, RistrettoElement);
const L = RistrettoElement.ORDER;

type BoundedIntClass = typeof GenericBoundedInt;

/** The class of ristretto255, and the classes of the examples. */
const Scalar = ristrettoContext().boundedInt;
const DayCount = Scalar.define({ name: "DayCount", min: -0.5, max: 365250.5 });
const Mass = Scalar.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
/** A single value, 0: a class of one integer. */
const Zero = Scalar.define({ name: "Zero", min: -0.5, max: 0.5 });

const committedOf = (b: Blinded<RistrettoElement>): Committed<RistrettoElement> => ({
  commitment: b.commitment,
  type: b.value.constructor as BoundedIntClass,
});

describe("LinearCombination: scales and coefficients at their limits", () => {
  test("a negative scale: Volume, step 1000, k = −3, holds 0 … 1000; alone it keeps k = −3, beside [0, 0.1) at 10^-4 (0 … 1000) it takes k = 4 and the coefficient 10^7", () => {
    const Volume = Scalar.define({ name: "Volume", min: -500, max: 1000500, step: 1000 });
    expect([Volume.scale, Volume.low, Volume.high]).toEqual([-3, 0n, 1000n]);
    const alone = new LinearCombination({ name: "Alone", terms: [[1n, Volume]] });
    expect([alone.boundedInt.scale, alone.boundedInt.low, alone.boundedInt.high]).toEqual([
      -3,
      0n,
      1000n,
    ]);
    expect(alone.boundedInt.fromValue(1000n).toString()).toBe("1000000");
    const Tenth = Scalar.define({ name: "Tenth", min: 0, max: 0.1, step: 0.0001 });
    expect([Tenth.scale, Tenth.low, Tenth.high]).toEqual([4, 0n, 1000n]);
    const both = new LinearCombination({
      name: "Both",
      terms: [
        [1n, Volume],
        [1n, Tenth],
      ],
    });
    expect(both.boundedInt.scale).toBe(4);
    expect(both.coefficients).toEqual([10n ** 7n, 1n]);
    expect([both.boundedInt.low, both.boundedInt.high]).toEqual([0n, 10n ** 10n + 1000n]);
  });

  test("a very large coefficient, 10^300, coarsens the scale to −300; 10^400 gives a scale beyond −308, the RangeError of define", () => {
    const large = new LinearCombination({ name: "Large", terms: [[[1n, 300], DayCount]] });
    expect(large.boundedInt.scale).toBe(-300);
    expect(large.coefficients).toEqual([1n]);
    expect([large.boundedInt.low, large.boundedInt.high]).toEqual([0n, 365250n]);
    expect(() => new LinearCombination({ name: "Huge", terms: [[[1n, 400], DayCount]] })).toThrow(
      RangeError,
    );
  });

  test("a very small coefficient, 10^-300, refines the scale to 300 and multiplies the other terms by 10^299; 10^-400, or 10^-1000000000, gives a scale beyond 323, the RangeError of define, at once", () => {
    const small = new LinearCombination({
      name: "Small",
      terms: [
        [[1n, -300], DayCount],
        [1n, Mass],
      ],
    });
    expect(small.boundedInt.scale).toBe(300);
    expect(small.coefficients).toEqual([1n, 10n ** 299n]);
    for (const e of [-324, -400, -1_000_000_000]) {
      expect(
        () =>
          new LinearCombination({
            name: "Tiny",
            terms: [
              [[1n, e], DayCount],
              [1n, Mass],
            ],
          }),
      ).toThrow(RangeError);
    }
    // At the finest scale itself, 323, the combination is built.
    const finest = new LinearCombination({ name: "Finest", terms: [[[1n, -323], DayCount]] });
    expect(finest.boundedInt.scale).toBe(323);
  });

  test("a coefficient of 0 counts in k by the scale of its class only: 0·Fraction + DayCount has k = 4 and coefficients [0n, 10000n]; 0 written [0n, −7] is 0, and refines nothing", () => {
    const Fraction = Scalar.define({ name: "Fraction", min: 0, max: 0.09995, step: 0.0001 });
    const lc = new LinearCombination({
      name: "Days",
      terms: [
        [0n, Fraction],
        [1n, DayCount],
      ],
    });
    expect(lc.boundedInt.scale).toBe(4);
    expect(lc.coefficients).toEqual([0n, 10000n]);
    expect([lc.boundedInt.low, lc.boundedInt.high]).toEqual([0n, 3652500000n]);
    const written = new LinearCombination({ name: "Nought", terms: [[[0n, -7], DayCount]] });
    expect(written.boundedInt.scale).toBe(0);
    expect(written.coefficients).toEqual([0n]);
    expect([written.boundedInt.low, written.boundedInt.high]).toEqual([0n, 0n]);
  });

  test("a coefficient that is ℓ, a multiple of ℓ, on a class of one integer: the term adds the identity to the commitment and nothing to the blinding factor", async () => {
    const context = ristrettoContext();
    const lc = new LinearCombination({
      name: "Multiple",
      terms: [
        [L, Zero],
        [1n, DayCount],
      ],
    });
    expect(lc.coefficients).toEqual([L, 1n]);
    expect([lc.boundedInt.low, lc.boundedInt.high]).toEqual([0n, 365250n]);
    const zero = await context.blind(Zero.from(0n));
    const day = await context.blind(DayCount.from(42n));
    const opening = lc.combineBlinded(context, [zero, day]);
    expect(opening.commitment.equals(day.commitment)).toBe(true);
    expect(opening.blinding.value).toBe(day.blinding.value);
    expect(opening.value.value).toBe(42n);
    expect(await context.isOpeningOf(opening)).toBe(true);
    expect(lc.combine(context, [committedOf(zero), committedOf(day)]).equals(day.commitment)).toBe(
      true,
    );
  });
});

describe("LinearCombination: results at the bounds and the fit to the group", () => {
  test("Age at low, −365250, and at high, 365250: values of its class, which isOpeningOf accepts", async () => {
    const context = ristrettoContext();
    const Age = new LinearCombination({
      name: "Age",
      terms: [
        [1n, DayCount],
        [-1n, DayCount],
      ],
    });
    const first = await context.blind(DayCount.from(0n));
    const last = await context.blind(DayCount.from(365250n));
    const low = Age.combineBlinded(context, [first, last]);
    expect(low.value.value).toBe(Age.boundedInt.low);
    expect(await context.isOpeningOf(low)).toBe(true);
    const high = Age.combineBlinded(context, [last, first]);
    expect(high.value.value).toBe(Age.boundedInt.high);
    expect(await context.isOpeningOf(high)).toBe(true);
  });

  test("the class of the group itself is a term: Scalar alone, ℓ integers, fits ristretto255; Scalar + Zero too; Scalar + Bit, ℓ + 1 integers, does not", async () => {
    const context = ristrettoContext();
    const alone = new LinearCombination({ name: "Alone", terms: [[1n, Scalar]] });
    expect([alone.boundedInt.low, alone.boundedInt.high]).toEqual([0n, L - 1n]);
    const x = await context.blind(Scalar.fromValue(L - 1n));
    const opening = alone.combineBlinded(context, [x]);
    expect(opening.value.value).toBe(L - 1n);
    expect(await context.isOpeningOf(opening)).toBe(true);
    const zero = await context.blind(Zero.from(0n));
    const withZero = new LinearCombination({
      name: "WithZero",
      terms: [
        [1n, Scalar],
        [1n, Zero],
      ],
    });
    expect(() => withZero.combine(context, [committedOf(x), committedOf(zero)])).not.toThrow();
    const Bit = Scalar.define({ name: "Bit", min: -0.5, max: 1.5 });
    const over = new LinearCombination({
      name: "Over",
      terms: [
        [1n, Scalar],
        [1n, Bit],
      ],
    });
    expect([over.boundedInt.low, over.boundedInt.high]).toEqual([0n, L]);
    expect(() => over.combine(context, [])).toThrow(
      new RangeError(
        "LinearCombination.combine: Over holds more values than the group Ristretto255 has scalars",
      ),
    );
    expect(() => over.combineBlinded(context, [])).toThrow(
      new RangeError(
        "LinearCombination.combineBlinded: Over holds more values than the group Ristretto255 has scalars",
      ),
    );
  });

  test("combine and combineBlinded do not wait for the validation of the context: over a context whose h is wrong, both give the commitment, while its h() rejects", async () => {
    const valid = ristrettoContext();
    const invalid = invalidContext();
    await expect(invalid.h()).rejects.toThrow(RangeError);
    const lc = new LinearCombination({
      name: "Sum",
      terms: [
        [1n, DayCount],
        [3n, Mass],
      ],
    });
    // The class of a group is shared by its contexts: the openings fit the invalid one.
    const day = await valid.blind(DayCount.from(10n));
    const mass = await valid.blind(Mass.from(1.5));
    // k = 1: DayCount counts 10 steps of the result for each of its own.
    expect(lc.coefficients).toEqual([10n, 3n]);
    const expected = day.commitment.multiplyScalar(10n).add(mass.commitment.multiplyScalar(3n));
    expect(lc.combine(invalid, [committedOf(day), committedOf(mass)]).equals(expected)).toBe(true);
    const opening = lc.combineBlinded(invalid, [day, mass]);
    expect(opening.commitment.equals(expected)).toBe(true);
    expect(opening.value.value).toBe(10n * 10n + 3n * 15n);
  });
});

describe("LinearCombination: terms of classes written by hand", () => {
  /** A class written by hand: scale 1, 0 … 100, a bound of 0.1 only. */
  class Hand extends GenericBoundedInt {
    static override readonly scale = 1;
    static override readonly min = 0;
    static override readonly max = 10.05;
    static override readonly error = { bound: 0.1 };
  }

  test("a class written by hand is a term, its errors read as define would store them; combineBlinded takes its values", async () => {
    const lc = new LinearCombination({ name: "Twice", terms: [[2n, Hand]] });
    expect([lc.boundedInt.scale, lc.boundedInt.low, lc.boundedInt.high]).toEqual([1, 0n, 200n]);
    expect(errors(lc.boundedInt)).toEqual({
      bound: [2n, -1],
      quadraticSquared: undefined,
      term: undefined,
    });
    const context = ristrettoContext();
    const x = await context.blind(Hand.from(2.5));
    const opening = lc.combineBlinded(context, [x]);
    expect(opening.value.value).toBe(50n);
    expect(await context.isOpeningOf(opening)).toBe(true);
  });

  test("the generic class itself is a term: 0 … 32767", () => {
    const lc = new LinearCombination({ name: "Generic", terms: [[-1n, GenericBoundedInt]] });
    expect([lc.boundedInt.low, lc.boundedInt.high]).toEqual([-32767n, 0n]);
  });

  test("a class written by hand with invalid constants is refused by the constructor, as its first use refuses it", () => {
    class Inverted extends GenericBoundedInt {
      static override readonly min = 5;
      static override readonly max = 1;
    }
    expect(() => new LinearCombination({ name: "Bad", terms: [[1n, Inverted]] })).toThrow(
      RangeError,
    );
  });
});

describe("LinearCombination: the order of the checks", () => {
  test("not an array before the count, the count before the inputs, the classes before a commitment given twice", async () => {
    const context = ristrettoContext();
    const lc = new LinearCombination({
      name: "Pair",
      terms: [
        [1n, DayCount],
        [1n, Mass],
      ],
    });
    const day = await context.blind(DayCount.from(1n));
    expect(() => lc.combine(context, { length: 2 } as unknown as [])).toThrow(TypeError);
    expect(() => lc.combine(context, [null] as unknown as [])).toThrow(RangeError);
    expect(() => lc.combineBlinded(context, [null, null] as unknown as [])).toThrow(TypeError);
    // The same commitment twice, the second with the wrong class: the class is checked first.
    expect(() =>
      lc.combine(context, [committedOf(day), { commitment: day.commitment, type: DayCount }]),
    ).toThrow(TypeError);
  });

  test("a commitment given twice is refused even on a term of coefficient 0", async () => {
    const context = ristrettoContext();
    const lc = new LinearCombination({
      name: "Ignored",
      terms: [
        [0n, DayCount],
        [1n, DayCount],
      ],
    });
    const day = await context.blind(DayCount.from(1n));
    expect(() => lc.combine(context, [committedOf(day), committedOf(day)])).toThrow(RangeError);
    expect(() => lc.combineBlinded(context, [day, day])).toThrow(RangeError);
  });

  test("a value that is no bounded integer, though it names the class of its term, is a TypeError", async () => {
    const context = ristrettoContext();
    const lc = new LinearCombination({ name: "One", terms: [[1n, DayCount]] });
    const day = await context.blind(DayCount.from(1n));
    const fake = { ...day, value: { constructor: DayCount, value: 1n } };
    expect(() => lc.combineBlinded(context, [fake as unknown as typeof day])).toThrow(TypeError);
    expect(() =>
      lc.combineBlinded(context, [
        { ...day, blinding: day.blinding.value } as unknown as typeof day,
      ]),
    ).toThrow(TypeError);
  });
});

describe("LinearCombination: errors that the rules of define fill in, and long errors", () => {
  /** Errors with no quadratic error, bound 0.2 and term 0.1: the rules fill in nothing. */
  const NoQuadratic = Scalar.define({
    name: "NoQuadratic",
    min: 0,
    max: 100.05,
    step: 0.1,
    error: { bound: 0.2, term: 0.1 },
  });
  /** Errors with no term, bound 0.2 and the square of the quadratic error 0.01. */
  const NoTerm = Scalar.define({
    name: "NoTerm",
    min: 0,
    max: 100.05,
    step: 0.1,
    error: { bound: 0.2, quadraticSquared: 0.01 },
  });

  test("0·NoQuadratic + Mass: bound and term are those of Mass, equal, so define fills in the square of the quadratic error, 0.0025", () => {
    expect(errors(NoQuadratic).quadraticSquared).toBeUndefined();
    const lc = new LinearCombination({
      name: "Filled",
      terms: [
        [0n, NoQuadratic],
        [1n, Mass],
      ],
    });
    expect(errors(lc.boundedInt)).toEqual({
      bound: [5n, -2],
      quadraticSquared: [25n, -4],
      term: [5n, -2],
    });
  });

  test("0·NoTerm + Mass: the square of the bound is the square of the quadratic error, so define fills in the term, 0.05", () => {
    expect(errors(NoTerm).term).toBeUndefined();
    const lc = new LinearCombination({
      name: "Filled",
      terms: [
        [0n, NoTerm],
        [1n, Mass],
      ],
    });
    expect(errors(lc.boundedInt)).toEqual({
      bound: [5n, -2],
      quadraticSquared: [25n, -4],
      term: [5n, -2],
    });
  });

  test("errors of 42 digits are kept exact: 3·Big − 0.7·Big gives bound 3.7·b, the square of the quadratic error 9.49·q and term 3·t, every digit", () => {
    const N = 123456789012345678901234567890123456789019n;
    expect(N.toString().length).toBe(42);
    const Big = Scalar.define({
      name: "Big",
      min: 0,
      max: 100.05,
      step: 0.1,
      error: { bound: [N, -43], quadraticSquared: [N * N, -87], term: [N, -44] },
    });
    const lc = new LinearCombination({
      name: "Long",
      terms: [
        [3n, Big],
        [[-7n, -1], Big],
      ],
    });
    expect(errors(lc.boundedInt)).toEqual({
      bound: [37n * N, -44],
      quadraticSquared: [949n * N * N, -89],
      term: [3n * N, -44],
    });
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
