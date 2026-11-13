/**
 * `LinearCombination` (#50; docs/core/linear-combination.md): the coefficients aligned on
 * the scale of the result, the class of the result made once from the generic class, its
 * range and its three errors, a result as a term of a further combination, the fit of
 * the result to the group of a context at use, `combine` and `combineBlinded`, the empty
 * combination, and a commitment given twice. The same file runs in Node.js and in every
 * headless browser.
 *
 * The classes are looked up on the entry point's namespace, so that this file compiles
 * and runs before `LinearCombination` exists, and fails on the behaviour: `combination`
 * throws a plain `Error` while it is missing, which no test of a refusal takes for its
 * `TypeError` or `RangeError`. The classes of the terms are made from
 * `context.boundedInt`, the class of the group, as an application makes them.
 */
import { describe, expect, test } from "vitest";
import { errors, BoundedInt as GenericBoundedInt } from "../src/core/bounded-int.js";
import * as entryPoint from "../src/core/index.js";
import { RistrettoElement } from "../src/core/index.js";
import generatorVectors from "./vectors/generator-h.json" with { type: "json" };

/** A class of bounded integers. */
type BoundedIntClass = typeof GenericBoundedInt;

/** What a verifier has (docs/core/blinding-context.md, Committed and Blinded). */
interface Committed {
  readonly commitment: RistrettoElement;
  readonly type: BoundedIntClass;
}

/** What the holder of a commitment has. */
interface Blinded {
  readonly commitment: RistrettoElement;
  readonly value: GenericBoundedInt;
  readonly blinding: GenericBoundedInt;
}

interface Context {
  readonly group: unknown;
  readonly boundedInt: BoundedIntClass;
  h(): Promise<RistrettoElement>;
  blind(x: GenericBoundedInt): Promise<Blinded>;
  isOpeningOf(opening: Blinded): Promise<boolean>;
}

/** What a context needs of its group (docs/core/blinding-context.md, The group). */
interface TestGroup {
  readonly SUITE_NAME: string;
  readonly GENERATOR_DST: string;
  readonly ORDER: bigint;
  decode(bytes: Uint8Array): RistrettoElement;
  hashToGroup(message: Uint8Array, dst: Uint8Array): Promise<RistrettoElement>;
  canonicalGenerator(): RistrettoElement;
  randomScalar(): bigint;
}

interface ContextClass {
  fromEncoded(h: Uint8Array, message: Uint8Array, group: TestGroup): Context;
}

/** A linear combination, as docs/core/linear-combination.md documents it. */
interface Combination {
  readonly boundedInt: BoundedIntClass;
  readonly coefficients: readonly bigint[];
  combine(context: Context, committed: readonly unknown[]): RistrettoElement;
  combineBlinded(context: Context, openings: readonly unknown[]): Blinded;
}

type CombinationClass = new (spec: unknown) => Combination;

const BlindingContext = (entryPoint as Record<string, unknown>).BlindingContext as ContextClass;
const LinearCombination = (entryPoint as Record<string, unknown>).LinearCombination as
  CombinationClass | undefined;

/** A new combination; a plain `Error`, never a `TypeError`, while the class is missing. */
function combination(spec: unknown): Combination {
  if (LinearCombination === undefined) throw new Error("./core exports no LinearCombination");
  return new LinearCombination(spec);
}

function fromHex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** The age-check vector of test/vectors/generator-h.json: its message and its h. */
function ageCheck(): { message: Uint8Array; h: Uint8Array } {
  const vector = generatorVectors.vectors.find((v) => v.name === "age-check");
  if (vector === undefined) throw new Error("no generator vector age-check");
  return { message: fromHex(vector.messageHex), h: fromHex(vector.h) };
}

/** ℓ, the order of ristretto255 (RFC 9496). */
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const RISTRETTO255 = RistrettoElement as unknown as TestGroup;
const g = () => RistrettoElement.canonicalGenerator();

/** The age-check context over ristretto255. */
function ristrettoContext(): Context {
  const { h, message } = ageCheck();
  return BlindingContext.fromEncoded(h, message, RISTRETTO255);
}

/**
 * A group of order 65536, of the elements of ristretto255 under another name: too small
 * for `Age`, large enough for `2·Mass − Reading`. Only its order and its generator are
 * used here: no test awaits the validation of its context.
 */
