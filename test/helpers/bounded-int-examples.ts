/**
 * The classes and the table of examples of docs/core/bounded-int.md, *Examples* (#44), as
 * data: test/bounded-int-scale.test.ts runs every row against the code, and
 * test/docs/bounded-int.node.test.ts checks that the page shows the same rows. The
 * classes are made on first use, so that a missing `define` fails each test that needs
 * it, not the import.
 */
import { BoundedInt } from "../../src/core/bounded-int.js";

/** The classes of the examples, made by `define`. */
export interface ExampleClasses {
  readonly Mass: typeof BoundedInt;
  readonly Reading: typeof BoundedInt;
  readonly Volume: typeof BoundedInt;
  readonly DayCount: typeof BoundedInt;
  readonly Rough: typeof BoundedInt;
}

let made: ExampleClasses | undefined;

/** The classes of the page, made once. */
export function classes(): ExampleClasses {
  made ??= {
    Mass: BoundedInt.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 }),
    Reading: BoundedInt.define({ name: "Reading", min: -7.99, max: 15.995, step: 0.01 }),
    Volume: BoundedInt.define({ name: "Volume", min: 0, max: 1000500, step: 1000 }),
    DayCount: BoundedInt.define({ name: "DayCount", min: -0.5, max: 365250.5 }),
    Rough: BoundedInt.define({ name: "Rough", min: 0, max: 100.05, step: 0.1, error: 0.5 }),
  };
  return made;
}

/**
 * The constants each class of the page must have: scale, min, max, and the integers its
 * values round to, from the lowest to the highest.
 */
export const constants: readonly (readonly [
  keyof ExampleClasses,
  number,
  number,
  number,
  bigint,
  bigint,
])[] = [
  ["Mass", 1, 0, 100.05, 0n, 1000n],
  ["Reading", 2, -7.99, 15.995, -799n, 1599n],
  ["Volume", -3, 0, 1000500, 0n, 1000n],
  ["DayCount", 0, -0.5, 365250.5, 0n, 365250n],
  ["Rough", 1, 0, 100.05, 0n, 1000n],
];

/** A row of the table: the call as the page writes it, and what it gives. */
export interface Example {
  /** The call, exactly as in the first column of the page. */
  readonly call: string;
  readonly run: (c: ExampleClasses) => BoundedInt;
  /** The error thrown, for a refused call; the other fields are then absent. */
  readonly throws?: typeof TypeError | typeof RangeError;
  readonly value?: bigint;
  /** What `valueOf()` gives. */
  readonly number?: number;
  readonly string?: string;
}

/** An accepted row. */
const row = (
  call: string,
  run: (c: ExampleClasses) => BoundedInt,
  value: bigint,
  number: number,
  string: string,
): Example => ({ call, run, value, number, string });

/** A refused row. */
const refused = (
  call: string,
  run: (c: ExampleClasses) => BoundedInt,
  throws: typeof TypeError | typeof RangeError,
): Example => ({ call, run, throws });

export const examples: readonly Example[] = [
  row("Mass.from(2.3)", (c) => c.Mass.from(2.3), 23n, 2.3, "2.3"),
  row("Mass.from(2)", (c) => c.Mass.from(2), 20n, 2, "2.0"),
  row("Mass.from(5n)", (c) => c.Mass.from(5n), 50n, 5, "5.0"),
  row("Mass.from(100.04)", (c) => c.Mass.from(100.04), 1000n, 100, "100.0"),
  refused("Mass.from(100.05)", (c) => c.Mass.from(100.05), RangeError),
  refused("Mass.from(-0.04)", (c) => c.Mass.from(-0.04), RangeError),
  row("Mass.fromValue(5n)", (c) => c.Mass.fromValue(5n), 5n, 0.5, "0.5"),
  refused("Mass.fromValue(1001n)", (c) => c.Mass.fromValue(1001n), RangeError),
  row("Reading.from(12.76362)", (c) => c.Reading.from(12.76362), 1276n, 12.76, "12.76"),
  row("Reading.from(0.125)", (c) => c.Reading.from(0.125), 12n, 0.12, "0.12"),
  row("Reading.from(-0.125)", (c) => c.Reading.from(-0.125), -12n, -0.12, "-0.12"),
  row("Reading.from(1.005)", (c) => c.Reading.from(1.005), 100n, 1, "1.00"),
  refused("Reading.from(16)", (c) => c.Reading.from(16), RangeError),
  row("Volume.from(1500)", (c) => c.Volume.from(1500), 2n, 2000, "2000"),
  row("Volume.from(2500)", (c) => c.Volume.from(2500), 2n, 2000, "2000"),
  row("Volume.from(3500)", (c) => c.Volume.from(3500), 4n, 4000, "4000"),
  row("DayCount.from(20000)", (c) => c.DayCount.from(20000), 20000n, 20000, "20000"),
  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly)
  // the row DayCount.from(1.5), a TypeError -> (removed: integerOnly is gone)
  // refused("DayCount.from(1.5)", (c) => c.DayCount.from(1.5), TypeError),
  row("Rough.from(2.3)", (c) => c.Rough.from(2.3), 23n, 2, "2"),
  row("Rough.from(4.5)", (c) => c.Rough.from(4.5), 45n, 4, "4"),
];

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #47    | new: the classes and the examples of the page (#44)           |
// | #51    | imports the generic BoundedInt of bounded-int.ts (#49)        |
