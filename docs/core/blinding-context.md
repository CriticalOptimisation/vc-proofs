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
numbers, such as a day count, to scalars, which are `bigint`s
([Scalars](ristretto255.md#scalars)), through [`BoundedInt`](bounded-int.md): it passes
`BoundedInt.from(n).value`, or the `value` of a subclass that bounds, scales or salts
`n`.

```ts
import { BlindingContext } from "@criticaloptimisation/vc-proofs/core";

const context = BlindingContext.fromEncoded(publishedH, message); // synchronous
const pin = await context.serialize(); // rejects if h is not derived from message

const { commitment, blinding } = await context.blind(20000n); // blinding is a bigint
const opens = await context.isOpeningOf(20000n, blinding, commitment);
```

## Values and errors

- **Immutable.** A context never changes once built. Every byte array it returns is a new
  one, which the caller may change freely.
- **Copied inputs.** The constructor copies its inputs before anything else, and works
  only on its copies (see [The validation](#the-validation)).
- **No public constructor.** Contexts come only from the static factory below. A method
  that receives anything other than a `bigint` where it expects a scalar (a `number` and
  a `BoundedInt` included), or than an element of its group where it expects an element,
  throws a `TypeError`, as in [ristretto255](ristretto255.md#values-and-errors). Every
  scalar it returns is a `bigint`.
- **Errors**: `TypeError` for an input that is not a valid value (wrong type, wrong
  length, a non-canonical encoding), thrown at once by `fromEncoded`; `RangeError` when
  `h` is not the generator derived from the message, as the rejection of every member
  that awaits the validation.

## BlindingContext

| Member                                      | Returns                                                         |
| ------------------------------------------- | --------------------------------------------------------------- |
| `static fromEncoded(h, message, group?)`    | a new context, whose validation has started                     |
| `group`                                     | the group of the context: `RistrettoElement` by default         |
| `h()`                                       | a promise: the generator `h`, once validated                    |
| `serialize()`                               | a promise: the 44 bytes that identify the suite, once validated |
| `blind(scalar)`                             | a promise: a commitment to `scalar` and its blinding factor     |
| `isOpeningOf(scalar, blinding, commitment)` | a promise: whether `(scalar, blinding)` opens `commitment`      |

### fromEncoded

`fromEncoded(h, message, group)` takes the published encoding of `h`, the message it
was derived from, and the [group](#the-group) of the context, `RistrettoElement` when
it is left out. It throws a `TypeError` at once when `h` or `message` is not a
`Uint8Array`, or when `group.decode` refuses `h`: for ristretto255, anything but 32
bytes that are the canonical encoding of an element (RFC 9496, Section 4.3.1).
Otherwise it returns a new context, synchronously, and the validation runs in the
background.

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
them rejects with the same `RangeError`, every time it is called; nothing else of the
context runs. `group` does not await it: `g` is defined by its value, which the group
publishes (RFC 9496 for ristretto255).

A context is checked once: it is immutable, so nothing ever revalidates it. An
application that wants to fail at load time awaits `serialize()` once, which it needs
for its pin anyway. A context that fails its check and is never used does not cause an
unhandled rejection.

### group

`group` is the group given to `fromEncoded`, by default the class `RistrettoElement`
itself. The canonical generator is `context.group.canonicalGenerator()`; for
ristretto255, the neutral element is `context.group.identity()`.

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

`blind(scalar)` resolves to `{ commitment, blinding }`, with `commitment = m·g + r·h`,
`m` the scalar and `r` the blinding factor. Both are `bigint`s. `m` may be any integer:
since `g` has the order `ℓ` of the group, the commitment binds `m mod ℓ`, so `blind(m)`
and `blind(m + ℓ)` commit to the same value. `r` is drawn at random for each commitment,
with the `randomScalar()` of the group, is never `0n` (`C = m·g` would hide nothing),
and is returned, since the holder needs it later for the proofs. No method accepts an
`r` chosen by the caller for a new commitment. `blind(0n)` is allowed, and gives `r·h`.
A `scalar` that is not a `bigint`, a `number` or a `BoundedInt` included, is a
`TypeError`, as a rejection.

A context commits to one value at a time. Whether a linear combination of commitments,
such as `C₁ − C₂`, can wrap around `ℓ` depends on the range of each value, which belongs
to [`BoundedInt`](bounded-int.md) and its subclasses, not to the context.

### isOpeningOf

`isOpeningOf(scalar, blinding, commitment)` resolves to whether `(scalar, blinding)` is
an opening of `commitment`: whether `commitment = m·g + r·h`. The wallet uses it to
check a witness when it receives one, before it keeps it.

`scalar` and `blinding` are `bigint`s, and count mod `ℓ`, as in `blind`. Either one
that is not a `bigint` is a `TypeError`, as a rejection; so is a `commitment` that is
not an element of the group, which the `equals` of the group's elements refuses.

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

## The group

The context does its arithmetic only through its group, a value held in a field, and
never names `RistrettoElement` itself: `RistrettoElement` is only the default of
`fromEncoded`. The scalars of every group are `bigint`s
([Scalars](ristretto255.md#scalars)), so a group has no scalar type. A group is any
object with these members, which `RistrettoElement` has (see
[ristretto255](ristretto255.md#suite_name-and-randomscalar)):

| Member of the group         | Used for                                            |
| --------------------------- | --------------------------------------------------- |
| `SUITE_NAME`                | the first bytes of `serialize()`                    |
| `GENERATOR_DST`             | the tag of the check of `h`                         |
| `decode(bytes)`             | decoding `h` in `fromEncoded`                       |
| `hashToGroup(message, dst)` | the check of `h`                                    |
| `canonicalGenerator()`      | `g`, in every commitment                            |
| `randomScalar()`            | the blinding factors and the masks of `isOpeningOf` |

Its elements need `encode`, `equals`, `add`, `subtract` and `multiplyScalar(n)`, with
`n` a `bigint`. The context checks itself that a scalar argument is a `bigint`; an
element argument is checked by the `equals` of the group's elements, which throws a
`TypeError` for anything else. The context trusts its group: it checks neither its
members nor its arithmetic.

**In TypeScript**, a group is the interface `Group<E>`, of elements `E`, and the class
is `BlindingContext<E>`, whose parameter defaults to `RistrettoElement`. The parameter
is inferred from the group given to `fromEncoded`, so a caller never writes it: `h()` of
a ristretto255 context is a `Promise<RistrettoElement>`, not an `any`, and the
`blinding` of `blind` is a `bigint`. It exists only for the type checker: there is one
class at run time, and the group in its field does all the work. A class held in a
variable cannot be called with `new` when its constructor is private, as the
constructor of `RistrettoElement` is; the context uses only the static members of its
group. The entry point exports `Group` as a type.

## Constant time

The rules of [ristretto255](ristretto255.md#constant-time) apply. The context follows
them:

- `m·g` is a multiplication of the canonical generator, which `@noble/curves` handles on
  its own path;
- `r·h` uses a fresh `r` for each commitment, so `h` is never multiplied twice by the same
  secret in `blind`;
- the sum `r + s` of `isOpeningOf` is `bigint` arithmetic, whose timing depends on the
  sizes of `r` and `s`: both are below `ℓ` when they come from `randomScalar()`;
- `isOpeningOf` masks the long-lived `r` of a witness with a fresh `s`, and is meant to
  run once per witness;
- the pairs of the queue are secret, like the blinding factors they become: they stay in
  the private fields of their context.

## Test vectors

`test/vectors/blinding-context.json` gives the serialization of the age-check context
and two commitments `C = m·g + r·h` with fixed `m` and `r`, one with `m = 0`. The
scalars are 32-byte little-endian encodings, which the tests read as `bigint`s.
`tools/blinding-context/reference.py` computes them apart from the TypeScript code, on
the Python arithmetic of `tools/generator-h/reference.py`, and recomputes every
commitment with libsodium:

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
-->