const SMALL: TestGroup = {
  SUITE_NAME: "Small",
  GENERATOR_DST: "vc-proofs-test-small-group",
  ORDER: 65536n,
  decode: (bytes) => RistrettoElement.decode(bytes),
  hashToGroup: (message, dst) => RistrettoElement.hashToGroup(message, dst),
  canonicalGenerator: () => g(),
  randomScalar: () => 0n,
};

function smallContext(): Context {
  const { h, message } = ageCheck();
  return BlindingContext.fromEncoded(h, message, SMALL);
}

/** The class of ristretto255, `context.boundedInt`, and the classes of the examples. */
const Scalar = ristrettoContext().boundedInt;
const DayCount = Scalar.define({ name: "DayCount", min: -0.5, max: 365250.5 });
const Mass = Scalar.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
const Reading = Scalar.define({ name: "Reading", min: -7.99, max: 15.995, step: 0.01 });
const Sensor = Scalar.define({
  name: "Sensor",
  min: 0,
  max: 100.05,
  step: 0.1,
  error: { quadratic: 0.08 },
});
/** x in [0, 0.09995) at the step 10^-4: the integers 0 … 999, scale 4. */
const Fraction = Scalar.define({ name: "Fraction", min: 0, max: 0.09995, step: 0.0001 });

const age = () =>
  combination({
    name: "Age",
    terms: [
      [1n, DayCount],
      [-1n, DayCount],
    ],
  });
const massMinusReading = () =>
  combination({
    name: "MassMinusReading",
    terms: [
      [2n, Mass],
      [-1n, Reading],
    ],
  });

/** `x mod ℓ`, from 0 to ℓ − 1. */
const modL = (x: bigint) => ((x % L) + L) % L;

/**
 * The errors of a class as they are stored, the quadratic error squared
 * (docs/core/linear-combination.md, The errors of the result): exact decimals, with no
 * square root. Read through `errors`, whose type does not name them yet.
 */
interface StoredErrors {
  readonly bound: readonly [bigint, number] | undefined;
  readonly quadraticSquared: readonly [bigint, number] | undefined;
  readonly term: readonly [bigint, number] | undefined;
}
const stored = (C: BoundedIntClass): StoredErrors => errors(C) as unknown as StoredErrors;

/** The `Committed` of an opening. */
const committedOf = (b: Blinded): Committed => ({
  commitment: b.commitment,
  type: b.value.constructor as BoundedIntClass,
});

describe("LinearCombination: the constructor and the class of the result", () => {
  test("Age, built without a context: one frozen class Age on the generic class, not on context.boundedInt, −365250 … 365250; coefficients [1n, −1n], frozen", () => {
    expect(typeof LinearCombination).toBe("function");
    const Age = age();
    const R = Age.boundedInt;
    expect(Age.boundedInt).toBe(R);
    expect(R.name).toBe("Age");
    expect(Object.isFrozen(R)).toBe(true);
    expect(Object.getPrototypeOf(R)).toBe(GenericBoundedInt);
    expect(Object.getPrototypeOf(R)).not.toBe(Scalar);
    expect([R.scale, R.low, R.high]).toEqual([0, -365250n, 365250n]);
    expect(Age.coefficients).toEqual([1n, -1n]);
    expect(Object.isFrozen(Age.coefficients)).toBe(true);
  });

  test("2·Mass − Reading: the steps 0.1 and 0.01 give k = 2, coefficients [20n, −1n], −1599 … 20799", () => {
    const lc = massMinusReading();
    expect(lc.boundedInt.scale).toBe(2);
    expect(lc.coefficients).toEqual([20n, -1n]);
    expect([lc.boundedInt.low, lc.boundedInt.high]).toEqual([-1599n, 20799n]);
  });

  test("0.5·DayCount: the coefficient 0.5, or [50n, −2] without its trailing zero, gives k = 1, coefficients [5n], 0 … 1826250", () => {
    for (const half of [0.5, [5n, -1], [50n, -2]]) {
      const lc = combination({ name: "Half", terms: [[half, DayCount]] });
      expect(lc.boundedInt.scale).toBe(1);
      expect(lc.coefficients).toEqual([5n]);
      expect([lc.boundedInt.low, lc.boundedInt.high]).toEqual([0n, 1826250n]);
    }
  });

  test("0.2·x, x of scale 4: the scales add up, k = 4 − (−1) = 5, and the combination is the integer equation r = 2·x, 0 … 1998, 0 to 0.01998", () => {
    expect([Fraction.scale, Fraction.low, Fraction.high]).toEqual([4, 0n, 999n]);
    const lc = combination({ name: "Fifth", terms: [[0.2, Fraction]] });
    expect(lc.boundedInt.scale).toBe(5);
    expect(lc.coefficients).toEqual([2n]);
    expect([lc.boundedInt.low, lc.boundedInt.high]).toEqual([0n, 1998n]);
    expect(lc.boundedInt.fromValue(1998n).toString()).toBe("0.01998");
  });

  test("a coefficient of 0 is accepted: 0·Mass + Reading has coefficients [0n, 1n], k = 2, and the range of Reading alone", () => {
    const lc = combination({
      name: "OnlyReading",
      terms: [
        [0n, Mass],
        [1n, Reading],
      ],
    });
    expect(lc.coefficients).toEqual([0n, 1n]);
    expect(lc.boundedInt.scale).toBe(2);
    expect([lc.boundedInt.low, lc.boundedInt.high]).toEqual([-799n, 1599n]);
  });

  test("a later change to the caller's terms changes nothing", () => {
    const terms: [unknown, BoundedIntClass][] = [
      [1n, DayCount],
      [-1n, DayCount],
    ];
    const lc = combination({ name: "Age", terms });
    terms[0] = [1000n, Mass];
    terms.push([1n, Reading]);
    expect(lc.coefficients).toEqual([1n, -1n]);
    expect([lc.boundedInt.low, lc.boundedInt.high]).toEqual([-365250n, 365250n]);
  });
});

