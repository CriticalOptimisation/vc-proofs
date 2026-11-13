# Linear combinations

A Pedersen commitment is linear: the sum of two commitments `C₁ = m₁·g + r₁·h` and
`C₂ = m₂·g + r₂·h` is a commitment to `m₁ + m₂`, with the blinding factor `r₁ + r₂`, and
`a·C₁` is a commitment to `a·m₁`. So a verifier who holds the commitments of a holder
can compute, alone, a commitment to any linear combination of the hidden values: an age
from a birth date and today's date, a balance from a credit and a debit. A proof about
that one commitment, such as a range proof, is then a proof about the combination.

The low-level entry point, `@criticaloptimisation/vc-proofs/core`, gives the class
`LinearCombination`. A combination is a list of terms `aᵢ·Tᵢ`: a coefficient `aᵢ`, a
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

## Values and errors

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

## LinearCombination

| Member                                   | Returns                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| `new LinearCombination({ name, terms })` | a new combination                                                      |
| `boundedInt`                             | the class of the result: its scale, its range and its errors           |
| `coefficients`                           | the integer coefficients `a′ᵢ`, aligned on the scale of the result     |
| `combine(context, committed)`            | the commitment to the combination, an element of the group             |
| `combineBlinded(context, openings)`      | the commitment to the combination with its opening, a frozen `Blinded` |

### The constructor

`new LinearCombination({ name, terms })` takes:

- `name`, a non-empty string: the name of the class of the result, used in the messages;
- `terms`, an array of pairs `[a, T]`, in order: `a` a quantity, a `bigint`, a `number`
  or a decimal `[n, e]`, 0 included; `T` a class of bounded integers, such as a class
  made from `context.boundedInt`, or the class of the result of another combination. The
  same class may appear in several terms: `Age` holds two values of `DayCount`, today and
  the birth date. An empty array is valid: the sum of no terms.

Any other key of the spec is ignored. The constructor computes, once, the coefficients
and the class of the result.

### The coefficients

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

### The class of the result

