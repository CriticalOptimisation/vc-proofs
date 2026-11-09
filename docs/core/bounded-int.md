# Bounded integers

A linear combination of committed values, such as `cutoff − DoB`, is only meaningful when
its result cannot wrap around the order `ℓ` of the group: otherwise a negative result
reads as a large positive one. Whether it can wrap depends on the range of each value,
not on the value itself. A `bigint` cannot carry a range: it is a primitive, with no own
property, and `BigInt.prototype` is shared by the whole program. So the low-level entry
point, `@criticaloptimisation/vc-proofs/core`, wraps the integer in a class,
`BoundedInt`.

A class of bounded integers holds a quantity: its **scale**, a power of ten, turns a
physical value into an integer, and its **range** bounds that integer. Both are
class-level constants, the same for every instance, and **every class has both**.
`BoundedInt` itself has a scale of 0, a factor of 1, and the range `[0, ℓ)`: the scalars
of the group, as the group writes them (see
[The range of a class](#the-range-of-a-class)). Its subclasses, made by
[`define`](#define) and [`defineRaw`](#defineraw), have their own, anywhere. So are
the errors of its values: they belong to the class, not to a value.

```ts
import { BoundedInt } from "@criticaloptimisation/vc-proofs/core";

const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100, step: 0.1 }); // in kg
Mass.scale; // 1: the integer counts tenths of a kilogram
[Mass.min, Mass.end]; // [0n, 1001n]: the integers from 0 to 1000

const m = Mass.from(2.3);
m.value; // 23n: the integer, a bigint
m.valueOf(); // 2.3: the physical value, a number
`${m}`; // "2.3"
Mass.from(100.04); // RangeError: above 100, the max of Mass, even if it rounds to 100.0
m + 1n; // TypeError: no implicit conversion, except to a string

const days = BoundedInt.from(19_000); // BoundedInt: scale 0, the range [0, ℓ)
days.value; // 19000n
[BoundedInt.min, BoundedInt.end]; // [0n, ℓ]: one integer for each scalar
BoundedInt.from(-1); // RangeError: -1 is below BoundedInt.min
```

## Values and errors

- **Immutable.** The integer is held in a private field, read through a getter with no
  setter. No method changes an instance. The classes made by `define`
  and `defineRaw` are frozen.
- **No public constructor.** Instances come only from `from` and `fromValue`, on
  `BoundedInt` or on one of its subclasses.
- **An integer, not a scalar.** The integer is kept as it is, with its sign: it is never
  reduced mod `ℓ`. An integer outside the range of its class is refused, never wrapped.
  The group never takes a `BoundedInt`: wherever it takes an integer, pass `x.value`
  (see [The group ristretto255](ristretto255.md)).
- **Errors**: `TypeError` for an input of the wrong kind, such as a `number` that is not
  an integer where only integers are accepted, or a constant of the wrong type;
  `RangeError` for a value outside the range of its class, an invalid set of constants,
  or a value too large for `valueOf()` to return as a finite `number`. The messages name
  the method and the class it was called on.

## BoundedInt

| Member                         | Returns                                                        | Errors                               |
| ------------------------------ | -------------------------------------------------------------- | ------------------------------------ |
| `static from(x)`               | a new instance holding the physical value `x`, scaled          | see [from](#from)                    |
| `static fromValue(q)`          | a new instance holding the integer `q`, as it is               | see [fromValue](#fromvalue)          |
| `static define(spec)`          | a new subclass, from physical bounds and a step                | see [define](#define)                |
| `static defineRaw(spec)`       | a new subclass, from a scale and integer bounds                | see [defineRaw](#defineraw)          |
| `value`                        | the integer, a `bigint`                                        | none                                 |
| `valueOf()`                    | the physical value, a `number`, without its meaningless digits | `RangeError` where it is `±Infinity` |
| `toString()`                   | the string of `valueOf()`, with the digits that carry meaning  | as `valueOf()`                       |
| `toLocaleString(locales?, o?)` | the digits of `toString()`, in the form of a locale            | `RangeError` beyond 100 decimals     |
| `[Symbol.toPrimitive](hint)`   | `toString()` for the hint `"string"`                           | `TypeError` for any other hint       |

Every static member works on the class it is called on: `Mass.from(2.3)` is a `Mass`,
checked against the range of `Mass`, and a subclass that does not override `from` gets
instances of its own.

### The class constants

A class is described by four constants, which every member reads from the class of the
call (`this` in a static member, `this.constructor` in an instance member):

| Constant         | Meaning                                                                   | On `BoundedInt` |
| ---------------- | ------------------------------------------------------------------------- | --------------- |
| `scale`          | the integer `k` of the factor `10^k`: the step of the class is `10^-k`    | `0`             |
| `min`            | the lowest integer of the range, a `bigint`                               | `0n`            |
| `end`            | the integer just above the range, a `bigint`: the range is `[min, end)`   | `ℓ`             |
| `integerOnly`    | whether `from` accepts only integers, as `BoundedInt` does, or rounds `x` | `true`          |
| `lowest`         | the lowest physical value, exact and inclusive, a decimal `[n, e]`        | absent          |
| `highest`        | the highest physical value, exact and inclusive, a decimal `[n, e]`       | absent          |
| `order`          | the number of distinct integers allowed, as for integers of a fixed size  | absent          |
| `errorBound`     | the guaranteed bound of the error of a value, in steps, a decimal         | `[5n, -1]`, ½   |
| `quadraticError` | the quadratic error of a value, in steps, a decimal                       | `[5n, -1]`, ½   |
| `termError`      | the error of the least accurate term of a value, in steps, a decimal      | `[5n, -1]`, ½   |

- **The scale is a power of ten.** `k` is an integer, and the step `10^-k` is a
  `number` above 0 and finite: `k` goes from `−308` to `323`, the powers of ten that a
  `number` can write, with no other limit. A step of `0.01` is `k = 2`, a step of 1000
  is `k = −3`. The integer of a value `x` counts steps:
  `q = x · 10^k`, rounded. The decimal that `q` stands for, `D(q) = q · 10^-k`, is
  exact: see [Rounding](#rounding) for why the factor is a power of ten and not of two.
- **The range is semi-open**, like the integers of a fixed width: `[−8, 8)` holds the
  integers from −8 to 7. `end − min` is the number of integers in the range. Every
  class has one, so every class can be asked for its bounds; a class with an `order`
  holds at most `order` integers.
- **No offset.** Zero is the integer 0, and a negative value is a negative `bigint`. A
  public constant `c` therefore commits as `c·g`, and a linear combination of values
  needs no correction for an offset.
- **`integerOnly`** is `true` on `BoundedInt`, and, for a class that does not declare
  it, `true` when its scale is 0 and `false` otherwise.

A class that declares none of the constants inherits those of `BoundedInt`: a scale of 0,
the range of `BoundedInt`, integers only. A class that declares one bound must declare
both.

**The exact bounds.** `from` checks a value against the **exact** bounds of its class,
never against its integers: `lowest ≤ x ≤ highest`, compared as decimals, before any
rounding. A class made by [`define`](#define) keeps the `min` and the `max` it was given,
exactly, as `lowest` and `highest`. A class without them, such as `BoundedInt` or a class
made by [`defineRaw`](#defineraw), has the exact bounds of its integers: the decimals of
`min` and `end − 1`. A class written by hand may declare `lowest` and `highest` with
`min` and `end`; every value between them must then scale to an integer of `[min, end)`,
else the class is refused with a `RangeError`. Two decimals are compared exactly, in
`bigint`s: the one with the larger exponent is multiplied by the power of ten that aligns
it on the other, so `0.52229`, `[52229n, -5]`, is below `0.5223`, `[5223n, -4]`, since
`52229 < 52230`.

#### The range of a class

The range of `BoundedInt` is `[0, ℓ)`: `BoundedInt.min` is `0n` and `BoundedInt.end` is
`ℓ`, the `ORDER` of
[the group ristretto255](ristretto255.md#order-encodescalar-decodescalar-and-invertscalar).
These are the scalars of the group as it writes them, one integer for each. `ℓ` is not a
power of two, so no split of `Z_ℓ` into two signed halves matches a sign bit: some
negative values would have a sign bit of 0, at the edge of numbers close to `ℓ/2`. The
range of `BoundedInt` holds no negative integer, and `BoundedInt.from(-1)` is a
`RangeError`.

A subclass has a range of its own, anywhere: `[−8, 8)`, `[0, 365251)` and `[ℓ, ℓ + 10)`
are all valid. A class whose values can be negative declares a range that holds them; a
linear combination such as `cutoff − DoB` computes the range of its result from the
ranges of its terms (#31).

**The order.** A class may have an `order`: the number of distinct values it may hold,
as for integers of a fixed size. A byte has 256 values, and a class of bytes, `[0, 256)`
or `[−128, 128)`, has the order `256n`: `end − min ≤ order`, else a `RangeError`. Without
an order, `end − min` has no limit. `BoundedInt` has none. `define` and `defineRaw` take
`order`, a `bigint`, or any form with a `bigint` `ORDER`, such as a class with a static
`ORDER`; a class inherits the order of its base when it is left out. An application that
maps the integers of a class onto a finite set of `N` values gives the class the order
`N`, so that two integers of the class never stand for the same value.

The constants of a class made by `define` or `defineRaw` are checked when it is made. A
class written by hand, `class Days extends BoundedInt { static override min = 0n; static
override end = 365251n }`, is checked at its first `from` or `fromValue`, once. Each
constant it declares overrides that of `BoundedInt`, so TypeScript requires `override`
under `noImplicitOverride`:

| Constants                                                                            | Error                     |
| ------------------------------------------------------------------------------------ | ------------------------- |
| `min` without `end`, or `end` without `min`                                          | `TypeError`               |
| `min` or `end` not a `bigint`, `scale` not a `number`, `integerOnly` not a boolean   | `TypeError`               |
| `min ≥ end`                                                                          | `RangeError`              |
| `end − min` above `order`                                                            | `RangeError`              |
| an error not a decimal, negative, or `termError ≤ quadraticError ≤ errorBound` false | `TypeError`, `RangeError` |
| `scale` not an integer, or `10^-scale` not a `number` above 0 and finite             | `RangeError`              |

Constants changed after the first use of a class are not checked again: declare them once.

### from

`from(x)` takes the **physical** value `x`, a `number`, a `bigint` or a decimal
`[n, e]`, and makes an instance of the class it is called on:

1. **Range.** `x` must lie within the [exact bounds](#the-class-constants) of the class,
   `lowest ≤ x ≤ highest`. The check is made on `x` itself, exactly, **before any
   rounding**: `Mass.from(100.04)` is refused, although it would round to `1000n`, the
   integer of 100.0 kg. On a class with `integerOnly`, a value that is not an integer is
   refused first.
2. **Scaling.** `x` is multiplied by `10^k` exactly. A `number` is taken at its exact
   binary value: it is split into its integer mantissa and its power of two, and the
   product is computed with `bigint`s: `m · 2^e` is the decimal `[m · 5^-e, e]`. A
   `bigint` `n` is the exact integer `n`, and a decimal `[n, e]` the exact value
   `n · 10^e`. In stage 1, a `number` is converted at once, and everything after works on
   the decimal.
3. **Rounding.** The product is rounded to the nearest integer, ties to even (see
   [Rounding](#rounding)). This is the only rounding of `from`. The integer `q` is then
   within `[min, end)`.

The errors of the instance are those of its class (see
[The errors of a class](#the-errors-of-a-class)).

| `x`                                                                     | Result                           |
| ----------------------------------------------------------------------- | -------------------------------- |
| a finite `number`, or a `bigint`, whose integer is in the range         | a new instance                   |
| a `number` with a fractional part, on a class with `integerOnly`        | `TypeError`: not an integer      |
| `NaN`, `Infinity`, `-Infinity`                                          | `TypeError`: not a finite number |
| anything else: a string, `null`, `undefined`, an object, a `BoundedInt` | `TypeError`                      |
| a value outside `[lowest, highest]`, compared exactly                   | `RangeError`                     |

On `BoundedInt`, with a scale of 0, `from` keeps its integer exactly within `[0, ℓ)`: a
`bigint` as it is, `from(ℓ - 1n).value` is `ℓ - 1n`, and every `number` without a
fractional part, so `from(2 ** 60).value` is `2n ** 60n` and `from(2 ** 252).value` is
`2n ** 252n`. `-0` gives `0n`. Outside the range, it throws a `RangeError`, as every
class does: `from(-1n)`, `from(ℓ)` and `from(Number.MAX_VALUE)` are refused. The type of
`x` is checked first: `from(-0.5)` is a `TypeError`.

A `BoundedInt` is refused: a caller that has one already has its `value`.

### fromValue

`fromValue(q)` takes the **integer** `q`, a `bigint`, as it is: the
representation, not the physical value. A linear combination makes its result with it,
and so does the decoding of an opening. On a scaled class the two differ:
`Mass.from(5n)` is 5 kg, `50n`, while `Mass.fromValue(5n)` is 0.5 kg.

| `q`                                     | Result         |
| --------------------------------------- | -------------- |
| a `bigint` in the range                 | a new instance |
| `q` not a `bigint`, a `number` included | `TypeError`    |
| `q` outside `[min, end)`                | `RangeError`   |

### The errors of a class

A class carries three errors, class constants like its scale, in steps of the class,
exact decimals like the integers they affect. They are set when the class is made, never
by a value: `define` sets the three to its `error`, in the unit of the values, scaled to
steps, or to `½`, half a step, the error of the rounding; `defineRaw` takes them in steps.
They describe how the values of the class are obtained; they never enter a commitment,
and they are never published.

- **`errorBound`** is a guaranteed bound: the true value is within
  `errorBound · 10^-k` of `D(q)`. It may be committed, or used to move a threshold, when
  an inequality must hold for sure.
- **`quadraticError`** combines independent errors: it is less than the bound when the
  errors of several terms partly cancel.
- **`termError`** is the error of the least accurate term alone. It is the one that
  decides which digits carry meaning.

For a class made by `define`, the three are equal. A linear combination with
coefficients `aᵢ` computes the errors of the class of its results from those of its
terms: `errorBound = Σ |aᵢ| · boundᵢ`,
`quadraticError = √(Σ (aᵢ · quadraticᵢ)²)` and `termError = max |aᵢ| · termᵢ`, so that
`termError ≤ quadraticError ≤ errorBound` always holds.

### valueOf and toString

`valueOf()` is an ordinary method: it returns the physical value as a `number`, without
the digits that the error makes meaningless.

1. **The position.** `j` is the largest integer `j ≥ 1` with `10^j ≤ 2 · termError`,
   or 0 when there is none, that is when `2 · termError < 10`. Rounding at `10^j` moves the value by at most
   `½ · 10^j ≤ termError` steps: it never adds more error than there is.
2. **The rounding.** `n` is `q / 10^j`, rounded to the nearest integer, ties to even, in
   `bigint`s. With `j = 0`, `n` is `q`.
3. **The conversion.** The result is the `number` nearest to `n · 10^(j−k)`, ties to
   even, at any size of `n` and any scale: the `number` that `Number` reads from the
   decimal `` `${n}e${j − k}` ``, which JavaScript rounds correctly. No power of ten is
   computed as a `number`.

With the default error of `½`, `j` is 0 and `valueOf()` is the `number` nearest to
`D(q)`. Where that `number` would be `±Infinity`, `valueOf()` throws a `RangeError`: the
precision may be lost, never the order of magnitude. This happens only at negative
scales, where a large integer counts large steps: at `k = −300`, `10n ** 9n` is `1e309`.
On `BoundedInt`, `valueOf()` is the nearest `number` to the integer, ties to even, so
`2n ** 53n + 1n` gives `2 ** 53`, and `ℓ - 1n` gives `Number(ℓ - 1n)`, about `7.2e75`: it
never throws.

`toString()` writes the digits that `valueOf()` kept, and no other: with `d = k − j`
decimals, it returns `this.valueOf().toFixed(d)` when `0 < d ≤ 100`, and
`String(this.valueOf())` otherwise. `toFixed` writes at most 100 decimals; beyond that,
`String` writes the number in exponential notation. `Mass.from(2)` gives `"2.0"`: the
tenth of a kilogram carries meaning. On `BoundedInt`, `from(7).toString()` is `"7"`, and
`from(10n ** 21n).toString()` is `"1e+21"`. For the exact decimal digits of the integer,
write `x.value.toString()`.

`toString()` writes a point, the locale-independent form of JavaScript, as
`Number.prototype.toString` does, so that its string can be read back by a program.
`toLocaleString(locales?, options?)` writes the same digits, exactly, in the form of a
locale, through `Intl.NumberFormat`, which formats a decimal string without converting it
to a `number`: `"1234.50"` is `"1,234.50"` in `en-US` and `"1 234,50"` in `fr-FR`.
`options` may set anything but the number of decimals, which is that of `toString()`;
`Intl.NumberFormat` refuses more than 100 decimals with a `RangeError`.

Both go through `valueOf()`: a subclass that overrides `valueOf()` changes `toString()`
too.

### Conversions

JavaScript converts an object implicitly through its `[Symbol.toPrimitive]` method.
`BoundedInt`'s converts to a string only:

- for the hint `"string"` (a template literal, `String(x)`), it returns `x.toString()`;
- for any other hint it throws a `TypeError` whose message asks to call `x.valueOf()`
  for the `number`, or to read `x.value` for the `bigint`.

So `x + 1n`, `"x = " + x`, `x < 5n`, `x * 2n`, `Number(x)` and `Math.abs(x)` all throw.
Without this method, `x + 1n` would give the string `"[object Object]1"`, and `x < 5n`
would give `false`, with no error: in code that decides a sign, a silent wrong answer is
the worst outcome. Since `[Symbol.toPrimitive]` comes first, JavaScript never calls
`valueOf()` implicitly.

`JSON.stringify(x)` gives `{}`: the core layer serializes nothing.

## Classes

### define

`BoundedInt.define({ name, min, max, step?, error?, order? })` makes a frozen subclass of the class it
is called on, from the physical values a user thinks in:

- `name` is the name of the class, a non-empty string, used in the messages;
- `min` and `max` are the lowest and the highest physical values, inclusive: finite
  `number`s, `bigint`s or decimals `[n, e]`, with `min ≤ max`. They are kept exactly;
- `step` is the accuracy, a finite `number` above 0. The scale `k` is the smallest
  integer, from `−308` to `323`, with `10^-k ≤ step`: a step of `0.1` gives `k = 1`, a
  step of `0.025` gives `k = 2`, a step of 1000 gives `k = −3`. The comparison is made
  between exact `number`s, `Number("1e" + (−k))` and `step`, never with a logarithm;
- without `step`, the class takes integers only: `k = 0` and `integerOnly`, and `min`
  and `max` must be integers;
- `error` is the accuracy of the values, in their unit, exact: a `bigint` or a decimal,
  `0` or more. The three errors of the class are `error · 10^k` steps, or `½` when it is
  left out;
- `order` is the number of distinct integers allowed (see
  [The order](#the-range-of-a-class)), that of the base when left out.

The class gets `scale = k`, `lowest = min` and `highest = max`, exactly, and
`integerOnly`, `true` only when `step` is left out. Its integers are those that the values
from `min` to `max` scale to: `[round(min · 10^k), round(max · 10^k) + 1)`, rounded as by
`from`. They are the range of `q`, for `fromValue` and for linear combinations; `from`
never checks a value against them, but against `lowest` and `highest`. With `max` 2.9999
and a step of 1, the integers end at 3, and 2.99994 is still refused: it is above `max`.

| `spec`                                                                | Error        |
| --------------------------------------------------------------------- | ------------ |
| `name` not a non-empty string; `min`, `max` or `step` of another type | `TypeError`  |
| `min` or `max` not finite, or not an integer when `step` is left out  | `TypeError`  |
| `min > max`; `step` not above 0, or not finite                        | `RangeError` |
| a `step` below `1e-323`, the smallest power of ten a `number` holds   | `RangeError` |
| a range of more than `order` integers                                 | `RangeError` |

`define` sets no other limit on the bounds: a range of large integers is valid, but the
guarantees of [Rounding](#rounding) hold only below `10^15`.

### defineRaw

`BoundedInt.defineRaw({ name, scale, min, end, integerOnly?, errors?, order? })` makes a frozen
subclass from its constants directly: `scale` an integer from `−308` to `323`, and
`min < end`, two `bigint`s with `end − min ≤ order`, anywhere. `integerOnly` is a
boolean, `false` when left out, so that a class of integers only can be made at any
scale. `errors` is `{ bound, quadratic, term }`, in steps, each a `bigint` or a decimal:
`bound` is `½` when it is left out, `quadratic` is `bound`, `term` is `quadratic`, and
`0 ≤ term ≤ quadratic ≤ bound` must hold. `order` is as for `define`. A linear
combination makes the class of its results with it. Its errors are those of
[the class constants](#the-class-constants), and a `TypeError` for a `name` that is not a
non-empty string.

## Rounding

**One rounding, ties to even.** `from` rounds once: the exact value of `x · 10^k` to the
nearest integer. A tie, an exact half, goes to the even integer, the one whose lowest
bit is 0. In two's complement this holds for negative integers too (`−2` is `…110`), so
rounding is symmetric: `from(-x).value` is `-from(x).value`. `Math.round` rounds ties
up (`Math.round(-2.5)` is `-2`, `Math.round(2.5)` is `3`), and is not used.

A tie needs `x · 10^k` to be exactly a half, as for `0.125` with `k = 2`: it gives 12.
An input written `1.005` is no tie: the `number` is `1.00499999999999989…`, and it rounds
to `100`.

**Why the factor is a power of ten.** A value rounded to `k` decimals, such as 12.76, is
a decimal; with the factor `10^k` it is the integer 1276, which every binary format holds
exactly. With a factor `2^f`, the decimal shown would be a second rounding of a binary
one, and for every `f` there are inputs where the two disagree. Take a decimal midpoint
`M = (m + ½) · 10^-k` that is not a multiple of `2^-f`: there is always one, such as
`½ · 10^-k`, whose denominator has a factor 5. Every `x` strictly between `M` and the
nearest multiple of `2^-f` beyond it, on the far side, would show the decimal of the
other side of `M`. More bits make that window narrower, never empty. With the factor
`10^k` there is no window: the rounding to the step is the only one.

**What is guaranteed**, for a class whose integers are below `10^15` in absolute value,
the 15 significant digits that a `number` holds exactly, and whose decimals are normal
`number`s (from about `2.2e-308` to `1.8e308` in absolute value), and for an instance
whose `termError` is below 5, so that `valueOf()` rounds nothing:

- **R1.** `valueOf()` is the `number` nearest to the decimal `D(q)`, and
  `String(x.valueOf())` writes that decimal: `Mass.fromValue(23n)` gives `2.3` and
  `"2.3"`.
- **R2.** For every decimal `x` on the step of the class, written with at most `k`
  decimals (or a multiple of `10^-k` when `k ≤ 0`), whose integer is in the range,
  `from(x).valueOf() === x`.
- **R3.** For every such instance `y`, `from(y.valueOf()).value === y.value`.
- **R4.** For every `x` whose integer is in the range, `D(from(x).value)` is within half
  a step of `x`.

The rounding of `valueOf()` does not affect R2 and R3: `from` makes instances with an
error of `½`, or the error its caller gives, and only an error of 5 steps or more moves
`j` from 0.

## Examples

The classes:

```ts
const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100, step: 0.1 }); // [0, 1001), k = 1
const Reading = BoundedInt.define({ name: "Reading", min: -7.99, max: 15.99, step: 0.01 }); // [−799, 1600), k = 2
const Volume = BoundedInt.define({ name: "Volume", min: 0, max: 1e6, step: 1000 }); // [0, 1001), k = −3
const DayCount = BoundedInt.define({ name: "DayCount", min: 0, max: 365250 }); // [0, 365251), k = 0, integers only
const Difference = BoundedInt.defineRaw({ name: "Difference", scale: 1, min: -1000n, end: 1001n });
```

`Difference` holds the results of `10·x₁ − x₂`, for `x₁` a mass in kilograms with a step
of 1 and `x₂` a `Mass`: the coefficients align the scales, never the values.

| Call                                                                 | `value`      | Errors (bound, quadratic, term) | `valueOf()` | `toString()` |
| -------------------------------------------------------------------- | ------------ | ------------------------------- | ----------- | ------------ |
| `Mass.from(2.3)`                                                     | `23n`        | ½, ½, ½                         | 2.3         | `"2.3"`      |
| `Mass.from(2)`                                                       | `20n`        | ½, ½, ½                         | 2           | `"2.0"`      |
| `Mass.from(5n)`                                                      | `50n`        | ½, ½, ½                         | 5           | `"5.0"`      |
| `Mass.from(100.04)`                                                  | `RangeError` |                                 |             |              |
| `Mass.from(100.06)`                                                  | `RangeError` |                                 |             |              |
| `Mass.from(2.3, 0)`                                                  | `23n`        | 0, 0, 0                         | 2.3         | `"2.3"`      |
| `Mass.from(2.3, 0.5)`                                                | `23n`        | 5, 5, 5                         | 2           | `"2"`        |
| `Mass.fromValue(5n)`                                                 | `5n`         | ½, ½, ½                         | 0.5         | `"0.5"`      |
| `Reading.from(12.76362)`                                             | `1276n`      | ½, ½, ½                         | 12.76       | `"12.76"`    |
| `Reading.from(0.125)`                                                | `12n`        | ½, ½, ½                         | 0.12        | `"0.12"`     |
| `Reading.from(-0.125)`                                               | `-12n`       | ½, ½, ½                         | -0.12       | `"-0.12"`    |
| `Reading.from(1.005)`                                                | `100n`       | ½, ½, ½                         | 1           | `"1.00"`     |
| `Reading.from(16)`                                                   | `RangeError` |                                 |             |              |
| `Volume.from(1500)`                                                  | `2n`         | ½, ½, ½                         | 2000        | `"2000"`     |
| `Volume.from(2500)`                                                  | `2n`         | ½, ½, ½                         | 2000        | `"2000"`     |
| `Volume.from(3500)`                                                  | `4n`         | ½, ½, ½                         | 4000        | `"4000"`     |
| `DayCount.from(20000)`                                               | `20000n`     | ½, ½, ½                         | 20000       | `"20000"`    |
| `DayCount.from(1.5)`                                                 | `TypeError`  |                                 |             |              |
| `Difference.fromValue(47n)`                                          | `47n`        | ½, ½, ½                         | 4.7         | `"4.7"`      |
| `Difference.fromValue(47n, { bound: 5 })`                            | `47n`        | 5, 5, 5                         | 5           | `"5"`        |
| `Difference.fromValue(-47n, { bound: 5 })`                           | `-47n`       | 5, 5, 5                         | -5          | `"-5"`       |
| `Difference.fromValue(45n, { bound: 5 })`                            | `45n`        | 5, 5, 5                         | 4           | `"4"`        |
| `Difference.fromValue(123n, { bound: 8, quadratic: 5.66, term: 4 })` | `123n`       | 8, 5.66, 4                      | 12.3        | `"12.3"`     |
| `Difference.fromValue(1001n)`                                        | `RangeError` |                                 |             |              |

`Mass.from(2.3, 0.5)` is a mass known to half a kilogram: its error is 5 steps of
0.1 kg, so `valueOf()` rounds to the kilogram. In `Difference.fromValue(45n, { bound: 5
})`, 4.5 is a tie, and goes to 4. In the row with a term error of 4, `2 · 4 < 10`: the
tenths still carry meaning.

## Subclasses

`define` and `defineRaw` make the subclasses an application needs. A class written by
hand declares the [class constants](#the-class-constants) as static fields, and may
override:

- `from` and `fromValue`, to check more than the range;
- `valueOf`, to convert otherwise, which `toString()` and the conversion to a string then
  follow;
- `toString`, to write a unit, for example.

Its constructor is `protected`, and its instances are not frozen, so that a subclass can
call it and add fields of its own.

A value of a class has no salt: a Pedersen commitment hides its value perfectly, and no
random low bits would add to that (see
[Search of a committed value](../threat-model.md#search-of-a-committed-value)).

<!--
Change History

| PR  | Summary |
|-----|---------|
| #42 | new: BoundedInt, its casts, conversions and subclasses (#41) |
| #47 | decimal classes: scale, range, from and fromValue, three errors, define, defineRaw, rounding; no salt; every class has a range, [0, ℓ) on BoundedInt, at most ℓ integers; scales -308 to 323, no limit of 10^15 (#44) |
-->