describe("LinearCombination: the errors of the result", () => {
  /** The rows of the table of the examples, with the errors as decimals. */
  const rows: [string, () => Combination, StoredErrors][] = [
    [
      "Age: bound 1, the square of the quadratic error 0.5² + 0.5² = 0.5, term 0.5",
      age,
      { bound: [1n, 0], quadraticSquared: [5n, -1], term: [5n, -1] },
    ],
    [
      "2·Mass − Reading: bound 0.105, the square of the quadratic error 0.1² + 0.005² = 0.010025, term 0.1",
      massMinusReading,
      { bound: [105n, -3], quadraticSquared: [10025n, -6], term: [1n, -1] },
    ],
    [
      "0.5·DayCount: the three 0.25",
      () => combination({ name: "Half", terms: [[0.5, DayCount]] }),
      { bound: [25n, -2], quadraticSquared: [625n, -4], term: [25n, -2] },
    ],
    [
      "Sensor − Mass: Sensor knows only a quadratic error, so bound and term are undefined, and the square of the quadratic error is 0.08² + 0.05² = 0.0089",
      () =>
        combination({
          name: "SensorMinusMass",
          terms: [
            [1n, Sensor],
            [-1n, Mass],
          ],
        }),
      { bound: undefined, quadraticSquared: [89n, -4], term: undefined },
    ],
    [
      "0.2·x: the three 0.2 × 0.00005 = 0.00001, half the step of the result",
      () => combination({ name: "Fifth", terms: [[0.2, Fraction]] }),
      { bound: [1n, -5], quadraticSquared: [1n, -10], term: [1n, -5] },
    ],
    [
      "the empty combination: the three 0",
      () => combination({ name: "Nothing", terms: [] }),
      { bound: [0n, 0], quadraticSquared: [0n, 0], term: [0n, 0] },
    ],
  ];

  test.each(rows)("%s", (_, make, expected) => {
    expect(stored(make().boundedInt)).toEqual(expected);
  });

  test("the getters keep termError ≤ quadraticError ≤ errorBound on the class of the result", () => {
    for (const make of [age, massMinusReading]) {
      const R = make().boundedInt;
      const [bound, quadratic, term] = [R.errorBound, R.quadraticError, R.termError];
      if (bound === undefined || quadratic === undefined || term === undefined) {
        throw new Error("an error of the result is undefined");
      }
      expect(term).toBeLessThanOrEqual(quadratic);
      expect(quadratic).toBeLessThanOrEqual(bound);
    }
  });

  test("a value of 2·Mass − Reading shows the digits of its least accurate term, 0.1: 472n is 4.72, shown 4.7", () => {
    expect(massMinusReading().boundedInt.fromValue(472n).toString()).toBe("4.7");
  });
});

