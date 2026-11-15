# Linear combinations

A Pedersen commitment is linear: the sum of two commitments `C₁ = m₁·g + r₁·h` and
`C₂ = m₂·g + r₂·h` is a commitment to `m₁ + m₂`, with the blinding factor `r₁ + r₂`, and
`a·C₁` is a commitment to `a·m₁`. So a verifier who holds the commitments of a holder
can compute, alone, a commitment to any linear combination of the hidden values: an age
from a birth date and today's date, a balance from a credit and a debit. A proof about
that one commitment, such as a range proof, is then a proof about the combination.

A combination is a list of terms `aᵢ·Tᵢ`: a coefficient `aᵢ`, a
[quantity](bounded-int.md#quantities), and `Tᵢ`, a class of
[bounded integers](bounded-int.md). It is built once, from classes only, and knows no
group and no context. It is used with a [blinding context](blinding-context.md), by two
methods that give the same commitment:

- **`combine`**, for the verifier, takes one [`Committed`](blinding-context.md#committed-and-blinded)
  per term and returns the commitment to the combination;
- **`combineBlinded`**, for the holder, takes one
  [`Blinded`](blinding-context.md#committed-and-blinded) per term and returns the
  commitment to the combination with its opening.

```ts
import {
  BlindingContext,
  LinearCombination,
  RistrettoElement,
} from "@criticaloptimisation/vc-proofs/core";

const context = BlindingContext.fromEncoded(publishedH, message, RistrettoElement);
const Scalar = context.boundedInt;
const DayCount = Scalar.define({ name: "DayCount", min: -0.5, max: 365250.5 }); // 0 to 365250

const Age = new LinearCombination({
  name: "Age",
  terms: [
    [1n, DayCount], // today
    [-1n, DayCount], // the birth date
  ],
});
Age.boundedInt.low; // -365250n
Age.boundedInt.high; // 365250n

const today = await context.blind(DayCount.from(20000n));
const birth = await context.blind(DayCount.from(7000n));

// The holder: the commitment to the age, and its opening.
const age = Age.combineBlinded(context, [today, birth]);
age.value.value; // 13000n
await context.isOpeningOf(age); // true

// The verifier, from the commitments and the classes of the claims.
const C = Age.combine(context, [
  { commitment: today.commitment, type: DayCount },
  { commitment: birth.commitment, type: DayCount },
]);
C.equals(age.commitment); // true
```

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

The low-level entry point, `@criticaloptimisation/vc-proofs/core`, exports the class
`LinearCombination`.

### Values and errors

- **Immutable.** A combination never changes once built. Its terms are copied by the
  constructor, so a later change to the caller's array changes nothing.
- **Built from classes.** The constructor reads the classes of the terms, never a value,
  a commitment or a group. It never throws for a reason that depends on a group.
- **Checked against a group at use.** `combine` and `combineBlinded` check that the class
  of the result fits the group of their context (see [The group at use](#the-group-at-use)).
- **Synchronous.** Neither method uses the generator `h`: they add and multiply the
  commitments they are given, and need not wait for the validation of the context.
- **Errors**: `TypeError` for an input of the wrong kind; `RangeError` for a combination
  that does not fit the group of the context, a count of inputs other than the count of
  terms, or a commitment given twice. The messages name the method. See [Errors](#errors).

### LinearCombination

| Member                                   | Returns                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| `new LinearCombination({ name, terms })` | a new combination                                                      |
| `boundedInt`                             | the class of the result: its scale, its range and its errors           |
| `coefficients`                           | the integer coefficients `a′ᵢ`, aligned on the scale of the result     |
| `combine(context, committed)`            | the commitment to the combination, an element of the group             |
| `combineBlinded(context, openings)`      | the commitment to the combination with its opening, a frozen `Blinded` |

#### The constructor

`new LinearCombination({ name, terms })` takes:

- `name`, a non-empty string: the name of the class of the result, used in the messages;
- `terms`, an array of pairs `[a, T]`, in order: `a` a quantity, a `bigint`, a `number`
  or a decimal `[n, e]`, 0 included; `T` a class of bounded integers, such as a class
  made from `context.boundedInt`, or the class of the result of another combination. The
  same class may appear in several terms: `Age` holds two values of `DayCount`, today and
  the birth date. An empty array is valid: the sum of no terms.

Any other key of the spec is ignored. The constructor computes, once, the coefficients
and the class of the result.

#### The coefficients

The values of the terms are counted in steps of their classes, `10^-kᵢ` (see
[The class constants](bounded-int.md#the-class-constants)), and the coefficients may be
decimals. The constructor brings them all to one step, the finest that the combination
needs, so that the result is an exact integer:

- each coefficient is converted to a decimal `aᵢ = [nᵢ, eᵢ]`, without trailing zeros in
  `nᵢ`;
- the scale of the result is `k = max(kᵢ − eᵢ)`, over every term;
- the coefficient of term `i` becomes the integer `a′ᵢ = nᵢ · 10^(k − kᵢ + eᵢ)`, a
  `bigint`.

Then the integer of the result, in steps `10^-k`, is `Σ a′ᵢ·qᵢ`, with `qᵢ` the integer of
the value of term `i`, exactly. `coefficients` gives the `a′ᵢ`, a frozen array of
`bigint`s, in the order of the terms: `[1n, -1n]` for `Age`. A coefficient of 0 gives
`0n`: the term adds nothing to the result, but its input is still checked. There is no
alignment for no term: `coefficients` is empty.

The scale of a term and the exponent of its coefficient add up: a decimal coefficient
refines the step of the result, an integer coefficient with trailing zeros coarsens it.
Take `x` in `[0, 0.09995)` at the step `10^-4`, the scale 4: its integers are `0 … 999`,
0 to 0.0999. The coefficient `0.2` is the decimal `[2n, -1]`. The result `r = 0.2·x` has
the scale `k = 4 − (−1) = 5`, the step `10^-5`, and `a′ = 2 · 10^(5 − 4 − 1) = 2n`: the
combination is the equation `r = 2·x` between the integers, and the range of `r` is
`0 … 1998`, 0 to 0.01998, which is `0.2 × 0.0999`.

The coefficients grow with the spread of the exponents: a coefficient `[1n, -30]` on a
class of scale 0 gives `k = 30`, and multiplies every other term by `10^30`. A `bigint`
holds them exactly; the cost is in the size of the integers.

#### The class of the result

`boundedInt` is the class of the bounded integers of the result, made once by the
constructor and the same object on every read. It is not made from the class of a group:
it may hold more integers than any group has scalars, and
[the group at use](#the-group-at-use) decides whether it fits.

- **Its scale** is `k`, the scale of the coefficients.
- **Its range**: `low = Σ a′ᵢ · (a′ᵢ > 0 ? lowᵢ : highᵢ)` and
  `high = Σ a′ᵢ · (a′ᵢ > 0 ? highᵢ : lowᵢ)`, the least and the greatest integer that the
  values of the terms can give. It holds `high − low + 1 = 1 + Σ |a′ᵢ| · (highᵢ − lowᵢ)`
  integers.
- **Its errors**: see [The errors of the result](#the-errors-of-the-result).
- **Its name** is the `name` given to the constructor. It is frozen, as every class made
  by `define`.

The class of the result is a class of bounded integers like any other: it is a valid
term of a further combination, over any group.

```ts
const Later = new LinearCombination({
  name: "Later",
  terms: [
    [1n, Age.boundedInt],
    [1n, DayCount],
  ],
});
Later.boundedInt.low; // -365250n
Later.boundedInt.high; // 730500n
```

#### The errors of the result

The class of the result carries the three errors of a class (see
[The errors of a class](bounded-int.md#the-errors-of-a-class)), in the unit of the
result, computed from the errors of the term classes and the decimal coefficients `aᵢ`:

| Error              | Of the result               | Meaning                 |
| ------------------ | --------------------------- | ----------------------- |
| `bound`            | `Σ \|aᵢ\| · boundᵢ`         | the worst case          |
| `quadraticSquared` | `Σ aᵢ² · quadraticSquaredᵢ` | independent errors      |
| `term`             | `max \|aᵢ\| · termᵢ`        | the least accurate term |

The quadratic error is combined as its square, `quadraticSquared`, as every class keeps
it: the sum of the squares is exact, and no root is taken. The three are exact decimals,
as [`errors`](bounded-int.md#kept-as-decimals) gives them for any class.

An error is `undefined` as soon as one term has it `undefined`: a sum with an unknown part
is unknown. A term class made with [`NO_ERROR_PROCESSING`](bounded-int.md#given-to-define)
gives a result with no error, whose values show every digit. With no term, the three are
0: the constant is exact. A coefficient of 0 adds 0 to each.

The class of the result is made by `define`, so [the rules](bounded-int.md#the-rules) of the
errors apply to it: they hold for the formulas above, and fill in an error the formulas
leave `undefined` when the two others are equal.

The values of the result show the digits that its errors give (see
[valueOf, toString and toLocaleString](bounded-int.md#valueof-tostring-and-tolocalestring)):
a value of `2·Mass − Reading` of the [examples](#examples) shows the tenth, the accuracy
of `2·Mass`.

#### The empty combination

A combination of no terms is the constant 0. Its class is the integer 0 alone, at the
scale 0, with errors of 0: the constant is exact. It is made without alignment.

- `combine` returns the identity element of the group, the sum of no commitments.
- `combineBlinded` returns `{ commitment, value, blinding }`, with that identity, the
  value 0 of the class of the result, and the blinding factor 0 of the class of the
  group: `isOpeningOf` accepts it.

Both are deterministic: the verifier and the holder must find the same commitment, and a
random blinding factor would give them two different ones. A commitment to the empty
combination hides nothing, and needs not: there is no hidden value, and everyone knows
that the combination is 0.

### The group at use

A commitment binds its value mod `ℓ`, `ℓ` the `ORDER` of the group. The commitment to the
combination binds `M mod ℓ`, `M = Σ a′ᵢ·qᵢ` the integer of the result, and `M` lies in
`low … high`. So, as [blind](blinding-context.md#blind) does for a value, `combine` and
`combineBlinded` require that **the class of the result fits the group**: it holds no
more integers than [the class of the group](blinding-context.md#the-class-of-a-group),
`context.boundedInt`:

```
boundedInt.high − boundedInt.low + 1  ≤  ℓ
```

Then no two integers of `low … high` are equal mod `ℓ`, and the commitment binds exactly
one value of the result. A combination that does not fit is refused with a `RangeError`
before any arithmetic, whose message names the combination and the group:
`LinearCombination.combine: Age holds more values than the group Small has scalars`.

**The check is on the result only.** The classes of the terms are not compared with the
class of the group, neither by their count of integers nor by their parents: a
combination of classes made from any root is valid over any group it fits, and a result
that fits implies terms that fit (see [Why the result is enough](#why-the-result-is-enough)).

One combination may serve several groups: `Age` holds 730501 integers, and fits
ristretto255, whose `ℓ` is about `2^252`, but not a group of order 65536. A combination
may be built that fits no group: `Scalar + Scalar`, two terms of the class of
ristretto255, holds `2ℓ − 1` integers. The constructor builds it, and both methods refuse
it over ristretto255.

**What the check does not prove.** The range `low … high` holds when the value of each
term lies within its class, which the holder knows, and the verifier does not: a
commitment alone shows nothing of its value. A proof about the combination must also
prove, for each term, that its committed value lies within its class.

#### combine

`combine(context, committed)` returns `Σ a′ᵢ·Cᵢ`, an element of the group of `context`,
with `Cᵢ` the commitment of term `i`. It is for the verifier, who holds commitments and
the classes of their values, and no opening.

- `committed` is an array of [`Committed`](blinding-context.md#committed-and-blinded)
  `{ commitment, type }`, one per term, in the order of the terms;
- the `type` of each must be the class of its term, `Tᵢ` itself;
- the result is the element only: its class is `boundedInt`, which the verifier has.

It checks the classes, not the commitments: a commitment that opens to a value outside
its class is the business of the proof.

#### combineBlinded

`combineBlinded(context, openings)` returns the commitment to the combination with its
opening, a frozen [`Blinded`](blinding-context.md#committed-and-blinded)
`{ commitment, value, blinding }`. It is for the holder, who has the opening of each
commitment.

- `openings` is an array of `Blinded`, one per term, in the order of the terms;
- the class of each value, `value.constructor`, must be the class of its term, and the
  class of each blinding factor, `blinding.constructor`, the class of the group,
  `context.boundedInt`;
- `commitment` is `Σ a′ᵢ·Cᵢ`, the element that `combine` returns for the same commitments;
- `value` is `boundedInt.fromValue(Σ a′ᵢ·qᵢ)`, a value of the class of the result;
- `blinding` is `context.boundedInt.fromValue((Σ a′ᵢ·rᵢ) mod ℓ)`, with `rᵢ` the blinding
  factor of term `i`, a value of the class of the group.

Since `Σ a′ᵢ·(qᵢ·g + rᵢ·h) = (Σ a′ᵢ·qᵢ)·g + (Σ a′ᵢ·rᵢ)·h`, the result opens its commitment
whenever each input opens its own. `combineBlinded` does not check the inputs: a holder
checks the result with [isOpeningOf](blinding-context.md#isopeningof) before trusting
it, as any `Blinded` that `blind` did not return. The blinding factor of the result may be
0, as any other value of the class of the group.

#### Each commitment once

The same commitment may not be given for two terms: `combine` and `combineBlinded`
refuse it with a `RangeError`. A combination that names one value twice, such as `x − x`
on one commitment, or `x + x`, must be written with its terms factored: `0·x`, `2·x`. The
commitments are compared with the `equals` of the elements of the group.

### Examples

The classes, made from the class of the group, `Scalar = context.boundedInt`:

```ts
import { NO_ERROR_PROCESSING } from "@criticaloptimisation/vc-proofs/core";

const DayCount = Scalar.define({ name: "DayCount", min: -0.5, max: 365250.5 }); // 0 to 365250, k = 0
const Mass = Scalar.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 }); // 0 to 1000, k = 1
const Reading = Scalar.define({ name: "Reading", min: -7.99, max: 15.995, step: 0.01 }); // −799 to 1599, k = 2
const Sensor = Scalar.define({
  name: "Sensor",
  min: 0,
  max: 100.05,
  step: 0.1,
  error: { quadratic: 0.08 },
});
const Raw = Scalar.define({
  name: "Raw",
  min: 0,
  max: 100.05,
  step: 0.1,
  error: NO_ERROR_PROCESSING,
});
const Fraction = Scalar.define({ name: "Fraction", min: 0, max: 0.09995, step: 0.0001 }); // 0 to 999, k = 4
```

| Terms                               | `k` | `coefficients` | `low`      | `high`     | `bound`     | `quadraticSquared` | `term`      |
| ----------------------------------- | --- | -------------- | ---------- | ---------- | ----------- | ------------------ | ----------- |
| `[[1n, DayCount], [-1n, DayCount]]` | 0   | `[1n, -1n]`    | `-365250n` | `365250n`  | 1           | 0.5                | 0.5         |
| `[[2n, Mass], [-1n, Reading]]`      | 2   | `[20n, -1n]`   | `-1599n`   | `20799n`   | 0.105       | 0.010025           | 0.1         |
| `[[0.5, DayCount]]`                 | 1   | `[5n]`         | `0n`       | `1826250n` | 0.25        | 0.0625             | 0.25        |
| `[[1n, Sensor], [-1n, Mass]]`       | 1   | `[1n, -1n]`    | `-1000n`   | `1000n`    | `undefined` | 0.0089             | `undefined` |
| `[[1n, Mass], [1n, Raw]]`           | 1   | `[1n, 1n]`     | `0n`       | `2000n`    | `undefined` | `undefined`        | `undefined` |
| `[[0.2, Fraction]]`                 | 5   | `[2n]`         | `0n`       | `1998n`    | 0.00001     | 0.0000000001       | 0.00001     |
| `[]`                                | 0   | `[]`           | `0n`       | `0n`       | 0           | 0                  | 0           |

- **`Age`**, the first row: two values of `DayCount`, each known to half a day. The
  bound is a day; the square of the quadratic error is `0.5² + 0.5² = 0.5`.
- **`2·Mass − Reading`**: the steps are 0.1 and 0.01, so `k = 2`, and `Mass` counts 10
  steps of the result for each of its own. `Mass.from(2.3)` is `23n` and
  `Reading.from(-0.125)` is `-12n`: the integer of the result is
  `20 · 23 − (−12) = 472n`, 4.72. Its least accurate term, `2·Mass`, is known to 0.1, so
  it shows `"4.7"`.
- **`0.5·DayCount`**: the coefficient `[5n, -1]` brings the scale to 1. Half a day count
  is known to a quarter of a day.
- **`Sensor − Mass`**: `Sensor` knows only a quadratic error, so the result has no bound
  and no error of its least accurate term: `0.08² + 0.05² = 0.0089`. Its values show the
  digits of its quadratic error.
- **`Mass + Raw`**: `Raw` has no error, so neither has the result.
- **`0.2·Fraction`**: the worked example of [The coefficients](#the-coefficients), the
  equation `r = 2·x` at the scale 5. `Fraction` is known to half its step, 0.00005, so
  the result is known to `0.2 × 0.00005 = 0.00001`: half its own step.
- **`[]`**: the empty combination, the constant 0.

### Errors

| Case                                                                                                                                                                              | Error                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| the constructor: the spec not an object; `name` not a non-empty string; `terms` not an array; a term not a pair `[a, T]`; `a` not a quantity; `T` not a class of bounded integers | `TypeError`                          |
| the constructor: the constants of a term class invalid; a scale of the result beyond `−308 … 323`                                                                                 | `RangeError`, as `define`            |
| `combine`, `combineBlinded`: the class of the result holds more integers than the class of the group                                                                              | `RangeError`, before any other check |
| `combine`, `combineBlinded`: the inputs not an array; an input not an object; a `type`, a `value.constructor` or a `blinding.constructor` not the class expected                  | `TypeError`                          |
| `combine`, `combineBlinded`: a count of inputs other than the count of terms                                                                                                      | `RangeError`                         |
| `combine`, `combineBlinded`: the same commitment for two terms                                                                                                                    | `RangeError`                         |

## For Maintainers

This part documents `src/core/linear-combination.ts` for the maintainers of the library.
Nothing in it is a member that an entry point exports.

### The module

`linear-combination.ts` imports at run time only `bounded-int.ts`: the generic class
`BoundedInt`, `decimal`, `errors`, and the arithmetic of decimals, `compare`, `product`
and `sum` (see
[For the other modules of the library](bounded-int.md#for-the-other-modules-of-the-library)).
It imports as types only `GroupElement`, from `interfaces.ts`, the file of the core
interfaces, of which it uses the operations of an abelian group (`add`, `multiplyScalar` by
an integer, `equals`), and `BlindingContext`, `Committed` and `Blinded`, from
`blinding-context.ts`. A combination keeps three private fields: `#result`, the class of
the result, which the getter `boundedInt` reads; `#coefficients`, the frozen `a′ᵢ`; and
`#terms`, the frozen copy of the term classes.

### The class of the result

The constructor makes `#result` with the `define` of the generic `BoundedInt` of
`bounded-int.ts`, never with that of the class of a group. A class whose parent is the
generic class is exempt from the count of values of its parent (see
[The generic class](bounded-int.md#the-generic-class)), so the constructor never compares
the result with a group. Its spec:

- `step: [1n, −k]`, `min: [low, −k]` and `max: [10·high + 5, −(k + 1)]`: the bounds
  `[low · 10^-k, (high + ½) · 10^-k)`, whose `low` and `high` are exactly those of the
  combination;
- `error: { bound, quadraticSquared, term }`, the three computed as below, `quadraticSquared`
  given as it is, never as a `quadratic` that `define` would square.

The empty combination is `{ min: -0.5, max: 0.5, error: 0 }`, with no alignment. Its
identity element is `context.group.canonicalGenerator().multiplyScalar(0n)`: neither method
uses `h`.

### The errors, exactly

The errors are combined with the arithmetic of `bounded-int.ts`, at full length, on the
decimals that `errors(Tᵢ)` gives, with `|aᵢ| = [|nᵢ|, eᵢ]`:

1. `bound = sum(…, product(|aᵢ|, boundᵢ))`, over the terms, from `[0n, 0]`;
2. `quadraticSquared = sum(…, product(product(|aᵢ|, |aᵢ|), quadraticSquaredᵢ))`: the
   squares are added as they are stored, so their exponents are already those of squares;
3. `term`, the largest `product(|aᵢ|, termᵢ)`, by `compare`, from `[0n, 0]`.

`product` and `sum` normalize their result, so no trailing zero is left.

**Worked: `2·Mass − Reading`.** `Mass` is known to half its step: `bound` and `term`
`[5n, -2]`, `quadraticSquared` `[25n, -4]`. `Reading` likewise: `[5n, -3]` and
`[25n, -6]`. The coefficients are `|2| = [2n, 0]` and `|−1| = [1n, 0]`.

- `bound`: `product([2n, 0], [5n, -2])` is `[1n, -1]`; with `[5n, -3]`, `sum` aligns on
  `−3`, `100 + 5`: `[105n, -3]`, 0.105.
- `quadraticSquared`: `product([4n, 0], [25n, -4])` is `[1n, -2]`; with `[25n, -6]`, `sum`
  aligns on `−6`, `10000 + 25`: `[10025n, -6]`, 0.010025. Its root, about 0.1001, is never
  computed.
- `term`: the larger of `[1n, -1]` and `[5n, -3]`: `[1n, -1]`, 0.1.

The rules of `define` hold, on squares: `0.01 ≤ 0.010025 ≤ 0.011025`.

**Worked: `0.2·x`**, the example of [The coefficients](#the-coefficients). `x` is known to
`[5n, -5]`, squared `[25n, -10]`; `|0.2| = [2n, -1]`. `bound` and `term` are
`product([2n, -1], [5n, -5])`, `[1n, -5]`; `quadraticSquared` is
`product([4n, -2], [25n, -10])`, that is `[1n, -10]`, the square of `10^-5`. All three are
half the step of the result.

### Why the result is enough

A check of the terms against the group would add nothing. For a term `j` with `a′ⱼ ≠ 0`,
`|a′ⱼ| ≥ 1`, since `a′ⱼ` is an integer, so

```
high − low + 1  =  1 + Σ |a′ᵢ| · (highᵢ − lowᵢ)  ≥  1 + (highⱼ − lowⱼ)
```

and a class of the result that holds at most `ℓ` integers has terms that hold at most `ℓ`
each. A term of coefficient 0 adds nothing to the result, so its class plays no part.

### The blinding factor of the result

When the `rᵢ` are independent and uniform, and one `a′ᵢ` is not a multiple of `ℓ`, the sum
`Σ a′ᵢ·rᵢ mod ℓ` is uniform too, 0 included. It is `bigint` arithmetic, whose timing depends
on the sizes of the integers (see [Constant time](blinding-context.md#constant-time)); `h`
is never multiplied.

### Why each commitment once

Two terms of one commitment would hide that the combination is a constant, or a multiple
of one term, behind the look of a sum of independent values: their errors would be
counted as independent, and the blinding factor of `x − x` is 0 by construction. So the
terms must be factored, and the methods refuse the same commitment twice rather than
factor it themselves.

<!--
Change History

| PR  | Summary |
|-----|---------|
| #64 | new: LinearCombination, its coefficients, the class of the result and its errors, the group at use, combine, combineBlinded (#50) |
-->
