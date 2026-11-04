# Bounded integers

A linear combination of committed values, such as `cutoff − DoB`, is only meaningful when
its result cannot wrap around the order `ℓ` of the group: otherwise a negative result
reads as a large positive one. Whether it can wrap depends on the range of each value,
not on the value itself. A `bigint` cannot carry a range: it is a primitive, with no own
property, and `BigInt.prototype` is shared by the whole program. So the low-level entry
point, `@criticaloptimisation/vc-proofs/core`, wraps the integer in a class,
`BoundedInt`.

Today a `BoundedInt` holds one integer and no range. The bounds, and the scaling and
salting of physical values that go with them, will be added by later issues as subclasses
with class-level constants. Everything else is in the base class.

```ts
import { BoundedInt } from "@criticaloptimisation/vc-proofs/core";

const days = BoundedInt.from(19_000); // a safe integer number is cast
days.value; // 19000n: the integer, a bigint
days.valueOf(); // 19000: a number, for display and comparison
`${days}`; // "19000"
days + 1n; // TypeError: no implicit conversion, except to a string
```

## Values and errors

- **Immutable.** The integer is held in a private field and read through `value`, which
  has no setter. No method changes the instance.
- **No public constructor.** Instances come only from `BoundedInt.from` (or from the
  `from` of a subclass).
- **An integer, not a scalar.** `BoundedInt` keeps the integer as it is, with its sign:
  it is never reduced mod `ℓ`. The group never takes a `BoundedInt`: wherever it takes
  an integer, pass `x.value` (see [The group ristretto255](ristretto255.md)). Nothing in
  the library returns a `BoundedInt`, except `from`.
- **Errors**: `TypeError` for an input of the wrong kind; `RangeError` for an integer
  that cannot be represented as asked.

## BoundedInt

| Member                       | Returns                                | Errors                                  |
| ---------------------------- | -------------------------------------- | --------------------------------------- |
| `static from(n)`             | a new instance holding the integer `n` | see [from](#from)                       |
| `value`                      | the integer, a `bigint`                | none                                    |
| `valueOf()`                  | the integer as a `number`              | `RangeError` when it is beyond a number |
| `toString()`                 | the string of `valueOf()`              | as `valueOf()`                          |
| `[Symbol.toPrimitive](hint)` | `toString()` for the hint `"string"`   | `TypeError` for any other hint          |

### from

`BoundedInt.from(n: bigint | number)` accepts an integer, as a `bigint` or as a `number`
that holds it exactly:

| `n`                                                                     | Result                                          |
| ----------------------------------------------------------------------- | ----------------------------------------------- |
| a `bigint`                                                              | kept as it is: `from(-1n).value` is `-1n`       |
| a `number` with `Number.isSafeInteger(n)`                               | `BigInt(n)`: `from(5).value` is `5n`            |
| `1.5`, `NaN`, `Infinity`, `-Infinity`                                   | `TypeError`: not an integer                     |
| an integer `number` beyond `±(2⁵³ − 1)`, such as `2 ** 60`              | `RangeError`: it has already lost its precision |
| anything else: a string, `null`, `undefined`, an object, a `BoundedInt` | `TypeError`                                     |

A `number` beyond `2⁵³ − 1` is refused rather than cast, because `2 ** 60 + 1` is
already `2 ** 60` before the call: a cast would hold a value the caller did not write.
A `BoundedInt` is refused too: a caller that has one already has its `value`. The error
messages name `from`, and the class it was called on.

`from` makes an instance of the class it is called on, so a subclass that does not
override it gets instances of its own.

### valueOf and toString

`valueOf()` is an ordinary method: it returns the integer as a `number`, for display and
for comparisons where a relative precision is enough. Up to `2⁵³` it is exact; above, it
is the nearest `number`. Beyond the range of a `number` (about `1.8·10³⁰⁸`), where the
conversion would give `±Infinity`, it throws a `RangeError`.

`toString()` returns the string of `valueOf()`, as `String` writes a `number`:
`from(-7).toString()` is `"-7"`, and `from(10n ** 21n).toString()` is `"1e+21"`. For the
exact decimal digits, write `x.value.toString()`.

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

## Subclasses

The class is meant to be extended. Its constructor is `protected`, and its instances are
not frozen, so that a subclass can call it and add fields of its own. A subclass may
override:

- `from`, to check bounds, scale a physical value or salt it with random low bits;
- `valueOf`, to undo that: mask the salt, unscale and convert;
- `toString`, which the conversion to a string then follows.

The bounds and the scaling are class-level constants of each subclass. They are not part
of this page yet.

<!--
Change History

| PR  | Summary |
|-----|---------|
| #41 | new: BoundedInt, its casts, conversions and subclasses |
-->
