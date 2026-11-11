# The blinding context

A Pedersen commitment to a value `m` is `C = m·g + r·h`, where `g` and `h` are two
generators of the group [ristretto255](ristretto255.md) and `r` is a random blinding
factor. `C` hides `m`, since every `m` is as likely given `C`; and it binds the committer
to `m`, since opening `C` to another value would reveal the discrete logarithm of `h`
to the base `g`, which [nobody knows](../generator-h.md).

The low-level entry point, `@criticaloptimisation/vc-proofs/core`, gives the class
`BlindingContext`. One instance holds the constants of one application: the group and
the generator `h`. It checks `h` against the message it was derived from when it is
built, and it makes and checks commitments with them. An application may hold several
contexts side by side, each independent of the others, and may rename the class at
import to say what its context is for.

The library knows nothing about the values it commits to. The application maps its own
numbers, such as a day count, to [bounded integers](bounded-int.md): a class that bounds
and scales them, made from [the class of the group](#the-class-of-a-group), which
`BlindingContext.boundedInt()` gives. A commitment holds the value, its class and its
blinding factor (see [Committed and Blinded](#committed-and-blinded)).

```ts
import { BlindingContext } from "@criticaloptimisation/vc-proofs/core";

const Scalar = BlindingContext.boundedInt(); // the integers of Z_ℓ, for ristretto255
const Days = Scalar.define({ name: "Days", min: -0.5, max: 65535.5 });

const context = BlindingContext.fromEncoded(publishedH, message); // synchronous
const pin = await context.serialize(); // rejects if h is not derived from message

const opening = await context.blind(Days.from(20000n)); // { commitment, value, blinding }
const opens = await context.isOpeningOf(opening); // true
```

## Values and errors

- **Immutable.** A context never changes once built. Every byte array it returns is a new
  one, which the caller may change freely.
- **Copied inputs.** The constructor copies its inputs before anything else, and works
  only on its copies (see [The validation](#the-validation)).
- **No public constructor.** Contexts come only from the static factory below.
- **Values are bounded integers.** A method that receives anything other than a bounded
  integer where it expects a value, a `bigint` and a `number` included, or than an
  element of its group where it expects an element, throws a `TypeError`. A blinding
  factor is a bounded integer of [the class of the group](#the-class-of-a-group), and
  nothing else.
- **Errors**: `TypeError` for an input that is not a valid value (wrong type, wrong
  length, a non-canonical encoding, a group without a valid `ORDER`), thrown at once by
  `fromEncoded`; `RangeError` when `h` is not the generator derived from the message, as
  the rejection of every member that awaits the validation; `RangeError` for a value
  whose class holds more integers than the group has scalars (see [blind](#blind)).

## BlindingContext

| Member                                   | Returns                                                         |
| ---------------------------------------- | --------------------------------------------------------------- |
| `static fromEncoded(h, message, group?)` | a new context, whose validation has started                     |
| `static boundedInt()`                    | the class of the integers of Z_ℓ, for ristretto255              |
| `group`                                  | the group of the context: `RistrettoElement` by default         |
| `boundedInt()`                           | the class of the integers of the group of the context           |
| `h()`                                    | a promise: the generator `h`, once validated                    |
| `serialize()`                            | a promise: the 44 bytes that identify the suite, once validated |
| `blind(x)`                               | a promise: a commitment to `x`, with its opening                |
| `isOpeningOf(opening)`                   | a promise: whether `opening` opens its commitment               |

### fromEncoded

`fromEncoded(h, message, group)` takes the published encoding of `h`, the message it
was derived from, and the [group](#the-group) of the context, `RistrettoElement` when
it is left out. It throws a `TypeError` at once when `h` or `message` is not a
`Uint8Array`, when `group.ORDER` is not a `bigint` above 1, or when `group.decode`
refuses `h`: for ristretto255, anything but 32 bytes that are the canonical encoding of
an element (RFC 9496, Section 4.3.1). Otherwise it returns a new context, synchronously,
and the validation runs in the background.

### The validation

The constructor, which every factory calls, does three things, in this order:

1. it copies `h` and `message`, synchronously, as its first statements;
2. it decodes its copy of `h`;
3. it starts the validation, on its copies only, and keeps the promise of its result.

The copy of the message goes to the validation only: the context keeps no field for it,
and has no member that gives it back. No party needs the message again once the context
is built. A caller that changes its arrays after `fromEncoded` returns, even before the
validation ends, changes nothing in the context: neither what is checked nor what is
held. The validation is private. If it is ever made public, it must make local copies
of its parameters in the same way, before its first `await`.

**The check**: `h` is valid when it equals `group.hashToGroup(message,
group.GENERATOR_DST)`. For ristretto255, that is `hash_to_ristretto255(message,
GENERATOR_DST)` ([hashToGroup](ristretto255.md#hashtogroup) under the tag of
[deriveGenerator](ristretto255.md#derivegenerator-and-generator_dst)). Anyone can repeat
it from the published `h` and message. It refuses the identity, and every other element
that is not the generator derived from the message. It does **not**:

- run the search for a small exponent of `deriveGenerator` (`h = x·g` with
  `|x| ≤ 2¹⁶`): that refusal belongs to the choice of the message, made once, and the
  vectors of [The generator h](../generator-h.md#test-vectors) record it. It costs about
  70 ms in Node.js, where the check costs about 1 ms;
- say who chose the message, nor anything about the offline searches for a weak `h`.

**Who awaits it.** The validation hashes on WebCrypto, so its result is a promise, kept
by the context. Every member that yields `h`, or anything computed from `h`, awaits it
first: `h()`, `serialize()`, `blind()` and `isOpeningOf()`. When the check fails, each of
them rejects with the same `RangeError`, every time it is called, before it looks at its
argument; nothing else of the context runs. `group` and `boundedInt()` do not await it:
`g` is defined by its value, which the group publishes (RFC 9496 for ristretto255), and
the class of the group depends on its order only.

A context is checked once: it is immutable, so nothing ever revalidates it. An
application that wants to fail at load time awaits `serialize()` once, which it needs
for its pin anyway. A context that fails its check and is never used does not cause an
unhandled rejection.

### group

`group` is the group given to `fromEncoded`, by default the class `RistrettoElement`
itself. The canonical generator is `context.group.canonicalGenerator()`; for
ristretto255, the neutral element is `context.group.identity()`.

### boundedInt

`BlindingContext.boundedInt()` is the class of the integers of Z_ℓ, for ristretto255, the
default group: the class of the blinding factors, and the base of the classes of the
values (see [The class of a group](#the-class-of-a-group)). It needs no context, so an
application can make its classes when it loads, before any context exists.

`context.boundedInt()` is the class of the group of the context. For a context over
ristretto255 it is the same object as `BlindingContext.boundedInt()`. For a context over
another group, it is the class of that group, made once for the group and shared by all
of its contexts.

Each call returns the same object for the same group: the class is made at its first
use, then kept.

### serialize

The **suite** of a context is the group and the generator `h`: that is all a prover
written from scratch needs, from the [protocol](../protocol.md), to produce the same
commitments. `serialize()` resolves to the ASCII bytes of `group.SUITE_NAME`, then
`h.encode()`, in a new array. For ristretto255, these are 44 bytes:

| Bytes | Content                                                           |
| ----- | ----------------------------------------------------------------- |
| 0-11  | the 12 ASCII bytes `Ristretto255`, hex `52697374726574746f323535` |
| 12-43 | the canonical 32-byte encoding of `h`                             |

Within one group, both parts have a fixed length, so the string needs no version tag
and no length prefix. These are the bytes that digest pinning hashes.

The serialization holds neither the message nor `GENERATOR_DST`. How `h` was obtained is
the evidence that nothing is up anyone's sleeve, not a part of the suite: another
deterministic, hash-like derivation from a published input that gave the same `h`
would be equally good evidence, and the suite would not change. A bare "`h` is 0x…" is
no evidence, since it has no input. The context uses the message for its check only: it
neither keeps nor serializes it.

For the age-check context of [The generator h](../generator-h.md#vector-age-check):

```text
52697374726574746f323535249aa3ca590fa8d666326390ef5b7b422b92231a320746e5013c9be76e407347
```

### blind

`blind(x)` resolves to the opening of a new commitment to `x`, a frozen
[`Blinded`](#committed-and-blinded) `{ commitment, value, blinding }`:

- `commitment` is `m·g + r·h`, with `m` the integer `x.value`, in steps of its class,
  not the decimal it stands for;
- `value` is `x` itself;
- `blinding` is `r`, a bounded integer of [the class of the group](#the-class-of-a-group),
  drawn at random for each commitment with the `randomScalar()` of the group, and never
  0 (`C = m·g` would hide nothing). It is returned, since the holder needs it later for
  the proofs. No method accepts an `r` chosen by the caller for a new commitment.

**The class of `x` must fit the group.** It holds the integers `low … high` of its class
(see [The range of a class](bounded-int.md#the-range-of-a-class)), and the commitment
binds `m mod ℓ`, `ℓ` the `ORDER` of the group. So `blind` requires that the class holds
at most `ℓ` integers, `high − low + 1 ≤ ℓ`: then no two of them are equal mod `ℓ`, and
the commitment binds exactly one value of the class. A negative value is therefore
committed as it is: `−12` of a class of `[−7.99, 15.995)` gives `(ℓ − 12)·g + r·h`, which
no other value of that class gives. Every class made from
[the class of the group](#the-class-of-a-group) fits it. A class that does not is a
`RangeError`, as a rejection, whose message names the class and the group, and prints no
number: `BlindingContext.blind: Wide holds more values than the group Ristretto255 has
scalars`.

Anything other than a bounded integer, a `bigint` and a `number` included, is a
`TypeError`, as a rejection. `blind` of 0 is allowed, and gives `r·h`.

### isOpeningOf

`isOpeningOf(opening)` resolves to whether `opening.commitment = m·g + r·h`, with `m` the
integer of `opening.value` and `r` that of `opening.blinding`. The `opening` is a
[`Blinded`](#committed-and-blinded), from `blind` or built by the caller: a wallet
rebuilds one from the commitment and the blinding factor that the issuer sent, and
checks it once, on receipt, before it keeps it.

It rejects with a `TypeError` when `opening` is not an object; when `opening.value` is
not a bounded integer; when `opening.blinding` is not a bounded integer of exactly
[the class of the group](#the-class-of-a-group) of the context, a `bigint` included; and
when the `equals` of the group's elements refuses `opening.commitment`. It rejects with
the `RangeError` of `blind` when the class of `opening.value` does not fit the group.

It computes `r·h` as `(r + s)·h − s·h`, with a fresh random `s`, so that `h` is never
multiplied by the long-lived `r` itself (see [Constant time](#constant-time)). `r + s`
is a sum of `bigint`s, which the multiplication reduces mod `ℓ`. **Check a witness
once, on receipt**, not at each use.

### The queue of blindings

Most of the cost of `blind` is the multiplication `r·h`, about three quarters of it;
drawing `r` is negligible. Each context therefore keeps a queue of up to 10 pairs
`(x, x·h)`, with `x` random and never 0, each used once, by `blind` (as `(r, r·h)`) or by
`isOpeningOf` (as `(s, s·h)`).

- The scalars `x` come from the `randomScalar()` of the group; a draw of `0n` is
  dropped.
- The queue starts filling at the first call to `blind` or `isOpeningOf`, after the
  validation succeeded. A context that is invalid, or never used for them, holds no
  random scalar.
- It is refilled in the background, one pair per macrotask (`setTimeout`), so that the
  program is never held for more than one multiplication at a time, and the refill runs
  while the program waits on I/O.
- A call that finds the queue empty computes its pair on the spot: it never waits for
  the queue.
- Contexts do not share their queues.

## The class of a group

The values a context commits to, and its blinding factors, are
[bounded integers](bounded-int.md). Their base is the class of the group, which
[boundedInt](#boundedint) gives: the integers `0 … ℓ − 1`, `ℓ` the `ORDER` of the group.
For ristretto255, it is `BlindingContext.boundedInt()`, named `Ristretto255Scalar`. It is
a subclass of the class of [bounded integers](bounded-int.md): that page documents every
member it inherits, `define` included, and only its constants differ.

| Constant | On `BlindingContext.boundedInt()`       |
| -------- | --------------------------------------- |
| `scale`  | `0`                                     |
| `min`    | `-0.5`                                  |
| `max`    | `ℓ − 0.5`, kept as `[10n * ℓ - 5n, -1]` |
| `error`  | absent: ½ step                          |

- **The bounds** `[−0.5, ℓ − 0.5)` are `ℓ` equal buckets of width 1, one for each integer
  from 0 to `ℓ − 1`: every value of `[i − 0.5, i + 0.5)` rounds to `i`. The bounds
  `{ min: 0n, max: ℓ }` would hold `ℓ + 1` integers: `max` is excluded, but the values
  just below it, such as `ℓ − 0.1`, round to `ℓ`.
- **`low` and `high`** are `0n` and `ℓ − 1n`: the class holds `ℓ` integers, as many as the
  group has scalars, so the blinding factors drawn from the group cover all of them.
- **The class of the blinding factors.** The context makes its blinding factors with
  `fromValue` of this class, and refuses any other class as a blinding factor. The class
  is made with a scale of 0, so that its integers are the scalars themselves, with no step
  and no offset: the context checks it, `scale` 0, `low` `0n` and `high` `ℓ − 1n`, when it
  makes it.
- **No class made from it holds more than `ℓ` integers.** A class holds no more values
  than its parent (see [The range of a class](bounded-int.md#the-range-of-a-class)), so
  every class made from the class of the group, by `define` or by hand, and every class
  made from one of them, holds at most `ℓ` integers, else a `RangeError`: when it is made
  by `define`, at its first use when it is written by hand. No class needs to state `ℓ`.
  A range of at most `ℓ` consecutive integers holds no two that are equal mod `ℓ`, so the
  group tells apart every value of such a class, and [blind](#blind) takes it.
- **`define`** is the `define` of [bounded integers](bounded-int.md#define):
  `Scalar.define({ name, min, max, step?, error? })`, typed as the class it is called on.
- **No `number`.** The values of the class need 76 digits, more than a `number` holds, so
  `from(5)` is a `TypeError`, and `from(5n)` is `5n`. A class of a narrower range made
  from it, such as `Mass`, takes a `number`.
- **Frozen**, like the classes made by `define`.
- **One class per group.** Over another group, the class has the same constants, with the
  `ORDER` of that group in place of `ℓ`, and the name `<SUITE_NAME>Scalar`. Every context
  of one group shares it. Two groups never share a class, even with the same order.

```ts
import { BlindingContext, RistrettoElement } from "@criticaloptimisation/vc-proofs/core";

const ℓ = RistrettoElement.ORDER;
const Scalar = BlindingContext.boundedInt(); // Ristretto255Scalar
Scalar.from(19_000n).value; // 19000n
Scalar.from([15n, -1]).value; // 2n: 1.5, rounded to the step, ties to even
Scalar.from([-5n, -1]).value; // 0n: −0.5, a tie, goes to 0
Scalar.from(-1n); // RangeError: below Ristretto255Scalar.min
Scalar.from(5); // TypeError: Ristretto255Scalar needs 76 digits, more than a number holds

Scalar.high === ℓ - 1n; // true

const Mass = Scalar.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 }); // 1001 values
Mass.from(2.3).value; // 23n
const Byte = Scalar.define({ name: "Byte", min: -0.5, max: 255.5 }); // 256 values
const Percent = Byte.define({ name: "Percent", min: -0.5, max: 100.5 }); // 101 values
Scalar.define({ name: "Full", min: 0n, max: ℓ }); // RangeError: ℓ + 1 values
Byte.define({ name: "Word", min: -0.5, max: 65535.5 }); // RangeError: more values than Byte
```

## Committed and Blinded

A commitment travels in two forms, two plain structures that anyone may build. The entry
point exports them as types.

**`Committed<E>`**, `{ commitment, type }`, is what a verifier has: the commitment, an
element of the group, and `type`, the class of the value it commits to, which the
application knows from the claim. It holds no opening.

**`Blinded<E>`**, `{ commitment, value, blinding }`, is what the holder of a commitment
has: the commitment and its opening, the value, a bounded integer, and the blinding
factor, a bounded integer of [the class of the group](#the-class-of-a-group). The class
of the value is `value.constructor`, so a `Blinded` does not repeat it. The `Committed` of
a `Blinded` `b` is `{ commitment: b.commitment, type: b.value.constructor }`.

```ts
interface Committed<E = RistrettoElement> {
  readonly commitment: E;
  readonly type: typeof BoundedInt; // the class of the value
}

interface Blinded<E = RistrettoElement> {
  readonly commitment: E;
  readonly value: BoundedInt; // its class is value.constructor
  readonly blinding: BoundedInt; // of the class of the group, 1 … ℓ − 1
}
```

`blind` returns a frozen `Blinded`. Any other `Blinded` is checked with
[isOpeningOf](#isopeningof) before it is trusted. A wallet receives the commitment and
the blinding factor as bytes signed by the issuer; it keeps those bytes and the signature
for its proofs, since it cannot sign them again, and builds a `Blinded` for its own use:

```ts
const Scalar = BlindingContext.boundedInt();
const Days = Scalar.define({ name: "Days", min: -0.5, max: 65535.5 });

const opening = await context.blind(Days.from(20000n));
opening.value.constructor === Days; // true
await context.isOpeningOf(opening); // true

// What the verifier holds: the commitment and the class of the claim.
const committed: Committed = { commitment: opening.commitment, type: Days };

// What a wallet rebuilds from the bytes of the issuer.
const received: Blinded = {
  commitment: RistrettoElement.decode(commitmentBytes),
  value: Days.fromValue(days),
  blinding: Scalar.fromValue(RistrettoElement.decodeScalar(blindingBytes)),
};
await context.isOpeningOf(received); // whether the issuer's opening holds
```

The encoding of these structures into bytes, and the signature of the issuer, belong to
the [protocol](../protocol.md), not to the context.

## The group

The context does its arithmetic only through its group, a value held in a field, and
never names `RistrettoElement` itself: `RistrettoElement` is only the default of
`fromEncoded`. The scalars of every group are `bigint`s
([Scalars](ristretto255.md#scalars)), so a group has no scalar type. A group is any
object with these members, which `RistrettoElement` has (see
[ristretto255](ristretto255.md#suite_name-and-randomscalar)):

| Member of the group         | Used for                                                    |
| --------------------------- | ----------------------------------------------------------- |
| `SUITE_NAME`                | the first bytes of `serialize()`, and the name of its class |
| `GENERATOR_DST`             | the tag of the check of `h`                                 |
| `ORDER`                     | the order `ℓ` of the group, a `bigint`: its class           |
| `decode(bytes)`             | decoding `h` in `fromEncoded`                               |
| `hashToGroup(message, dst)` | the check of `h`                                            |
| `canonicalGenerator()`      | `g`, in every commitment                                    |
| `randomScalar()`            | the blinding factors and the masks of `isOpeningOf`         |

Its elements need `encode`, `equals`, `add`, `subtract` and `multiplyScalar(n)`, with
`n` a `bigint`. The context checks itself that a value is a bounded integer; an element
argument is checked by the `equals` of the group's elements, which throws a `TypeError`
for anything else. The context checks that `ORDER` is a `bigint` above 1, since it makes
its class from it; it trusts the other members of its group, and its arithmetic.

**In TypeScript**, a group is the interface `Group<E>`, of elements `E`, and the class
is `BlindingContext<E>`, whose parameter defaults to `RistrettoElement`. The parameter
is inferred from the group given to `fromEncoded`, so a caller never writes it: `h()` of
a ristretto255 context is a `Promise<RistrettoElement>`, not an `any`, and the
`commitment` of `blind` is a `RistrettoElement`. It exists only for the type checker:
there is one class at run time, and the group in its field does all the work. A class
held in a variable cannot be called with `new` when its constructor is private, as the
constructor of `RistrettoElement` is; the context uses only the static members of its
group. The entry point exports `Group`, `Committed` and `Blinded` as types.

## Constant time

The rules of [ristretto255](ristretto255.md#constant-time) apply. The context follows
them:

- `m·g` is a multiplication of the canonical generator, which `@noble/curves` handles on
  its own path;
- `r·h` uses a fresh `r` for each commitment, so `h` is never multiplied twice by the same
  secret in `blind`;
- the sum `r + s` of `isOpeningOf` is `bigint` arithmetic, whose timing depends on the
  sizes of `r` and `s`: both are below `ℓ`, as integers of the class of the group;
- `isOpeningOf` masks the long-lived `r` of a witness with a fresh `s`, and is meant to
  run once per witness;
- the pairs of the queue are secret, like the blinding factors they become: they stay in
  the private fields of their context.

## Test vectors

`test/vectors/blinding-context.json` gives the serialization of the age-check context
and two commitments `C = m·g + r·h` with fixed `m` and `r`, one with `m = 0`. The
scalars are 32-byte little-endian encodings, which the tests read as `bigint`s, then as
values of the class of the group. `tools/blinding-context/reference.py` computes them
apart from the TypeScript code, on the Python arithmetic of
`tools/generator-h/reference.py`, and recomputes every commitment with libsodium:

```sh
python3 tools/blinding-context/reference.py check
```

The tests reach a fixed `r` through a seam of `src/core/blinding-context.ts` that the
entry point does not export.

<!--
Change History

| PR  | Summary |
|-----|---------|
| #40 | new: BlindingContext, its group, validation, serialization and commitments, on bigint scalars; BoundedInt passes its value (#39) |
| #47 | a subclass bounds and scales its value, with no salt (#44) |
-->