describe("LinearCombination: a result as a term of a further combination", () => {
  test("Age + DayCount: −365250 … 730500, bound 1.5, the square of the quadratic error 0.5 + 0.25 = 0.75, term 0.5", () => {
    const Age = age();
    const later = combination({
      name: "Later",
      terms: [
        [1n, Age.boundedInt],
        [1n, DayCount],
      ],
    });
    expect(later.coefficients).toEqual([1n, 1n]);
    expect([later.boundedInt.low, later.boundedInt.high]).toEqual([-365250n, 730500n]);
    expect(stored(later.boundedInt)).toEqual({
      bound: [15n, -1],
      quadraticSquared: [75n, -2],
      term: [5n, -1],
    });
  });

  test("the opening that Age.combineBlinded returns is a term of Age + DayCount: combine and combineBlinded agree, and isOpeningOf holds", async () => {
    const context = ristrettoContext();
    const Age = age();
    const today = await context.blind(DayCount.from(20000n));
    const birth = await context.blind(DayCount.from(7000n));
    const ageOpening = Age.combineBlinded(context, [today, birth]);
    expect(ageOpening.value.constructor).toBe(Age.boundedInt);
    const later = combination({
      name: "Later",
      terms: [
        [1n, Age.boundedInt],
        [1n, DayCount],
      ],
    });
    const more = await context.blind(DayCount.from(365n));
    const opening = later.combineBlinded(context, [ageOpening, more]);
    expect(opening.value.value).toBe(13365n);
    expect(await context.isOpeningOf(opening)).toBe(true);
    const element = later.combine(context, [committedOf(ageOpening), committedOf(more)]);
    expect(element.equals(opening.commitment)).toBe(true);
  });
});

describe("LinearCombination: the refusals of the constructor", () => {
  const bad: [string, unknown][] = [
    ["the spec null", null],
    ["the spec a string", "Age"],
    ["no name", { terms: [] }],
    ["an empty name", { name: "", terms: [] }],
    ["a name that is not a string", { name: 1, terms: [] }],
    ["terms not an array", { name: "Bad", terms: { 0: [1n, DayCount] } }],
    ["a term that is not a pair", { name: "Bad", terms: [[1n]] }],
    ["a term of three elements", { name: "Bad", terms: [[1n, DayCount, 1n]] }],
    ["a coefficient that is a string", { name: "Bad", terms: [["1", DayCount]] }],
    ["a coefficient NaN", { name: "Bad", terms: [[NaN, DayCount]] }],
    ["a class that is a bigint", { name: "Bad", terms: [[1n, 5n]] }],
    ["a class that is a plain object", { name: "Bad", terms: [[1n, {}]] }],
    ["a class that is not of bounded integers", { name: "Bad", terms: [[1n, Date]] }],
    ["a bounded integer in place of its class", { name: "Bad", terms: [[1n, DayCount.from(1n)]] }],
  ];

  test.each(bad)("%s is a TypeError", (_, spec) => {
    expect(() => combination(spec)).toThrow(TypeError);
  });

  test("the empty combination and a combination that fits no group are built: the constructor knows no group", () => {
    expect(() => combination({ name: "Nothing", terms: [] })).not.toThrow();
    const doubled = combination({
      name: "Doubled",
      terms: [
        [1n, Scalar],
        [1n, Scalar],
      ],
    });
    expect([doubled.boundedInt.low, doubled.boundedInt.high]).toEqual([0n, 2n * L - 2n]);
  });
});

