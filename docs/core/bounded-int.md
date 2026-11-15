# Bounded integers

A `bigint` cannot carry bounds: it is a primitive, with no own property, and
`BigInt.prototype` is shared by the whole program. So the library wraps the integer in a
class of bounded integers, and the class carries the bounds.

A class of bounded integers holds a quantity. Its **scale**, a power of ten, turns a value
into an integer, and its **bounds**, `[min, max)`, delimit the values it accepts. Both are
class-level constants, the same for every instance. A class also carries the **errors** of
its values, which decide the digits they show.

The page has three parts:

- [For users](#for-users): what the high-level entry point, `@criticaloptimisation/vc-proofs`,
  exports from this page;
- [For developers](#for-developers): what the low-level entry point,
  `@criticaloptimisation/vc-proofs/core`, exports from this page;
- [For Maintainers](#for-maintainers): the rest, which only the modules of the library see.

## For users

The high-level entry point, `@criticaloptimisation/vc-proofs`, exports nothing from this page
yet: it is a placeholder, whose functions are fixed by the issues of the issuer, the wallet
and the verifier. A developer who builds on the primitives reads
[For developers](#for-developers).

## For developers

The low-level entry point, `@criticaloptimisation/vc-proofs/core`, exports the types
`Decimal` and `Quantity`, and the constant `NO_ERROR_PROCESSING`. It does not export a class
of bounded integers: a blinding context gives one, `context.boundedInt`, from which every
class of values is made with [`define`](#define) (see
[The BoundedInt of the entry point](#the-boundedint-of-the-entry-point)). Every member that
this part documents is a member of that class and of every class made from it. In the
examples, `Int` is that class:

```ts
const Int = context.boundedInt; // the class of a blinding context

const Mass = Int.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 }); // in kg
Mass.scale; // 1: the integer counts tenths of a kilogram

const m = Mass.from(2.3);
m.value; // 23n: the integer, a bigint
m.valueOf(); // 2.3: the value, a number
`${m}`; // "2.3"
Mass.from(100.04).value; // 1000n: 100.0 kg
Mass.from(100.05); // RangeError: not below Mass.max
Mass.from(1.25).value; // 12n: rounded to the step, ties to even
Mass.from(-1); // RangeError: below Mass.min
m + 1n; // TypeError: no implicit conversion, except to a string
```

### Values and errors

- **Immutable.** No method changes an instance. The classes made by `define` are frozen.
- **No public constructor.** Instances come only from `from` and `fromValue`, on a class
  of bounded integers.
- **An integer, as it is.** The integer keeps its sign and its size. A value outside the
  bounds of its class is refused, never wrapped or clamped.
- **Errors**: `TypeError` for an input of the wrong kind, such as a `number` that is not
  an integer where only integers are accepted, or a constant of the wrong type;
  `RangeError` for a value outside the bounds of its class, an invalid set of constants,
  or a value too large for `valueOf()` to return as a finite `number`. The messages name
  the method and the class it was called on.

### BoundedInt

The members of every class of bounded integers:

| Member                               | Returns                                                            | Errors                               |
| ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------ |
| `static from(x)`                     | a new instance holding the value `x`, scaled                       | see [from](#from)                    |
| `static fromValue(q)`                | a new instance holding the integer `q`, as it is                   | see [fromValue](#fromvalue)          |
| `static define(spec)`                | a new subclass                                                     | see [define](#define)                |
| `static low`                         | the lowest integer of the class, a `bigint`                        | as the constants                     |
| `static high`                        | the highest integer of the class, a `bigint`                       | as the constants                     |
| `static errorBound`                  | the bound of the error, relative to `max − min`, or `undefined`    | as the constants                     |
| `static quadraticError`              | the quadratic error, relative to `max − min`, or `undefined`       | as the constants                     |
| `static termError`                   | the error of the least accurate term, relative, or `undefined`     | as the constants                     |
| `value`                              | the integer, a `bigint`                                            | none                                 |
| `valueOf()`                          | the value, the nearest `number`, without its meaningless digits    | `RangeError` where it is `±Infinity` |
| `toString()`                         | the exact decimal of the value, with the digits that carry meaning | none                                 |
| `toLocaleString(locales?, options?)` | the digits of `toString()`, in the form of a locale                | `RangeError` beyond 100 decimals     |
| `[Symbol.toPrimitive](hint)`         | `toString()` for the hint `"string"`                               | `TypeError` for any other hint       |

Every static member works on the class it is called on: `Mass.from(2.3)` is a `Mass`,
checked against the bounds of `Mass`, and a subclass that does not override `from` gets
instances of its own.

#### Quantities

Every quantity a class takes, a value, a bound, a step or an error, is one of:

- a `bigint`, an integer;
- a finite `number`;
- an exact decimal `[n, e]`, a `bigint` `n` and an integer `e`, worth `n · 10^e`:
  `[23n, -1]` is 2.3. The type `Decimal` names it, and the type `Quantity` names the three.

It is converted at once to an exact decimal. A `bigint` and a decimal are kept exactly,
with every digit. A `number` is a binary fraction, and every binary fraction is a
decimal, but the converse does not hold: 0.3 is a finite decimal in base 10, but an
endless one in base 2 (`0.0100110011…`). The `number` written `0.3` is exactly
`0.299999999999999988897769753748434595763683319091796875`, but a `number` holds only
15 significant digits reliably: it cannot tell that value apart from the decimals around
it, 0.3 among them. So the conversion keeps 15 digits, rounded once, and the `number`
`0.3` is the decimal 0.3, as its writer meant (see
[The conversion of a number](#the-conversion-of-a-number)). A bound and a value written as
the same `number` are the same decimal, and a decimal between 0.1 and the binary value of
the `number` 0.1 is above the bound `max: 0.1`, as its writer meant.

A class whose values need more than 15 digits takes no `number` (see [from](#from)).

#### The class constants

A class is described by its constants, which every member reads from the class of the
call (`this` in a static member, `this.constructor` in an instance member):

| Constant | Meaning                                                                            |
| -------- | ---------------------------------------------------------------------------------- |
| `scale`  | the integer `k` of the factor `10^k`: the step of the class is `10^-k`             |
| `min`    | the lowest value, included, a quantity                                             |
| `max`    | the value just above the highest, excluded, a quantity                             |
| `error`  | the three errors of the values, `{ bound, quadraticSquared, term }`, in their unit |

- **The scale is a power of ten.** `k` is an integer from `−308` to `323`: the powers of
  ten whose step `10^-k` a `number` can write, from `10^308` down to `10^-323`. A step of
  `0.01` is `k = 2`, a step of 1000 is `k = −3`. The integer of a value `x` counts steps:
  `q = x · 10^k`, rounded. The decimal that `q` stands for is `D(q) = q · 10^-k`.
  A class that declares none of the constants inherits those of its base, except `error`:
  a class never takes the errors of its parent (see
  [The errors of a class](#the-errors-of-a-class)). A class that declares one bound must
  declare both.

##### The range of a class

The bounds are **semi-open**: a value `x` is accepted when `min ≤ x < max`, compared
exactly, as decimals, before any rounding; `x = max` is a `RangeError`. When an interval is
split at an ascending series of points `a₀ < a₁ < … < aₙ`, every `x` of `[a₀, aₙ)` then lies
in exactly one of the intervals `[aᵢ, aᵢ₊₁)`.

The bounds are kept exactly as they are given, whatever the scale: they need not lie on
the step. A value that is within them is scaled to the step and rounded; a value that is
not is refused, even if it would round to an integer that a value within them gives.

**The integers of a class.** The values of `[min, max)`, scaled and rounded, give the
integers from `low` to `high`, both included. `low` is the integer `min` rounds to, and
`high` the integer the values just below `max` round to. The static getters `low` and
`high` give them, as `bigint`s: `0n` and `1000n` on `Mass`.

**The number of values.** A class holds `high − low + 1` distinct values, as integers of a
fixed size do. An unsigned byte holds 256 values: with the rounding, its bounds are
`[−0.5, 255.5)` at the step 1, every `x` of that interval rounds to one of the integers
from 0 to 255, and 255.5, which would round to 256, is excluded. The values need not be
integers: with a positive scale they are fractions, and they count the same.

A class holds no more values than its parent, the class it extends, else a `RangeError`.
Only the number of values is compared: the range of a class may lie within that of its
parent, overlap it or lie outside it, at the same step or at another. The rule holds from
parent to child, so a class holds no more values than any of its ancestors, and no more
than `context.boundedInt`. So an application can root families of classes of its own:

```ts
const Byte = Int.define({ name: "Byte", min: -0.5, max: 255.5 }); // 0 to 255: 256 values
const Percent = Byte.define({ name: "Percent", min: -0.5, max: 100.5 }); // 0 to 100: 101 values
const Code = Byte.define({ name: "Code", min: 999.5, max: 1255.5 }); // 1000 to 1255: 256 values
const Cents = Byte.define({ name: "Cents", min: 0, max: 2.555, step: 0.01 }); // 0 to 255, k = 2: 256 values
Byte.define({ name: "Word", min: -0.5, max: 65535.5 }); // RangeError: 65536 values, more than Byte
```

The constants of a class made by `define` are checked when it is made. A class written
by hand, `class Days extends Int { static override min = 0n; static override max =
365251n }`, is checked at its first use, once; its parent is checked first. Each constant
it declares overrides that of its parent, so TypeScript requires `override` under
`noImplicitOverride`:

| Constants                                                                                     | Error        |
| --------------------------------------------------------------------------------------------- | ------------ |
| `min` without `max`, or `max` without `min`                                                   | `TypeError`  |
| `min` or `max` not a quantity, `scale` not a `number`                                         | `TypeError`  |
| `error` not an object `{ bound?, quadratic?, quadraticSquared?, term? }`, a quantity included | `TypeError`  |
| `error` an object with a key that is not a quantity                                           | `TypeError`  |
| `min ≥ max`                                                                                   | `RangeError` |
| `scale` not an integer from `−308` to `323`                                                   | `RangeError` |
| more values than its parent                                                                   | `RangeError` |
| an error below 0, or errors that break [the rules](#the-rules)                                | `RangeError` |

The constants are `static readonly`: TypeScript refuses to assign them, and a class made by
`define` is frozen. A class written by hand is checked once, at its first use, and its
constants are read then: changing one afterwards, against TypeScript, has no effect.

#### from

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

A class of the integers `[0, 2^252)`, written by hand or made by `define`, needs 76 digits:
it keeps a `bigint` exactly, and refuses a `number` with a `TypeError`.

A `BoundedInt` is refused: a caller that has one already has its `value`.

#### fromValue

`fromValue(q)` takes the **integer** `q`, a `bigint`, as it is: the integer, not the
value. On a scaled class the two differ: `Mass.from(5n)` is 5 kg, `50n`, while
`Mass.fromValue(5n)` is 0.5 kg. `q` must be an integer that a value of `[min, max)` rounds
to.

| `q`                                     | Result         |
| --------------------------------------- | -------------- |
| an integer of the class                 | a new instance |
| `q` not a `bigint`, a `number` included | `TypeError`    |
| an integer no value of the class gives  | `RangeError`   |

#### The errors of a class

A class carries the accuracy of its values as three errors, in the unit of the values: the
unit in which `from` takes `x` and `define` takes the bounds, the kilogram for `Mass`, not
steps of the class. They are class constants like its scale, set when the class is made,
never by a value. They describe how the values of the class are obtained: a clock that
reads exactly 12 is no more accurate than when it reads 12.3.

- **`bound`** is a guaranteed bound: the true value is within `bound` of `D(q)`.
- **`quadratic`** combines independent errors, as the square root of the sum of their
  squares. The class keeps its square, **`quadraticSquared`**, the sum of the squares
  itself: a sum of squares of decimals is a decimal, its root seldom is.
- **`term`** is the error of the least accurate term. It decides which digits carry
  meaning (see [valueOf, toString and toLocaleString](#valueof-tostring-and-tolocalestring)).

For the values of one class, measured or rounded once, the three are equal. A class whose
values are made from several terms has three different errors.

An error may be `undefined`: one the class does not know. A normal distribution, for
instance, has a quadratic error but no bound.

##### Given to define

`define` takes the errors as `error`, in one of three forms:

- **left out**: each of the three is half a step of the class, `½ · 10^-k`, the error of
  the rounding, and `quadraticSquared` is its square, `¼ · 10^-2k`;
- **a quantity**, 0 or more: the three are equal to it, and `quadraticSquared` is its
  square;
- **an object** `{ bound?, quadratic?, quadraticSquared?, term? }` of quantities: each
  error given is kept, and the others are `undefined`, unless [the rules](#the-rules) fill
  them in. `quadratic` is the error itself, which `define` squares; `quadraticSquared` is
  its square, as a sum of squares gives it, kept as it is. When both are given, the square
  of `quadratic` must equal `quadraticSquared`, exactly, else a `RangeError`. A key left out
  and a key set to `undefined` mean the same thing. Any other key is ignored. An array is
  not this form: it is a decimal `[n, e]`, a quantity.

`{}` leaves the three `undefined`: the class has no error, and its values show every
digit. This disables what is computed from the errors. `./core` exports a name for it,
`NO_ERROR_PROCESSING`, a frozen object of three `undefined` errors, which `define` takes as
it takes `{}`:

```ts
import { NO_ERROR_PROCESSING } from "@criticaloptimisation/vc-proofs/core";

const Raw = Int.define({ name: "Raw", min: 0, max: 100.05, step: 0.1, error: NO_ERROR_PROCESSING });
Raw.errorBound; // undefined, as quadraticError and termError
Raw.fromValue(123n).toString(); // "12.3": every digit
```

The name says what the constant does: it switches off the processing of the errors. It
does not say that the values are exact: a count, exact by construction, has errors of 0,
which is another class.

##### The rules

The errors given are compared exactly. A broken rule is a `RangeError`.

- `0 ≤ term² ≤ quadraticSquared ≤ bound²`, and `term ≤ bound`, between any two that are
  defined.
- If two are equal, the third is equal to them: when it is defined it must be, and when
  it is `undefined` it takes their value. Two equal errors mean a single term, and the
  three errors of a single term are equal. `bound² = quadraticSquared` gives `term = bound`;
  `quadraticSquared = term²` gives `bound = term`; `bound = term` gives
  `quadraticSquared = bound²`.
- Otherwise, an `undefined` error stays `undefined`: with one error given, the other two
  stay `undefined`.

| `error`, for a class of scale `k`            | `bound`        | `quadraticSquared` | `term`         |
| -------------------------------------------- | -------------- | ------------------ | -------------- |
| left out                                     | `[5n, −1 − k]` | `[25n, −2 − 2k]`   | `[5n, −1 − k]` |
| `0.5`                                        | `0.5`          | `0.25`             | `0.5`          |
| `{}`                                         | `undefined`    | `undefined`        | `undefined`    |
| `NO_ERROR_PROCESSING`                        | `undefined`    | `undefined`        | `undefined`    |
| `{ bound: 1 }`                               | `1`            | `undefined`        | `undefined`    |
| `{ quadratic: 0.8 }`                         | `undefined`    | `0.64`             | `undefined`    |
| `{ quadraticSquared: 0.64 }`                 | `undefined`    | `0.64`             | `undefined`    |
| `{ quadratic: 0.8, quadraticSquared: 0.64 }` | `undefined`    | `0.64`             | `undefined`    |
| `{ bound: 1, quadratic: 1 }`                 | `1`            | `1`                | `1`            |
| `{ quadratic: 0.8, term: 0.8 }`              | `0.8`          | `0.64`             | `0.8`          |
| `{ bound: 1, term: 0.5 }`                    | `1`            | `undefined`        | `0.5`          |
| `{ bound: 3, quadratic: 2, term: 1 }`        | `3`            | `4`                | `1`            |
| `{ bound: 3, quadraticSquared: 2, term: 1 }` | `3`            | `2`                | `1`            |
| `{ bound: 1, quadratic: 1, term: 0.5 }`      | `RangeError`   |                    |                |
| `{ bound: 1, quadratic: 0.5, term: 0.5 }`    | `RangeError`   |                    |                |
| `{ bound: 1, term: 2 }`                      | `RangeError`   |                    |                |
| `{ bound: 1, quadraticSquared: 2 }`          | `RangeError`   |                    |                |
| `{ quadratic: 0.8, quadraticSquared: 0.6 }`  | `RangeError`   |                    |                |
| `{ term: -1 }`                               | `RangeError`   |                    |                |
| `{ quadratic: -1 }`                          | `RangeError`   |                    |                |
| `{ quadraticSquared: -1 }`                   | `RangeError`   |                    |                |

A negative `quadratic` is refused, as any error below 0. The messages name the key that
was given: `error.quadratic` when `quadratic` was given, `error.quadraticSquared` when
only `quadraticSquared` was, and `error` for a single quantity.

A class never takes the errors of its parent: the scale may differ, and half a step of
the parent is not half a step of the class. A class that declares no `error` of its own
has half its own step. A class written by hand declares `error` as an object of errors,
`{ bound?, quadratic?, quadraticSquared?, term? }`, never as a bare quantity: the constant
of every class labels each of its errors, and only `define` takes the shorthand of a
quantity. It goes through the same rules, at the first use of the class:
`static override error = { bound: 0.25, quadratic: 0.25 }` gives three errors of 0.25.

##### The getters

`errorBound`, `quadraticError` and `termError` give `bound`, the root of
`quadraticSquared`, and `term` **relative to the full scale**, `max − min`, as a `number`:
an error in absolute terms only means something next to the size of the range. Each is
`undefined` where its error is.

- **`errorBound`**: the true value is within `errorBound · (max − min)` of `D(q)`.
- **`quadraticError`**: the quadratic error, relative, `√quadraticSquared / (max − min)`.
  When `quadraticSquared` is the square of `bound` or of `term`, it is `errorBound` or
  `termError` itself.
- **`termError`**: the error of the least accurate term, relative.

Each is the `number` nearest to its exact ratio, the root included, whatever the number of
digits of the errors and of the bounds. Among those that are defined,
`termError ≤ quadraticError ≤ errorBound` always holds.

#### valueOf, toString and toLocaleString

The three write the same decimal: `D(q)`, without the digits that the error makes
meaningless.

1. **The position.** The error `ε` is the first defined of `term`, `quadratic` and
   `bound`, in steps; `quadratic` is the root of `quadraticSquared`. `j` is the largest
   integer `j ≥ 1` with `10^j ≤ 2ε`, or 0 when there is none. Rounding at `10^j` moves the
   value by at most `½ · 10^j ≤ ε` steps: it never adds more error than there is. When the
   three errors are `undefined`, `j` is 0: every digit is shown.
2. **The rounding.** `n` is `q / 10^j`, rounded to the nearest integer, ties to even, in
   `bigint`s. With `j = 0`, `n` is `q`. The decimal shown is `n · 10^(j−k)`, with
   `k − j` decimals.

With the default error of `½`, `j` is 0: the decimal is `D(q)`. With a class of the step
0.1, `Kilo = Int.define({ name: "Kilo", min: 0, max: 100.05, step: 0.1, error })`, the
value 12.34 is the integer `123n`, and shows:

| `error`                                              | `ε`, in steps   | `j` | `Kilo.from(12.34).toString()` |
| ---------------------------------------------------- | --------------- | --- | ----------------------------- |
| `{ quadratic: 0.5 }`                                 | 5               | 1   | `"12"`                        |
| `{ quadratic: 0.49 }`                                | 4.9             | 0   | `"12.3"`                      |
| `{ quadraticSquared: [24999999999999999999n, -20] }` | just below 5    | 0   | `"12.3"`                      |
| `{ quadraticSquared: [25000000000000000001n, -20] }` | just above 5    | 1   | `"12"`                        |
| `{ term: [4999999999999999999n, -19] }`              | just below 5    | 0   | `"12.3"`                      |
| `{ term: [5000000000000000001n, -19] }`              | just above 5    | 1   | `"12"`                        |
| `{ bound: 3, quadratic: 0.5, term: 0.05 }`           | 0.5, the `term` | 0   | `"12.3"`                      |

- **`toString()`** writes that decimal exactly, digit by digit from the `bigint`, with a
  point: the locale-independent form of JavaScript, which a program can read back.
  `Mass.from(2)` gives `"2.0"`: the tenth of a kilogram carries meaning.
  `Int.from(10n ** 21n).toString()` is `"1000000000000000000000"`.
- **`toLocaleString(locales?, options?)`** writes the same digits, exactly, in the form of
  a locale, through `Intl.NumberFormat`: `"1234.50"` is `"1,234.50"` in `en-US` and
  `"1 234,50"` in `fr-FR`.
  `options` may set anything but the number of decimals; `Intl.NumberFormat` refuses more
  than 100 decimals with a `RangeError`.
- **`valueOf()`** is an ordinary method: it returns the `number` nearest to that decimal,
  at any size. Where it would be `±Infinity`, it throws a `RangeError`: the precision may
  be lost, never the order of magnitude. `Int.fromValue(2n ** 53n + 1n).valueOf()` is
  `2 ** 53`.

None of the three goes through another: a subclass that overrides one changes only that
one.

#### Conversions

JavaScript converts an object implicitly through its `[Symbol.toPrimitive]` method. That of
a bounded integer converts to a string only:

- for the hint `"string"` (a template literal, `String(x)`), it returns `x.toString()`;
- for any other hint it throws a `TypeError` whose message asks to call `x.valueOf()`
  for the `number`, or to read `x.value` for the `bigint`.

So `x + 1n`, `"x = " + x`, `x < 5n`, `x * 2n`, `Number(x)` and `Math.abs(x)` all throw.
JavaScript never calls `valueOf()` implicitly.

`JSON.stringify(x)` gives `{}`: the class serializes nothing.

### define

`Int.define({ name, min, max, step?, error? })` makes a frozen subclass of the class it is
called on, its parent, and is typed as that class:

- `name` is the name of the class, a non-empty string, used in the messages;
- `min` and `max` are the bounds `[min, max)`, quantities, with `min < max`; the class
  keeps them as they are given, and compares the values with them exactly;
- `step` is the accuracy, a quantity above 0. The scale `k` is the smallest integer with
  `10^-k ≤ step`, computed at once, with no search: for `step = [n, e]`, with `digits(n)`
  the number of decimal digits of `n`, `10^(digits(n) + e − 1) ≤ step < 10^(digits(n) + e)`,
  so `k = 1 − digits(n) − e`. A step of `0.1` gives `k = 1`, a step of `0.025` gives
  `k = 2`, a step of 1000 gives `k = −3`, and a light-year in metres, `[9461n, 12]`, gives
  `k = −15`. `k` must lie from `−308` to `323` (see [The class constants](#the-class-constants)):
  a step of `10^309` or more, or below `10^-323`, is a `RangeError`. It is never brought
  back to the nearest limit: the scale would not match the step, and neither would the
  default error, half a step. `digits(n)` writes `n` in decimal, once per call of `define`:
  a cost to watch where `define` runs often. Without `step`, `k = 0`;
- `error` is the accuracy of the values, in the unit of the values (the unit of `min` and
  `max`): left out, a quantity 0 or more, `NO_ERROR_PROCESSING`, or an object
  `{ bound?, quadratic?, quadraticSquared?, term? }` (see [Given to define](#given-to-define));
  half a step when it is left out.

Any other key of `spec` is ignored. The new class holds no more values than its parent
(see [The range of a class](#the-range-of-a-class)).

| `spec`                                                         | Error        |
| -------------------------------------------------------------- | ------------ |
| `name` not a non-empty string; a quantity of another type      | `TypeError`  |
| `error` neither a quantity nor an object of quantities         | `TypeError`  |
| `min ≥ max`; `step` not above 0                                | `RangeError` |
| a `step` below `10^-323`, or of `10^309` or more               | `RangeError` |
| an error below 0, or errors that break [the rules](#the-rules) | `RangeError` |
| more values than its parent                                    | `RangeError` |

### Rounding

**One rounding, ties to even.** `from` rounds once: the exact value of `x · 10^k` to the
nearest integer. A tie, an exact half, goes to the even integer. Rounding is symmetric:
`from(-x).value` is `-from(x).value`.

A tie needs `x · 10^k` to be exactly a half, as for `0.125` with `k = 2`: it gives 12.
The `number` written `1.005` is the decimal 1.005, at 15 digits: a tie at `k = 2`, which
gives `100`.

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

### Examples

The classes:

```ts
const Mass = Int.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 }); // 0 to 1000, k = 1
const Reading = Int.define({ name: "Reading", min: -7.99, max: 15.995, step: 0.01 }); // −799 to 1599, k = 2
const Volume = Int.define({ name: "Volume", min: 0, max: 1000500, step: 1000 }); // 0 to 1000, k = −3
const DayCount = Int.define({ name: "DayCount", min: -0.5, max: 365250.5 }); // 0 to 365250, k = 0
const Rough = Int.define({ name: "Rough", min: 0, max: 100.05, step: 0.1, error: 0.5 }); // as Mass, known to 0.5 kg
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

### Subclasses

`define` makes the subclasses an application needs. A class written by hand declares the
[class constants](#the-class-constants) as static fields, and may override:

- `from` and `fromValue`, to check more than the bounds;
- `valueOf`, `toString` or `toLocaleString`, to convert otherwise, or to write a unit.

Its constructor is `protected`, and its instances are not frozen, so that a subclass can
call it and add fields of its own.

### The BoundedInt of the entry point

`@criticaloptimisation/vc-proofs/core` does not export the class of this page. It gives a
subclass of it instead, specialized for the mathematics of the elliptic curve of the
library: the `boundedInt` of a blinding context. Its bounds are its own, and no class made from
it, by `define` or by hand, holds more values than it does. The specialized class is
documented with the blinding context: see the list of pages of the
[README](../../README.md#documentation).

## For Maintainers

This part documents `src/core/bounded-int.ts` for the modules of the library. Nothing in it
is exported by an entry point, except `NO_ERROR_PROCESSING`, which `./core` re-exports.

### The generic class

`bounded-int.ts` declares the generic class `BoundedInt`, the base of every class of
bounded integers, `context.boundedInt` included. It is not exported: an application makes
its classes from the class of a blinding context, whose bounds fit the arithmetic of the
library. Its constants:

| Constant | On `BoundedInt` |
| -------- | --------------- |
| `scale`  | `0`             |
| `min`    | `0n`            |
| `max`    | `32767.5`       |
| `error`  | absent: ½ step  |

Its bounds `[0, 32767.5)` hold the 15-bit integers from 0 to 32767: `low` and `high` are
`0n` and `32767n`. `COARSEST_SCALE` and `FINEST_SCALE` name the limits of the scale, `−308`
and `323`.

**The exception to the number of values.** A class holds no more values than its parent,
except a class whose parent is `BoundedInt`: it holds as many values as its bounds give,
as `DayCount` of the [examples](#examples) does with 365251 when it is made from
`BoundedInt`. That is how the class of a blinding context, which holds far more than 32768
values, is made from it.

The tests run the examples of this page on the generic class: a class made by `define`
from it behaves as one made from `context.boundedInt`, whenever its parent holds enough
values. On `BoundedInt`, `from(5)` is `5n`, `from(-0)` is `0n`, `from(1.5)` is `2n`, and
`from(-1)` and `from(32767.5)` are refused, as every class refuses a value outside its
bounds. `BoundedInt.from(10n ** 21n)` is refused for the same reason; on a class of wider
bounds it is `"1000000000000000000000"`.

### Kept as decimals

`define` stores the errors as the class constant `error`, a frozen object
`{ bound, quadraticSquared, term }`, each an exact decimal `[n, e]` without trailing zeros,
frozen, or `undefined`, in the unit of the values: `Mass.error.bound` is `[5n, -2]`, 0.05 kg,
and `Mass.error.quadraticSquared` is `[25n, -4]`, its square. No digit is dropped: a
decimal of 40 digits is kept with its 40 digits.

`errors(C)` is the way to read the errors of a class: the constant `error` of a class
written by hand has not been through [the rules](#the-rules), which may fill in an error it
leaves out, and a class that declares none has its own default. A class written by hand
that gives `quadratic` gets `quadraticSquared` from `errors(C)`, never `quadratic`.

`normalizeErrors` checks and fills in the errors on three slots, `B = bound`,
`Q = quadraticSquared` and `T = term`, compared with `compare` and `product`: `T ≤ B`,
`T² ≤ Q` and `Q ≤ B²`. It never takes a root. An object it has already returned,
`NO_ERROR_PROCESSING` included, is returned as it is.

The errors are compared exactly, as decimals: the quadratic error is compared through its
square, and `term` and `bound` are squared to meet it. A negative `quadratic` is refused
before it is squared, since its square would hide the sign.

### The accuracy of the errors

The errors are exact where they are kept and combined, and approximate only where a
`number` or a display needs them:

| Where                                           | Form                                                 | Accuracy                                              |
| ----------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| given to `define` as a `bigint` or a decimal    | a quantity                                           | exact, every digit kept                               |
| given to `define` as a `number`                 | a quantity                                           | 15 significant digits (see [Quantities](#quantities)) |
| kept by the class, the constant `error`         | `bound`, `quadraticSquared`, `term`, frozen decimals | exact, every digit kept; no root taken                |
| the rules                                       | compared on squares                                  | exact                                                 |
| combined by the modules of the library          | sums and products of decimals                        | exact                                                 |
| `errorBound`, `quadraticError`, `termError`     | a `number`, relative to `max − min`                  | the nearest `number`, about 16 digits                 |
| the digits shown by `toString()` and the others | the position of the rounding                         | the position that the exact error gives               |

Only the last two are approximate. Each is computed from the exact decimals, each time,
and neither changes them.

### The conversions and the display

The integer of an instance is held in a private field, read through a getter with no
setter. All the arithmetic is done on `bigint`s, on the exact decimals of the quantities.

`valueOf()` reads its `number` from the exact string `` `${n}e${j − k}` ``, which
JavaScript rounds correctly at any size. `toLocaleString()` goes through
`Intl.NumberFormat`, which formats a decimal string without converting it to a `number`.

The `[Symbol.toPrimitive]` of a bounded integer throws for every hint but `"string"`.
Without it, `x + 1n` would give the string `"[object Object]1"`, and `x < 5n` would give
`false`, with no error: in code that decides a sign, a silent wrong answer is the worst
outcome. Since `[Symbol.toPrimitive]` comes first, JavaScript never calls `valueOf()`
implicitly.

### Integers and powers of ten

The base of a representation decides which numbers
are finite decimals in it: in base 2, the base of the `number` type, 0.3 is not. Every
number of base 2 is a decimal of base 10, not the converse. Rational numbers can be held
as fractions, but a decimal can be held as a single number: an integer and a power of
ten. A class counts its values in steps of `10^-k`, so that `D(q)` is a decimal, exact,
and the rounding to the step is the only one.

### For the other modules of the library

`bounded-int.ts` exports what the other modules of the library need to read quantities and
errors, and to combine errors exactly. `@criticaloptimisation/vc-proofs/core` exports only
the types `Quantity` and `Decimal`, which its signatures name, and `NO_ERROR_PROCESSING`.

| Export                    | What it is                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decimal(x, where, what)` | `x` as an exact decimal `[n, e]`: a `bigint` or a `number` converted as in [Quantities](#quantities), a decimal as it is; else a `TypeError` that names `where` and `what`                        |
| `MANTISSA`, `EXPONENT`    | `0` and `1`: the indices of `n` and `e` in a decimal `[n, e]`                                                                                                                                     |
| `compare(a, b)`           | the sign of `a − b`, `-1`, `0` or `1`, exact, at any length                                                                                                                                       |
| `normalize(d)`            | the same decimal without trailing zeros in its mantissa: `[50n, -2]` is `[5n, -1]`; 0 is `[0n, 0]`                                                                                                |
| `product(a, b)`           | `a · b`, exact, normalized: `[an · bn, ae + be]`                                                                                                                                                  |
| `sum(a, b)`               | `a + b`, exact, normalized: both aligned on the smaller exponent                                                                                                                                  |
| `errors(C)`               | the frozen errors `{ bound, quadraticSquared, term }` of the class `C`, in the unit of its values, as `define` stores them, for a class written by hand too; it throws as the constants of `C` do |
| `NO_ERROR_PROCESSING`     | the frozen errors `{ bound: undefined, quadraticSquared: undefined, term: undefined }`; `./core` exports it too                                                                                   |
| type `Quantity`           | a `bigint`, a `number` or a decimal `[n, e]`                                                                                                                                                      |
| type `Decimal`            | an exact decimal `[n, e]`                                                                                                                                                                         |
| type `ErrorSpec`          | `{ bound?, quadratic?, quadraticSquared?, term? }`, of quantities: the object form of `error`                                                                                                     |
| type `Errors`             | `{ bound, quadraticSquared, term }`, each a `Decimal` or `undefined`: the errors of a class                                                                                                       |

The four functions of the arithmetic work at full length, with no rounding: a module that
combines the errors of several classes, as a sum of squares `Σ(aᵢ · qᵢ)²`, keeps them
exact with them.

### The conversion of a number

A `number` is `±m · 2^p`, with an integer mantissa `m` of 53 bits. Every power of 2 is a
decimal, since `2^-p = 5^p · 10^-p`, so every `number` is a decimal:

- the mantissa is read as a `bigint` `m`, with its hidden bit: `9007199254740991` when its
  53 bits are all ones;
- the binary point moves 52 bits to the right: the exponent becomes `p = E − 52`;
- a positive `p` multiplies `m` by `2n ** p`;
- a negative `p` multiplies `m` by `5n ** −p`, and `p` is kept as the power of ten;
- the product is rounded once to 15 significant digits, ties to even;
- the trailing zeros move into the power of ten.

The rounding is done once, to 15 digits: dividing by 10 again and again would truncate,
and give 0.299999999999999.

### The display position

`#shown`, the private method behind `valueOf()`, `toString()` and `toLocaleString()`,
finds `j` from a rough error of two significant digits, never from the exact one:

1. **The error**, the first defined of `term`, `quadraticSquared` and `bound`, in steps:
   `[n, e + k]` for `term` or `bound`, `[n, e + 2k]` for `quadraticSquared`, a square.
   None: `j = 0`.
2. **Rounded down to `n < 100`**, as the first step: when `n` has `d > 2` digits, `[n, e]`
   becomes `[⌊n / 10^(d−2)⌋, e + d − 2]`. One division of `bigint`s; the result is never
   above the exact error.
3. **For `quadraticSquared` only, the root of the rough square.** From the rough square
   `[m, f]`, `m` is brought to 3 or 4 digits with an even exponent: `m · 10` when `m < 10`,
   then `m · 10` when the exponent is odd, `m · 100` when it is even. The error is then
   `[r, f′ / 2]`, with `r = ⌊√m⌋`, which `Math.floor(Math.sqrt(Number(m)))` gives exactly
   for an integer below `10^4`. So `10 ≤ r < 100`: two digits again, rounded down. A
   square of 0 gives `j = 0`.
4. **`j = position(ε)`**: the largest `j ≥ 1` with `10^j ≤ 2ε`, or 0 when there is none.
   `2ε` lies in `[10^(o − 1), 10^o)`, with `o` its digits plus its exponent, so `j` is
   `o − 1`, exactly.

**Why nothing is lost.** For an error, `j` changes where `ε` crosses `5 · 10^(j−1)` steps,
a number of one significant digit: rounding `ε` down to two digits never takes it below a
threshold it was above. For a square, the threshold is `25 · 10^(2j−2)`, two digits:
rounding the square down to two digits does not cross it either, and `⌊√m⌋` does not cross
an integer that `√m` reaches. So `j` is the position that the exact error gives: 5 steps
give 1, 4.9 steps give 0, and so do the long decimals just below and above them. The
rough error is a means of finding `j`, never a value: the errors stay as they are kept.

### The quadratic error getter

`quadraticError` is `√(Q / R²)`, a `number`, with `Q = quadraticSquared` and
`R = max − min`. It is computed from every digit of `Q` and `R`, however many:

1. `Q` undefined gives `undefined`; `Q = 0` gives 0.
2. **The exact cases.** When `Q` equals `bound²` (`compare`, `product`), the getter returns
   `errorBound`; when it equals `term²`, `termError`. This covers every default class and
   every single error.
3. **The quotient.** With `Q = [qn, qe]` and `R = [rn, re]`, `X = ⌊qn · 10^s / rn²⌋` is an
   integer of at least 60 digits, and `Q / R² = (X + f) · 10^t`, with `t` even and
   `0 ≤ f < 1`: the truncation is below `10^−59` of the value.
4. **Newton's iteration**, `s_{i+1} = (s_i + X / s_i) / 2`, on `bigint`s, with integer
   division. The seed is `Math.sqrt` of the leading 30 or 31 digits of `X`, scaled back,
   which has about 15 correct digits; each iteration doubles them, and two iterations, a
   fixed number, give about 30.
5. **The `number`** is read from the string `` `${s}e${t / 2}` ``, which JavaScript rounds
   correctly, then clamped between `termError` and `errorBound`, those that are defined. The
   rules give `term ≤ √Q ≤ bound`, so the clamp moves only a result within the last bit of
   one of them.

The 30 digits do not follow the length of the decimals, which may be any: they make the
`number` the one nearest to the exact root, where 20 digits would leave a rounding of one
bit in a few cases out of 10⁵. The display never reads this getter.

<!--
Change History

| PR  | Summary |
|-----|---------|
| #42 | new: BoundedInt, its casts, conversions and subclasses (#41) |
| #47 | decimal classes: scale, the exact bounds [min, max), order, error; quantities as decimals, numbers at 15 digits; from, fromValue, define; valueOf, toString, toLocaleString, rounding (#44) |
| #51 | notice: ./core exports a specialized subclass (#49) |
| #53 | no order: a class holds no more values than its parent, unless its parent is BoundedInt; static low and high; define typed as its class, other keys ignored (#52) |
| #55 | notice: ./core gives the subclass through the boundedInt() of a blinding context (#48) |
| #59 | three errors { bound, quadratic, term } as decimals, their rules, never inherited, {} disables them; getters may be undefined; display at the first defined error; direct scale, never clamped; a class written by hand declares error as an object only; For the other modules of the library (#58) |
| #63 | the quadratic error kept squared, quadraticSquared, its rules on squares; NO_ERROR_PROCESSING; product and sum exported; the display position from two digits; the quadratic error getter; For users, For developers, For Maintainers; what explains why the implementation is exact and correct moves to For Maintainers (#62) |
-->
