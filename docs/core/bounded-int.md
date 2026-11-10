# Bounded integers

A `bigint` cannot carry bounds: it is a primitive, with no own property, and
`BigInt.prototype` is shared by the whole program. So the low-level entry point,
`@criticaloptimisation/vc-proofs/core`, wraps the integer in a class, `BoundedInt`, and
the class carries the bounds.

A class of bounded integers holds a quantity. Its **scale**, a power of ten, turns a value
into an integer, and its **bounds**, `[min, max)`, delimit the values it accepts. Both are
class-level constants, the same for every instance. `BoundedInt` itself is the integer of
Z_ℓ, where `ℓ` is the order of the group ristretto255 (`RistrettoElement.ORDER`). It has a
scale of 0 and the bounds `[−0.5, ℓ − 0.5)`: `ℓ` equal buckets of width 1, one for each
integer from 0 to `ℓ − 1`. Its [order](#the-range-of-a-class) is `ℓ`, and every class made
from it inherits that order. Its subclasses, made by [`define`](#define) or written by hand,
have bounds of their own.

```ts
import { BoundedInt } from "@criticaloptimisation/vc-proofs/core";

const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 }); // in kg
Mass.scale; // 1: the integer counts tenths of a kilogram

const m = Mass.from(2.3);
m.value; // 23n: the integer, a bigint
m.valueOf(); // 2.3: the value, a number
`${m}`; // "2.3"
Mass.from(100.04).value; // 1000n: 100.0 kg
Mass.from(100.05); // RangeError: not below Mass.max
m + 1n; // TypeError: no implicit conversion, except to a string

const days = BoundedInt.from(19_000n); // BoundedInt: scale 0, [−0.5, ℓ − 0.5)
days.value; // 19000n
BoundedInt.from([15n, -1]).value; // 2n: 1.5, rounded to the step, ties to even
BoundedInt.from([-5n, -1]).value; // 0n: −0.5, a tie, goes to 0
BoundedInt.from(-1n); // RangeError: below BoundedInt.min
BoundedInt.from(5); // TypeError: BoundedInt needs 76 digits, more than a number holds
```

## Values and errors

- **Immutable.** The integer is held in a private field, read through a getter with no
  setter. No method changes an instance. `BoundedInt` and the classes made by `define` are
  frozen.
- **No public constructor.** Instances come only from `from` and `fromValue`, on
  `BoundedInt` or on one of its subclasses.
- **An integer, as it is.** The integer keeps its sign and its size. A value outside the
  bounds of its class is refused, never wrapped or clamped.
- **Errors**: `TypeError` for an input of the wrong kind, such as a `number` that is not
  an integer where only integers are accepted, or a constant of the wrong type;
  `RangeError` for a value outside the bounds of its class, an invalid set of constants,
  or a value too large for `valueOf()` to return as a finite `number`. The messages name
  the method and the class it was called on.

## BoundedInt

| Member                               | Returns                                                            | Errors                               |
| ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------ |
| `static from(x)`                     | a new instance holding the value `x`, scaled                       | see [from](#from)                    |
| `static fromValue(q)`                | a new instance holding the integer `q`, as it is                   | see [fromValue](#fromvalue)          |
| `static define(spec)`                | a new subclass                                                     | see [define](#define)                |
| `static errorBound`                  | the bound of the error of a value, relative to `max − min`         | as the constants                     |
| `static quadraticError`              | the quadratic error of a value, relative to `max − min`            | as the constants                     |
| `static termError`                   | the error of the least accurate term, relative to `max − min`      | as the constants                     |
| `value`                              | the integer, a `bigint`                                            | none                                 |
| `valueOf()`                          | the value, the nearest `number`, without its meaningless digits    | `RangeError` where it is `±Infinity` |
| `toString()`                         | the exact decimal of the value, with the digits that carry meaning | none                                 |
| `toLocaleString(locales?, options?)` | the digits of `toString()`, in the form of a locale                | `RangeError` beyond 100 decimals     |
| `[Symbol.toPrimitive](hint)`         | `toString()` for the hint `"string"`                               | `TypeError` for any other hint       |

Every static member works on the class it is called on: `Mass.from(2.3)` is a `Mass`,
checked against the bounds of `Mass`, and a subclass that does not override `from` gets
instances of its own.

### Quantities

Every quantity a class takes, a value, a bound, a step or an error, is one of:

- a `bigint`, an integer;
- a finite `number`;
- an exact decimal `[n, e]`, a `bigint` `n` and an integer `e`, worth `n · 10^e`:
  `[23n, -1]` is 2.3.

It is converted at once to a decimal, and all the arithmetic is done on `bigint`s. A
`number` is a binary fraction: `±m · 2^p`, with an integer mantissa `m` of 53 bits. Every
power of 2 is a decimal, since `2^-p = 5^p · 10^-p`, so every `number` is a decimal:

- the mantissa is read as a `bigint` `m`, with its hidden bit: `9007199254740991` when its
  53 bits are all ones;
- the binary point moves 52 bits to the right: the exponent becomes `p = E − 52`;
- a positive `p` multiplies `m` by `2n ** p`;
- a negative `p` multiplies `m` by `5n ** −p`, and `p` is kept as the power of ten;
- the product is rounded once to 15 significant digits, ties to even;
- the trailing zeros move into the power of ten.

The converse does not hold: 0.3 is a finite decimal in base 10, but an endless one in base
2 (`0.0100110011…`). The `number` written `0.3` is exactly
`0.299999999999999988897769753748434595763683319091796875`, but a `number` holds only 15
significant digits reliably: it cannot tell that value apart from the decimals around it,
0.3 among them. So the conversion keeps 15 digits, and the `number` `0.3` is the decimal
0.3, as its writer meant. A bound and a value written as the same `number` are the same
decimal, and a decimal between 0.1 and the binary value of the `number` 0.1 is above the
bound `max: 0.1`, as its writer meant. The rounding is done once, to 15 digits: dividing
by 10 again and again would truncate, and give 0.299999999999999.

A class whose values need more than 15 digits takes no `number` (see [from](#from)).

### The class constants

A class is described by its constants, which every member reads from the class of the
call (`this` in a static member, `this.constructor` in an instance member):

| Constant | Meaning                                                                    | On `BoundedInt`                         |
| -------- | -------------------------------------------------------------------------- | --------------------------------------- |
| `scale`  | the integer `k` of the factor `10^k`: the step of the class is `10^-k`     | `0`                                     |
| `min`    | the lowest value, included, a quantity                                     | `-0.5`                                  |
| `max`    | the value just above the highest, excluded, a quantity                     | `ℓ − 0.5`, kept as `[10n * ℓ - 5n, -1]` |
| `order`  | the most distinct values the class, and every class made from it, may hold | `ℓ`, `RistrettoElement.ORDER`           |
| `error`  | the accuracy of the values, in the unit of the values, a quantity          | absent: ½ step                          |

- **The scale is a power of ten.** `k` is an integer from `−308` to `323`, the powers of
  ten whose step `10^-k` a `number` can write. A step of `0.01` is `k = 2`, a step of 1000
  is `k = −3`. The integer of a value `x` counts steps: `q = x · 10^k`, rounded. The
  decimal that `q` stands for is `D(q) = q · 10^-k`.
  A class that declares none of the constants inherits those of its base. A class that
  declares one bound must declare both.

#### The range of a class

The bounds are **semi-open**: a value `x` is accepted when `min ≤ x < max`, compared
exactly, as decimals, before any rounding; `x = max` is a `RangeError`. When an interval is
split at an ascending series of points `a₀ < a₁ < … < aₙ`, every `x` of `[a₀, aₙ)` then lies
in exactly one of the intervals `[aᵢ, aᵢ₊₁)`.

The bounds are kept exactly as they are given, whatever the scale: they need not lie on
the step. A value that is within them is scaled to the step and rounded; a value that is
not is refused, even if it would round to an integer that a value within them gives.

**The order.** A class with its bounds and its step holds a number of distinct values,
`(max − min) / step`, as integers of a fixed size do. An unsigned byte holds 256 values:
with the rounding, its bounds are `[−0.5, 255.5)` at the step 1, every `x` of that
interval rounds to one of the integers from 0 to 255, and 255.5, which would round to 256,
is excluded. The values need not be integers: with a positive scale they are fractions,
and they count the same.

The constant `order` is a limit on that number, and it is inherited: a class that declares
it passes it to every class made from it, and each of them must hold at most `order`
values, else a `RangeError` when it is made. `BoundedInt` declares the order `ℓ`, so no
class made from it holds more than `ℓ` integers. `define` takes no `order`: the order of
every class it makes is `ℓ`, inherited.

```ts
const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 }); // 256 values, order ℓ
const Percent = Byte.define({ name: "Percent", min: -0.5, max: 100.5 }); // order ℓ too
BoundedInt.define({ name: "Full", min: 0n, max: ℓ }); // RangeError: ℓ + 1 values
BoundedInt.define({ name: "Word", min: -0.5, max: 65535.5, order: 65536n }); // TypeError
```

`{ min: 0n, max: ℓ }` holds `ℓ + 1` integers. `max` is excluded, but the values just below
it, such as `ℓ − 0.1`, round to `ℓ`. The buckets of `BoundedInt`, `[−0.5, ℓ − 0.5)`, hold
exactly `ℓ` integers: every value of `[i − 0.5, i + 0.5)` rounds to `i`.

A class written by hand may still declare an `order` of its own, such as
`static override order = 256n`. Nothing prevents it, and it is checked like any other
constant. A consumer that expects the order `ℓ` may refuse such a class.

The constants of a class made by `define` are checked when it is made. A class written
by hand, `class Days extends BoundedInt { static override min = 0n; static override max =
365251n }`, is checked at its first use, once. Each constant it declares overrides that of
`BoundedInt`, so TypeScript requires `override` under `noImplicitOverride`:

| Constants                                                      | Error        |
| -------------------------------------------------------------- | ------------ |
| `min` without `max`, or `max` without `min`                    | `TypeError`  |
| `min`, `max` or `error` not a quantity, `scale` not a `number` | `TypeError`  |
| `order` not a `bigint`                                         | `TypeError`  |
| `min ≥ max`                                                    | `RangeError` |
| `scale` not an integer from `−308` to `323`                    | `RangeError` |
| `order` not above 0, or more distinct values than `order`      | `RangeError` |
| `error` below 0                                                | `RangeError` |

The constants are `static readonly`: TypeScript refuses to assign them, and a class made by
`define` is frozen. A class written by hand is checked once, at its first use, and its
constants are read then: changing one afterwards, against TypeScript, has no effect.

### from

`from(x)` takes the value `x`, a quantity, and makes an instance of the class it is called
on:

1. **Type.** A `number` is a `TypeError` on a class whose values need more than 15
   significant digits: the larger of `|min|` and `|max|`, in steps and rounded up, is
   `10^15` or more. Pass a `bigint` or a decimal there.
2. **Bounds.** `x` must satisfy `min ≤ x < max`, exactly, **before any rounding**.
3. **Scaling.** `x` is multiplied by `10^k` exactly, and rounded to the nearest integer,
   ties to even (see [Rounding](#rounding)). This is the only rounding of `from`.

| `x`                                                                     | Result                           |
| ----------------------------------------------------------------------- | -------------------------------- |
| a quantity in `[min, max)`                                              | a new instance                   |
| a `number`, on a class whose values need more than 15 digits            | `TypeError`: more than 15 digits |
| `NaN`, `Infinity`, `-Infinity`                                          | `TypeError`: not a finite number |
| anything else: a string, `null`, `undefined`, an object, a `BoundedInt` | `TypeError`                      |
| a quantity outside `[min, max)`                                         | `RangeError`                     |

**Why 15 digits.** A `number` holds 15 significant digits reliably, and its conversion
keeps 15. A class whose values need 16 digits or more would take a value whose last digits
were never known, and the default error of half a step would overstate its accuracy by far:
at the scale 16, `1.00499999999999989…`, the exact value of the `number` written `1.005`,
would give `10049999999999999` where `10050000000000000` was meant. A second rounding would
not repair this, so such a class refuses the `number`. A value known less accurately
belongs to a class of fewer values, scaled accordingly.

On `BoundedInt`, with a scale of 0 and the bounds `[−0.5, ℓ − 0.5)`, the values need 76
digits: `BoundedInt` keeps a `bigint` exactly, and refuses a `number` with a `TypeError`.
`from(5)` is a `TypeError`, and `from(5n)` is `5n`. `from([15n, -1])`, 1.5, is `2n`: a
value finer than the step is rounded to it, ties to even. Outside its bounds, it throws a
`RangeError`, as every class does: `from(-1n)` and `from([10n * ℓ - 5n, -1])`, `ℓ − 0.5`,
are refused. A class of a narrower range made from it, such as `Mass`, takes a `number`.

A `BoundedInt` is refused: a caller that has one already has its `value`.

### fromValue

`fromValue(q)` takes the **integer** `q`, a `bigint`, as it is: the integer, not the
value. On a scaled class the two differ: `Mass.from(5n)` is 5 kg, `50n`, while
`Mass.fromValue(5n)` is 0.5 kg. `q` must be an integer that a value of `[min, max)` rounds
to.

| `q`                                     | Result         |
| --------------------------------------- | -------------- |
| an integer of the class                 | a new instance |
| `q` not a `bigint`, a `number` included | `TypeError`    |
| an integer no value of the class gives  | `RangeError`   |

### The errors of a class

A class carries the accuracy of its values, `error`, in the unit of the values: the unit in
which `from` takes `x` and `define` takes the bounds, the kilogram for `Mass`, not steps of
the class. It is a class constant like its scale, set when the class is made, never by a
value. It is half a step when it is left
out, the error of the rounding. It describes how the values of the class are obtained: a
clock that reads exactly 12 is no more accurate than when it reads 12.3.

The three getters report it **relative to the full scale**, `max − min`, as a `number`:
an error in absolute terms only means something next to the size of the range.

- **`errorBound`** is a guaranteed bound: the true value is within
  `errorBound · (max − min)` of `D(q)`.
- **`quadraticError`** combines independent errors; for the values of one class, it is
  the bound.
- **`termError`** is the error of the least accurate term; for the values of one class,
  it is the bound. It decides which digits carry meaning.

`termError ≤ quadraticError ≤ errorBound` always holds.

### valueOf, toString and toLocaleString

The three write the same decimal: `D(q)`, without the digits that the error makes
meaningless.

1. **The position.** With the error `ε` in steps, `j` is the largest integer `j ≥ 1` with
   `10^j ≤ 2ε`, or 0 when there is none. Rounding at `10^j` moves the value by at most
   `½ · 10^j ≤ ε` steps: it never adds more error than there is.
2. **The rounding.** `n` is `q / 10^j`, rounded to the nearest integer, ties to even, in
   `bigint`s. With `j = 0`, `n` is `q`. The decimal shown is `n · 10^(j−k)`, with
   `k − j` decimals.

With the default error of `½`, `j` is 0: the decimal is `D(q)`.

- **`toString()`** writes that decimal exactly, digit by digit from the `bigint`, with a
  point: the locale-independent form of JavaScript, which a program can read back.
  `Mass.from(2)` gives `"2.0"`: the tenth of a kilogram carries meaning. On `BoundedInt`,
  `from(10n ** 21n).toString()` is `"1000000000000000000000"`.
- **`toLocaleString(locales?, options?)`** writes the same digits, exactly, in the form of
  a locale, through `Intl.NumberFormat`, which formats a decimal string without converting
  it to a `number`: `"1234.50"` is `"1,234.50"` in `en-US` and `"1 234,50"` in `fr-FR`.
  `options` may set anything but the number of decimals; `Intl.NumberFormat` refuses more
  than 100 decimals with a `RangeError`.
- **`valueOf()`** is an ordinary method: it returns the `number` nearest to that decimal,
  read from its exact string `` `${n}e${j − k}` ``, which JavaScript rounds correctly at
  any size. Where it would be `±Infinity`, it throws a `RangeError`: the precision may be
  lost, never the order of magnitude. On `BoundedInt`, `2n ** 53n + 1n` gives `2 ** 53`.

None of the three goes through another: a subclass that overrides one changes only that
one.

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

`JSON.stringify(x)` gives `{}`: the class serializes nothing.

## Classes

### define

`BoundedInt.define({ name, min, max, step?, error? })` makes a frozen subclass of the
class it is called on:

- `name` is the name of the class, a non-empty string, used in the messages;
- `min` and `max` are the bounds `[min, max)`, quantities, with `min < max`; the class
  keeps them as they are given, and compares the values with them exactly;
- `step` is the accuracy, a quantity above 0. The scale `k` is the smallest integer, from
  `−308` to `323`, with `10^-k ≤ step`, compared exactly: a step of `0.1` gives `k = 1`, a
  step of `0.025` gives `k = 2`, a step of 1000 gives `k = −3`. Without `step`, `k = 0`;
- `error` is the accuracy of the values, in the unit of the values (the unit of `min` and
  `max`), a quantity, 0 or more; half a step when it is left out;
- `order` is not taken. The class inherits the order `ℓ` of `BoundedInt` (see
  [the range of a class](#the-range-of-a-class)), and its subclasses inherit it from it, along
  with this `define`. An `order` in `spec` is a `TypeError`.

| `spec`                                                          | Error        |
| --------------------------------------------------------------- | ------------ |
| `name` not a non-empty string; a quantity of another type       | `TypeError`  |
| `order` given                                                   | `TypeError`  |
| `min ≥ max`; `step` not above 0                                 | `RangeError` |
| a `step` below `10^-323`                                        | `RangeError` |
| `error` below 0; more distinct values than `order`, that is `ℓ` | `RangeError` |

## Rounding

**One rounding, ties to even.** `from` rounds once: the exact value of `x · 10^k` to the
nearest integer. A tie, an exact half, goes to the even integer. Rounding is symmetric:
`from(-x).value` is `-from(x).value`.

A tie needs `x · 10^k` to be exactly a half, as for `0.125` with `k = 2`: it gives 12.
The `number` written `1.005` is the decimal 1.005, at 15 digits: a tie at `k = 2`, which
gives `100`.

**Why integers and powers of ten.** The base of a representation decides which numbers
are finite decimals in it: in base 2, the base of the `number` type, 0.3 is not. Every
number of base 2 is a decimal of base 10, not the converse. Rational numbers can be held
as fractions, but a decimal can be held as a single number: an integer and a power of
ten. A class counts its values in steps of `10^-k`, so that `D(q)` is a decimal, exact,
and the rounding to the step is the only one.

**What is guaranteed**, with the default error of `½`:

- **R1.** `valueOf()` is the `number` nearest to the decimal `D(q)`, and `toString()`
  writes `D(q)` exactly: `Mass.fromValue(23n)` gives `2.3` and `"2.3"`.
- **R2.** For every decimal `x` written with at most `k` decimals (or a multiple of
  `10^-k` when `k ≤ 0`), within the bounds, `from([n, e]).toString()` writes `x`, and
  `D(from(x).value)` is `x`.
- **R3.** For every instance `y` whose `number` is within the bounds,
  `from(y.valueOf()).value === y.value`, when `D(q)` has at most 15 significant digits.
- **R4.** For every `x` within the bounds, `D(from(x).value)` is within half a step of
  `x`.

## Examples

The classes:

```ts
const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 }); // 0 to 1000, k = 1
const Reading = BoundedInt.define({ name: "Reading", min: -7.99, max: 15.995, step: 0.01 }); // −799 to 1599, k = 2
const Volume = BoundedInt.define({ name: "Volume", min: 0, max: 1000500, step: 1000 }); // 0 to 1000, k = −3
const DayCount = BoundedInt.define({ name: "DayCount", min: -0.5, max: 365250.5 }); // 0 to 365250, k = 0
const Rough = BoundedInt.define({ name: "Rough", min: 0, max: 100.05, step: 0.1, error: 0.5 }); // as Mass, known to 0.5 kg
```

| Call                     | `value`      | `valueOf()` | `toString()` |
| ------------------------ | ------------ | ----------- | ------------ |
| `Mass.from(2.3)`         | `23n`        | 2.3         | `"2.3"`      |
| `Mass.from(2)`           | `20n`        | 2           | `"2.0"`      |
| `Mass.from(5n)`          | `50n`        | 5           | `"5.0"`      |
| `Mass.from(100.04)`      | `1000n`      | 100         | `"100.0"`    |
| `Mass.from(100.05)`      | `RangeError` |             |              |
| `Mass.from(-0.04)`       | `RangeError` |             |              |
| `Mass.fromValue(5n)`     | `5n`         | 0.5         | `"0.5"`      |
| `Mass.fromValue(1001n)`  | `RangeError` |             |              |
| `Reading.from(12.76362)` | `1276n`      | 12.76       | `"12.76"`    |
| `Reading.from(0.125)`    | `12n`        | 0.12        | `"0.12"`     |
| `Reading.from(-0.125)`   | `-12n`       | -0.12       | `"-0.12"`    |
| `Reading.from(1.005)`    | `100n`       | 1           | `"1.00"`     |
| `Reading.from(16)`       | `RangeError` |             |              |
| `Volume.from(1500)`      | `2n`         | 2000        | `"2000"`     |
| `Volume.from(2500)`      | `2n`         | 2000        | `"2000"`     |
| `Volume.from(3500)`      | `4n`         | 4000        | `"4000"`     |
| `DayCount.from(20000)`   | `20000n`     | 20000       | `"20000"`    |
| `Rough.from(2.3)`        | `23n`        | 2           | `"2"`        |
| `Rough.from(4.5)`        | `45n`        | 4           | `"4"`        |

`Rough` is known to half a kilogram: its error is 5 steps of 0.1 kg, so its values show
the kilogram. In `Rough.from(4.5)`, 4.5 is a tie, and goes to 4.

## Subclasses

`define` makes the subclasses an application needs. A class written by hand declares the
[class constants](#the-class-constants) as static fields, and may override:

- `from` and `fromValue`, to check more than the bounds;
- `valueOf`, `toString` or `toLocaleString`, to convert otherwise, or to write a unit.

Its constructor is `protected`, and its instances are not frozen, so that a subclass can
call it and add fields of its own.

<!--
Change History

| PR  | Summary |
|-----|---------|
| #42 | new: BoundedInt, its casts, conversions and subclasses (#41) |
| #47 | decimal classes: scale, the exact bounds [min, max), order, error; quantities as decimals, numbers at 15 digits; from, fromValue, define; valueOf, toString, toLocaleString, rounding (#44) |
-->