describe("LinearCombination: the group at use", () => {
  test("Age, 730501 integers, is refused over a group of order 65536 by both methods, with a RangeError that names Age and the group", () => {
    const Age = age();
    const context = smallContext();
    const committed = [
      { commitment: g(), type: DayCount },
      { commitment: g().add(g()), type: DayCount },
    ];
    expect(() => Age.combine(context, committed)).toThrow(RangeError);
    expect(() => Age.combine(context, committed)).toThrow(/Age.*Small/);
    expect(() => Age.combineBlinded(context, [])).toThrow(/Age.*Small/);
  });

  test("2·Mass − Reading, 22399 integers, fits the same group: combine gives 20·C₁ − C₂", () => {
    const lc = massMinusReading();
    const c1 = g().multiplyScalar(5n);
    const c2 = g().multiplyScalar(7n);
    const element = lc.combine(smallContext(), [
      { commitment: c1, type: Mass },
      { commitment: c2, type: Reading },
    ]);
    expect(element.equals(g().multiplyScalar(93n))).toBe(true);
  });

  test("Scalar + Scalar, 2ℓ − 1 integers, is refused over ristretto255 by both methods, before any other check", async () => {
    const context = ristrettoContext();
    const doubled = combination({
      name: "Doubled",
      terms: [
        [1n, Scalar],
        [1n, Scalar],
      ],
    });
    const x = await context.blind(Scalar.fromValue(1n));
    const y = await context.blind(Scalar.fromValue(2n));
    expect(() => doubled.combine(context, [committedOf(x), committedOf(y)])).toThrow(
      /Doubled.*Ristretto255/,
    );
    expect(() => doubled.combineBlinded(context, [x, y])).toThrow(RangeError);
    expect(() => doubled.combineBlinded(context, [x, y])).toThrow(/Doubled.*Ristretto255/);
    // Before the count of the inputs is checked.
    expect(() => doubled.combine(context, [])).toThrow(/Doubled.*Ristretto255/);
  });
});

describe("LinearCombination: combine and combineBlinded", () => {
  /** Two openings, of Mass 2.3 and Reading −0.125, and 2·Mass − Reading. */
  async function fixture() {
    const context = ristrettoContext();
    const mass = await context.blind(Mass.from(2.3));
    const reading = await context.blind(Reading.from(-0.125));
    return { context, mass, reading, lc: massMinusReading(), h: await context.h() };
  }

  test("combine returns the element 472·g + (20·r₁ − r₂ mod ℓ)·h, which is 20·C₁ − C₂", async () => {
    const { context, mass, reading, lc, h } = await fixture();
    const element = lc.combine(context, [committedOf(mass), committedOf(reading)]);
    expect(element).toBeInstanceOf(RistrettoElement);
    const r = modL(20n * mass.blinding.value - reading.blinding.value);
    expect(element.equals(g().multiplyScalar(472n).add(h.multiplyScalar(r)))).toBe(true);
    const sum = mass.commitment.multiplyScalar(20n).subtract(reading.commitment);
    expect(element.equals(sum)).toBe(true);
  });

  test("combineBlinded returns a frozen opening: the value 472n of the class of the result, the blinding factor 20·r₁ − r₂ mod ℓ of the class of the group, the commitment of combine; isOpeningOf holds", async () => {
    const { context, mass, reading, lc } = await fixture();
    const opening = lc.combineBlinded(context, [mass, reading]);
    expect(Object.isFrozen(opening)).toBe(true);
    expect(opening.value.constructor).toBe(lc.boundedInt);
    expect(opening.value.value).toBe(472n);
    expect(opening.blinding.constructor).toBe(context.boundedInt);
    expect(opening.blinding.value).toBe(modL(20n * mass.blinding.value - reading.blinding.value));
    const element = lc.combine(context, [committedOf(mass), committedOf(reading)]);
    expect(opening.commitment.equals(element)).toBe(true);
    expect(await context.isOpeningOf(opening)).toBe(true);
  });

  test("Age of a birth date and today: 13000n, and isOpeningOf holds", async () => {
    const context = ristrettoContext();
    const Age = age();
    const today = await context.blind(DayCount.from(20000n));
    const birth = await context.blind(DayCount.from(7000n));
    const opening = Age.combineBlinded(context, [today, birth]);
    expect(opening.value.value).toBe(13000n);
    expect(await context.isOpeningOf(opening)).toBe(true);
    const element = Age.combine(context, [committedOf(today), committedOf(birth)]);
    expect(element.equals(opening.commitment)).toBe(true);
  });

  test("combine refuses inputs that are not an array, an input that is not an object, and a type that is not the class of its term, with a TypeError; a count other than the count of terms with a RangeError", async () => {
    const { context, mass, reading, lc } = await fixture();
    const good = [committedOf(mass), committedOf(reading)];
    expect(() => lc.combine(context, good)).not.toThrow();
    expect(() => lc.combine(context, "inputs" as unknown as unknown[])).toThrow(TypeError);
    expect(() => lc.combine(context, [null, committedOf(reading)])).toThrow(TypeError);
    expect(() => lc.combine(context, [committedOf(reading), committedOf(mass)])).toThrow(TypeError);
    // A class of the same constants is another class.
    const Twin = Scalar.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
    expect(() =>
      lc.combine(context, [{ commitment: mass.commitment, type: Twin }, committedOf(reading)]),
    ).toThrow(TypeError);
    expect(() => lc.combine(context, [committedOf(mass)])).toThrow(RangeError);
    expect(() => lc.combine(context, [...good, committedOf(mass)])).toThrow(RangeError);
  });

  test("combineBlinded refuses a value or a blinding factor of another class with a TypeError, and a count other than the count of terms with a RangeError", async () => {
    const { context, mass, reading, lc } = await fixture();
    expect(() => lc.combineBlinded(context, [reading, mass])).toThrow(TypeError);
    // A class of the same integers as the class of the group is another class.
    const Other = Scalar.define({ name: "Other", min: -0.5, max: [10n * L - 5n, -1] });
    const foreign = { ...mass, blinding: Other.fromValue(mass.blinding.value) };
    expect(() => lc.combineBlinded(context, [foreign, reading])).toThrow(TypeError);
    expect(() => lc.combineBlinded(context, [mass])).toThrow(RangeError);
    expect(() => lc.combineBlinded(context, [null, reading])).toThrow(TypeError);
  });
});

