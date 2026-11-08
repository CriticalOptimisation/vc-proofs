/**
 * The classes and the table of examples of docs/core/bounded-int.md, *Examples* (#44), as
 * data: test/bounded-int-scale.test.ts runs every row against the code, and
 * test/docs/bounded-int.node.test.ts checks that the page shows the same rows. The
 * classes are made on first use, so that a missing `define` fails each test that needs
 * it, not the import.
 */
import { BoundedInt } from "../../src/core/index.js";

/** The classes of the examples, made by `define` and `defineRaw`. */
export interface ExampleClasses {
  readonly Mass: typeof BoundedInt;
  readonly Reading: typeof BoundedInt;
  readonly Volume: typeof BoundedInt;
  readonly DayCount: typeof BoundedInt;
  readonly Difference: typeof BoundedInt;
}

let made: ExampleClasses | undefined;

/** The classes of the page, made once. */
export function classes(): ExampleClasses {
  made ??= {
    Mass: BoundedInt.define({ name: "Mass", min: 0, max: 100, step: 0.1 }),
    Reading: BoundedInt.define({ name: "Reading", min: -7.99, max: 15.99, step: 0.01 }),
    Volume: BoundedInt.define({ name: "Volume", min: 0, max: 1e6, step: 1000 }),
    DayCount: BoundedInt.define({ name: "DayCount", min: 0, max: 365250 }),
    Difference: BoundedInt.defineRaw({ name: "Difference", scale: 1, min: -1000n, end: 1001n }),
  };
  return made;
}

/** The constants each class of the page must have: scale, min, end, integerOnly. */
export const constants: readonly (readonly [
  keyof ExampleClasses,
  number,
  bigint,
  bigint,
  boolean,
])[] = [
  ["Mass", 1, 0n, 1001n, false],
  ["Reading", 2, -799n, 1600n, false],
  ["Volume", -3, 0n, 1001n, false],
  ["DayCount", 0, 0n, 365251n, true],
  ["Difference", 1, -1000n, 1001n, false],
];

/** A row of the table: the call as the page writes it, and what it gives. */
export interface Example {
  /** The call, exactly as in the first column of the page. */
  readonly call: string;
  readonly run: (c: ExampleClasses) => BoundedInt;
  /** The error thrown, for a refused call; the other fields are then absent. */
  readonly throws?: typeof TypeError | typeof RangeError;
  readonly value?: bigint;
  /** errorBound, quadraticError, termError. */
  readonly errors?: readonly [number, number, number];
  /** What `valueOf()` gives. */
  readonly number?: number;
  readonly string?: string;
}

const half = [0.5, 0.5, 0.5] as const;

export const examples: readonly Example[] = [
  {
    call: "Mass.from(2.3)",
    run: (c) => c.Mass.from(2.3),
    value: 23n,
    errors: half,
    number: 2.3,
    string: "2.3",
  },
  {
    call: "Mass.from(2)",
    run: (c) => c.Mass.from(2),
    value: 20n,
    errors: half,
    number: 2,
    string: "2.0",
  },
  {
    call: "Mass.from(5n)",
    run: (c) => c.Mass.from(5n),
    value: 50n,
    errors: half,
    number: 5,
    string: "5.0",
  },
  {
    call: "Mass.from(100.04)",
    run: (c) => c.Mass.from(100.04),
    value: 1000n,
    errors: half,
    number: 100,
    string: "100.0",
  },
  { call: "Mass.from(100.06)", run: (c) => c.Mass.from(100.06), throws: RangeError },
  {
    call: "Mass.from(2.3, 0)",
    run: (c) => c.Mass.from(2.3, 0),
    value: 23n,
    errors: [0, 0, 0],
    number: 2.3,
    string: "2.3",
  },
  {
    call: "Mass.from(2.3, 0.5)",
    run: (c) => c.Mass.from(2.3, 0.5),
    value: 23n,
    errors: [5, 5, 5],
    number: 2,
    string: "2",
  },
  {
    call: "Mass.fromValue(5n)",
    run: (c) => c.Mass.fromValue(5n),
    value: 5n,
    errors: half,
    number: 0.5,
    string: "0.5",
  },
  {
    call: "Reading.from(12.76362)",
    run: (c) => c.Reading.from(12.76362),
    value: 1276n,
    errors: half,
    number: 12.76,
    string: "12.76",
  },
  {
    call: "Reading.from(0.125)",
    run: (c) => c.Reading.from(0.125),
    value: 12n,
    errors: half,
    number: 0.12,
    string: "0.12",
  },
  {
    call: "Reading.from(-0.125)",
    run: (c) => c.Reading.from(-0.125),
    value: -12n,
    errors: half,
    number: -0.12,
    string: "-0.12",
  },
  {
    call: "Reading.from(1.005)",
    run: (c) => c.Reading.from(1.005),
    value: 100n,
    errors: half,
    number: 1,
    string: "1.00",
  },
  { call: "Reading.from(16)", run: (c) => c.Reading.from(16), throws: RangeError },
  {
    call: "Volume.from(1500)",
    run: (c) => c.Volume.from(1500),
    value: 2n,
    errors: half,
    number: 2000,
    string: "2000",
  },
  {
    call: "Volume.from(2500)",
    run: (c) => c.Volume.from(2500),
    value: 2n,
    errors: half,
    number: 2000,
    string: "2000",
  },
  {
    call: "Volume.from(3500)",
    run: (c) => c.Volume.from(3500),
    value: 4n,
    errors: half,
    number: 4000,
    string: "4000",
  },
  {
    call: "DayCount.from(20000)",
    run: (c) => c.DayCount.from(20000),
    value: 20000n,
    errors: half,
    number: 20000,
    string: "20000",
  },
  { call: "DayCount.from(1.5)", run: (c) => c.DayCount.from(1.5), throws: TypeError },
  {
    call: "Difference.fromValue(47n)",
    run: (c) => c.Difference.fromValue(47n),
    value: 47n,
    errors: half,
    number: 4.7,
    string: "4.7",
  },
  {
    call: "Difference.fromValue(47n, { bound: 5 })",
    run: (c) => c.Difference.fromValue(47n, { bound: 5 }),
    value: 47n,
    errors: [5, 5, 5],
    number: 5,
    string: "5",
  },
  {
    call: "Difference.fromValue(-47n, { bound: 5 })",
    run: (c) => c.Difference.fromValue(-47n, { bound: 5 }),
    value: -47n,
    errors: [5, 5, 5],
    number: -5,
    string: "-5",
  },
  {
    call: "Difference.fromValue(45n, { bound: 5 })",
    run: (c) => c.Difference.fromValue(45n, { bound: 5 }),
    value: 45n,
    errors: [5, 5, 5],
    number: 4,
    string: "4",
  },
  {
    call: "Difference.fromValue(123n, { bound: 8, quadratic: 5.66, term: 4 })",
    run: (c) => c.Difference.fromValue(123n, { bound: 8, quadratic: 5.66, term: 4 }),
    value: 123n,
    errors: [8, 5.66, 4],
    number: 12.3,
    string: "12.3",
  },
  {
    call: "Difference.fromValue(1001n)",
    run: (c) => c.Difference.fromValue(1001n),
    throws: RangeError,
  },
];

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