`boundedInt` is the class of the bounded integers of the result, made once by the
constructor and the same object on every read. It is made with the
[`define`](bounded-int.md#define) of the generic class of bounded integers, not of the
class of a group: its parent is the generic class, so it may hold more integers than any
group has scalars, and [the group at use](#the-group-at-use) decides whether it fits.

- **Its scale** is `k`, the scale of the coefficients.
- **Its range**: `low = Σ a′ᵢ · (a′ᵢ > 0 ? lowᵢ : highᵢ)` and
  `high = Σ a′ᵢ · (a′ᵢ > 0 ? highᵢ : lowᵢ)`, the least and the greatest integer that the
  values of the terms can give. The class is made with the bounds
  `[low · 10^-k, (high + ½) · 10^-k)`, so that its `low` and `high` are exactly these.
  It holds `high − low + 1 = 1 + Σ |a′ᵢ| · (highᵢ − lowᵢ)` integers.
- **Its errors**, in the unit of the result, from the errors of the terms (see
  [The errors of a class](bounded-int.md#the-errors-of-a-class)) and the decimal
  coefficients `aᵢ`:
  - `bound = Σ |aᵢ| · boundᵢ`: the errors add up in the worst case;
  - `quadratic = √Σ (aᵢ · quadraticᵢ)²`, for independent errors: the root, rounded up
    to 15 significant digits, so that it is a decimal;
  - `term = max |aᵢ| · termᵢ`: the error of the least accurate term.

  Each of them is `undefined` as soon as one term has it `undefined`: a sum with an
  unknown part is unknown. They keep `term ≤ quadratic ≤ bound`, and they decide the
  digits the values of the result show (see
  [valueOf, toString and toLocaleString](bounded-int.md#valueof-tostring-and-tolocalestring)).

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

### The empty combination

A combination of no terms is the constant 0. Its class is the integer 0 alone, at the
scale 0, with errors of 0: the constant is exact. It is made without alignment.

- `combine` returns the identity element of the group, the sum of no commitments,
  computed as `context.group.canonicalGenerator().multiplyScalar(0n)`.
- `combineBlinded` returns `{ commitment, value, blinding }`, with that identity, the
  value 0 of the class of the result, and the blinding factor 0 of the class of the
  group: `isOpeningOf` accepts it.

Both are deterministic: the verifier and the holder must find the same commitment, and a
random blinding factor would give them two different ones. A commitment to the empty
combination hides nothing, and needs not: there is no hidden value, and everyone knows
that the combination is 0.

## The group at use

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
combination of classes made from any root is valid over any group it fits. A check of
the terms would add nothing, since a result that fits implies terms that fit. For a term
`j` with `a′ⱼ ≠ 0`, `|a′ⱼ| ≥ 1`, since `a′ⱼ` is an integer, so

```
high − low + 1  =  1 + Σ |a′ᵢ| · (highᵢ − lowᵢ)  ≥  1 + (highⱼ − lowⱼ)
```

and a class of the result that holds at most `ℓ` integers has terms that hold at most `ℓ`
each. A term of coefficient 0 adds nothing to the result, so its class plays no part.

One combination may serve several groups: `Age` holds 730501 integers, and fits
ristretto255, whose `ℓ` is about `2^252`, but not a group of order 65536. A combination
may be built that fits no group: `Scalar + Scalar`, two terms of the class of
ristretto255, holds `2ℓ − 1` integers. The constructor builds it, and both methods refuse
it over ristretto255.

**What the check does not prove.** The range `low … high` holds when the value of each
term lies within its class, which the holder knows, and the verifier does not: a
commitment alone shows nothing of its value. A proof about the combination must also
prove, for each term, that its committed value lies within its class.

### combine

`combine(context, committed)` returns `Σ a′ᵢ·Cᵢ`, an element of the group of `context`,
with `Cᵢ` the commitment of term `i`. It is for the verifier, who holds commitments and
the classes of their values, and no opening.

- `committed` is an array of [`Committed`](blinding-context.md#committed-and-blinded)
  `{ commitment, type }`, one per term, in the order of the terms;
- the `type` of each must be the class of its term, `Tᵢ` itself;
- the result is the element only: its class is `boundedInt`, which the verifier has.

It uses the `add` and `multiplyScalar` of the elements, and `canonicalGenerator()` of
the group for the empty combination. It checks the classes, not the commitments: a
commitment that opens to a value outside its class is the business of the proof.

### combineBlinded

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

The integers are read through the `value` getter of each bounded integer. Since
`Σ a′ᵢ·(qᵢ·g + rᵢ·h) = (Σ a′ᵢ·qᵢ)·g + (Σ a′ᵢ·rᵢ)·h`, the result opens its commitment
whenever each input opens its own. `combineBlinded` does not check the inputs: a holder
checks the result with [isOpeningOf](blinding-context.md#isopeningof) before trusting
it, as any `Blinded` that `blind` did not return.

The blinding factor of the result may be 0, as any other value of the class of the group:
when the `rᵢ` are independent and uniform, and one `a′ᵢ` is not a multiple of `ℓ`, the sum
is uniform too. `Σ a′ᵢ·rᵢ` is `bigint` arithmetic, whose timing depends on the sizes of
the integers (see [Constant time](blinding-context.md#constant-time)); `h` is never
multiplied.

### Each commitment once

The same commitment may not be given for two terms: `combine` and `combineBlinded`
refuse it with a `RangeError`. A combination that names one value twice, such as `x − x`
on one commitment, or `x + x`, must be written with its terms factored: `0·x`, `2·x`.
Two terms of one commitment would hide that the combination is a constant, or a multiple
of one term, behind the look of a sum of independent values: their errors would be
counted as independent, and the blinding factor of `x − x` is 0 by construction. The
commitments are compared with the `equals` of the elements of the group.

## Examples

The classes, made from the class of the group, `Scalar = context.boundedInt`:

```ts
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
const Fraction = Scalar.define({ name: "Fraction", min: 0, max: 0.09995, step: 0.0001 }); // 0 to 999, k = 4
```

| Terms                               | `k` | `coefficients` | `low`      | `high`     | `bound`     | `quadratic`        | `term`      |
| ----------------------------------- | --- | -------------- | ---------- | ---------- | ----------- | ------------------ | ----------- |
| `[[1n, DayCount], [-1n, DayCount]]` | 0   | `[1n, -1n]`    | `-365250n` | `365250n`  | 1           | 0.707106781186548  | 0.5         |
| `[[2n, Mass], [-1n, Reading]]`      | 2   | `[20n, -1n]`   | `-1599n`   | `20799n`   | 0.105       | 0.100124921972504  | 0.1         |
| `[[0.5, DayCount]]`                 | 1   | `[5n]`         | `0n`       | `1826250n` | 0.25        | 0.25               | 0.25        |
| `[[1n, Sensor], [-1n, Mass]]`       | 1   | `[1n, -1n]`    | `-1000n`   | `1000n`    | `undefined` | 0.0943398113205661 | `undefined` |
| `[[0.2, Fraction]]`                 | 5   | `[2n]`         | `0n`       | `1998n`    | 0.00001     | 0.00001            | 0.00001     |
| `[]`                                | 0   | `[]`           | `0n`       | `0n`       | 0           | 0                  | 0           |

- **`Age`**, the first row: two values of `DayCount`, each known to half a day. The
  bound is a day; the quadratic error, `√(0.5² + 0.5²) = √0.5`, rounded up.
- **`2·Mass − Reading`**: the steps are 0.1 and 0.01, so `k = 2`, and `Mass` counts 10
  steps of the result for each of its own. `Mass.from(2.3)` is `23n` and
  `Reading.from(-0.125)` is `-12n`: the integer of the result is
  `20 · 23 − (−12) = 472n`, 4.72. Its least accurate term, `2·Mass`, is known to 0.1, so
  it shows `"4.7"`.
- **`0.5·DayCount`**: the coefficient `[5n, -1]` brings the scale to 1. Half a day count
  is known to a quarter of a day.
- **`Sensor − Mass`**: `Sensor` knows only a quadratic error, so the result has no bound
  and no error of its least accurate term. Its values show the digits of its quadratic
  error.
- **`0.2·Fraction`**: the worked example of [The coefficients](#the-coefficients), the
  equation `r = 2·x` at the scale 5. `Fraction` is known to half its step, 0.00005, so
  the result is known to `0.2 × 0.00005 = 0.00001`: half its own step.
- **`[]`**: the empty combination, the constant 0.

## Errors

| Case                                                                                                                                                                              | Error                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| the constructor: the spec not an object; `name` not a non-empty string; `terms` not an array; a term not a pair `[a, T]`; `a` not a quantity; `T` not a class of bounded integers | `TypeError`                          |
| the constructor: the constants of a term class invalid; a scale of the result beyond `−308 … 323`                                                                                 | `RangeError`, as `define`            |
| `combine`, `combineBlinded`: the class of the result holds more integers than the class of the group                                                                              | `RangeError`, before any other check |
| `combine`, `combineBlinded`: the inputs not an array; an input not an object; a `type`, a `value.constructor` or a `blinding.constructor` not the class expected                  | `TypeError`                          |
| `combine`, `combineBlinded`: a count of inputs other than the count of terms                                                                                                      | `RangeError`                         |
| `combine`, `combineBlinded`: the same commitment for two terms                                                                                                                    | `RangeError`                         |

<!--
Change History

| PR  | Summary |
|-----|---------|
-->