describe("LinearCombination: each commitment once", () => {
  test("x − x on one commitment is refused by both methods with a RangeError: the terms must be factored", async () => {
    const context = ristrettoContext();
    const Age = age();
    const x = await context.blind(DayCount.from(20000n));
    expect(() => Age.combine(context, [committedOf(x), committedOf(x)])).toThrow(RangeError);
    expect(() => Age.combineBlinded(context, [x, x])).toThrow(RangeError);
  });

  test("x + x is refused too, and an equal commitment in another object is the same commitment", async () => {
    const context = ristrettoContext();
    const sum = combination({
      name: "Sum",
      terms: [
        [1n, DayCount],
        [1n, DayCount],
      ],
    });
    const x = await context.blind(DayCount.from(20000n));
    const copy = { ...x, commitment: RistrettoElement.decode(x.commitment.encode()) };
    expect(() => sum.combineBlinded(context, [x, copy])).toThrow(RangeError);
    expect(() => sum.combine(context, [committedOf(x), committedOf(copy)])).toThrow(RangeError);
    const factored = combination({ name: "Twice", terms: [[2n, DayCount]] });
    const twice = factored.combineBlinded(context, [x]);
    expect(twice.value.value).toBe(40000n);
    expect(await context.isOpeningOf(twice)).toBe(true);
  });
});

describe("LinearCombination: the empty combination", () => {
  test("its class is the integer 0 alone, scale 0, and it has no coefficient", () => {
    const empty = combination({ name: "Nothing", terms: [] });
    expect(empty.coefficients).toEqual([]);
    expect([empty.boundedInt.scale, empty.boundedInt.low, empty.boundedInt.high]).toEqual([
      0,
      0n,
      0n,
    ]);
  });

  test("combine returns the identity; combineBlinded the identity, the value 0 of its class and the blinding factor 0 of the class of the group, frozen, which isOpeningOf accepts; both every time", async () => {
    const context = ristrettoContext();
    const empty = combination({ name: "Nothing", terms: [] });
    const element = empty.combine(context, []);
    expect(element.isIdentity()).toBe(true);
    const opening = empty.combineBlinded(context, []);
    expect(Object.isFrozen(opening)).toBe(true);
    expect(opening.commitment.isIdentity()).toBe(true);
    expect(opening.value.constructor).toBe(empty.boundedInt);
    expect(opening.value.value).toBe(0n);
    expect(opening.blinding.constructor).toBe(context.boundedInt);
    expect(opening.blinding.value).toBe(0n);
    expect(await context.isOpeningOf(opening)).toBe(true);
    expect(empty.combine(context, []).equals(element)).toBe(true);
    expect(empty.combineBlinded(context, []).commitment.equals(opening.commitment)).toBe(true);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
