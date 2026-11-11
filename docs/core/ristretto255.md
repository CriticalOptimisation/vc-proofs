# The group ristretto255

The commitments and proofs of vc-proofs work in the group ristretto255
([RFC 9496](https://www.rfc-editor.org/rfc/rfc9496.html)), of prime order
`ℓ = 2²⁵² + 27742317777372353535851937790883648493`. The low-level entry point,
`@criticaloptimisation/vc-proofs/core`, gives it the class `RistrettoElement`, an
element of the group. A scalar is a plain `bigint` (see [Scalars](#scalars)). The
integers of Z_ℓ, as bounded integers, are the class of the group that the blinding
context gives (see [The integers of Z_ℓ](#the-integers-of-z_ℓ)).

`RistrettoElement` is the only way the rest of the library handles group elements. It
holds the arithmetic of [`@noble/curves`](https://github.com/paulmillr/noble-curves), but
never exposes its types. It carries no protocol: the Pedersen context (the generators `g`
and `h` and the commitments built on them) is a class of its own, built on this one:
[the blinding context](blinding-context.md).

```ts
import { RistrettoElement } from "@criticaloptimisation/vc-proofs/core";

const h = await RistrettoElement.deriveGenerator(new TextEncoder().encode("example/h/v1"));
const r = RistrettoElement.randomScalar(); // a bigint
const blinding = h.multiplyScalar(r); // r·h
```

## Values and errors

- **Immutable.** No method changes its instance or its arguments. Each operation returns a
  new instance, and every `encode()` returns a new array, which the caller may change
  freely.
- **No public constructor.** Instances come only from the static factories below. A
  method that receives anything other than an element where it expects one, or anything
  other than a `bigint` where it expects a scalar, throws a `TypeError`. Every scalar
  that a method returns is a `bigint`.
- **Byte strings** are `Uint8Array`s, views with an offset included. Anything else, or a
  wrong length, is a `TypeError`.
- **Errors**: `TypeError` for an input that is not a valid value (wrong type, wrong
  length, invalid or non-canonical encoding); `RangeError` for a valid value that the
  operation refuses (a refused DST, a refused generator, the inverse of 0).

## RistrettoElement

| Member                             | Returns                                         | libsodium counterpart                     |
| ---------------------------------- | ----------------------------------------------- | ----------------------------------------- |
| `static decode(bytes)`             | the element of a canonical 32-byte encoding     | `crypto_core_ristretto255_is_valid_point` |
| `static canonicalGenerator()`      | `g`                                             | `crypto_scalarmult_ristretto255_base`     |
| `static identity()`                | the neutral element                             | none                                      |
| `static fromUniformBytes(bytes)`   | the element derivation of 64 bytes              | `crypto_core_ristretto255_from_hash`      |
| `static hashToGroup(message, dst)` | a promise: `hash_to_ristretto255(message, dst)` | none                                      |
| `static deriveGenerator(message)`  | a promise: a generator with nothing up a sleeve | none                                      |
| `static GENERATOR_DST`             | the domain separation tag of `deriveGenerator`  | none                                      |
| `static SUITE_NAME`                | the name of the suite: `Ristretto255`           | none                                      |
| `static randomScalar()`            | a uniformly random scalar, a `bigint`           | none                                      |
| `static ORDER`                     | `ℓ`, the order of the group, a `bigint`         | none                                      |
| `static encodeScalar(n)`           | the 32-byte encoding of `n mod ℓ`               | `crypto_core_ristretto255_scalar_reduce`  |
| `static decodeScalar(bytes)`       | the scalar of a canonical 32-byte encoding      | none                                      |
| `static invertScalar(n)`           | the inverse of `n mod ℓ`, a `bigint`            | `crypto_core_ristretto255_scalar_invert`  |
| `encode()`                         | the canonical 32-byte encoding                  | none                                      |
| `equals(other)`                    | whether both are the same element               | none                                      |
| `isIdentity()`                     | whether this is the neutral element             | none                                      |
| `add(other)`                       | `this + other`                                  | `crypto_core_ristretto255_add`            |
| `subtract(other)`                  | `this − other`                                  | `crypto_core_ristretto255_sub`            |
| `negate()`                         | `−this`                                         | none                                      |
| `multiplyScalar(n)`                | `n·this`, for any `bigint` `n`                  | `crypto_scalarmult_ristretto255`          |

### decode and encode

`decode` is the decoding of
[RFC 9496, Section 4.3.1](https://www.rfc-editor.org/rfc/rfc9496.html#section-4.3.1). It
throws a `TypeError` for anything but 32 bytes that are the canonical encoding of an
element: every encoding of RFC 9496, Appendix A.2, is refused. `encode` is the encoding of
[Section 4.3.2](https://www.rfc-editor.org/rfc/rfc9496.html#section-4.3.2), so
`decode(P.encode())` equals `P`, and `decode(bytes).encode()` gives `bytes` back.

Decoding checks only that the bytes encode an element. It says nothing about where the
element came from: see [Runtime use](../generator-h.md#runtime-use) for a published
generator.

### The identity

The neutral element is a valid element, encoded as 32 zero bytes. `decode` accepts it, as
RFC 9496 and libsodium do; `identity()` returns it, and `isIdentity()` tells it apart.
`P.subtract(P)`, `P.add(P.negate())` and `P.multiplyScalar(0n)` all give it.

Whether a caller may receive the identity is that caller's policy, decided by each
caller: a commitment equal to the identity, for instance, may be refused by the code
that reads it. Such a caller checks `isIdentity()` after `decode`.

### equals

`equals` is the equality of
[RFC 9496, Section 4.3.3](https://www.rfc-editor.org/rfc/rfc9496.html#section-4.3.3), as
`@noble/curves` implements it: it computes both of the RFC's comparisons before it
combines them, and it does not encode either element.

### multiplyScalar

`P.multiplyScalar(n)` is `n·P` for any `bigint` `n` (see [Scalars](#scalars)): the sum
of `n` copies of `P` for `n > 0`, the identity for `n = 0`, and `(−n)·(−P)` for `n < 0`.
It throws a `TypeError` when `n` is not a `bigint`: a `number` and a `BoundedInt` are
refused too (see [Scalars](#scalars)).

Since `ℓ·P` is the identity, `n·P` depends only on `n mod ℓ`. So `multiplyScalar`
first reduces `n` mod `ℓ`, with the `Fn` of `@noble/curves`, and multiplies by the
reduced value only: `multiplyScalar(n + ℓ)` and `multiplyScalar(n − ℓ)` equal
`multiplyScalar(n)`. That is an optimization, not a part of the definition.

It then uses the fixed-window multiplication of `@noble/curves`, whose sequence of
point operations does not depend on the scalar (see [Constant time](#constant-time)).
That multiplication refuses 0. So when `n mod ℓ` is zero, `multiplyScalar` still calls
it, with the scalar 1 in place of 0, does not use its product, and returns the identity.
The multiplication thus runs for every scalar: its timing does not reveal whether
`n mod ℓ` is zero, as a return before the call would.

libsodium's `crypto_scalarmult_ristretto255` refuses a result equal to the identity;
`multiplyScalar` returns it.

### fromUniformBytes

`fromUniformBytes(bytes)` is the element derivation of
[RFC 9496, Section 4.3.4](https://www.rfc-editor.org/rfc/rfc9496.html#section-4.3.4):
`MAP` of each 32-byte half of its 64 bytes, and the sum of the two. It throws a
`TypeError` for any length but 64. It is what libsodium calls
`crypto_core_ristretto255_from_hash`, and RFC 9380 calls `ristretto255_map`. The input
must be uniformly random, such as the output of a hash: on other inputs, the derived
element is not uniformly distributed.

### hashToGroup

`hashToGroup(message, dst)` is `hash_to_ristretto255` of
[RFC 9380, Appendix B](https://www.rfc-editor.org/rfc/rfc9380.html#appendix-B), with
`expand_message_xmd` over SHA-512
([Section 5.3.1](https://www.rfc-editor.org/rfc/rfc9380.html#section-5.3.1)):

```text
hashToGroup(message, dst) = fromUniformBytes(expand_message_xmd(SHA-512, message, dst, 64))
```

SHA-512 comes from WebCrypto, so `hashToGroup` returns a promise. Both arrays are read at
the call: a change to them while the promise runs does not change the result.

`message` may have any length. `dst` must have from 1 to 255 bytes; the promise rejects
with a `RangeError`:

- for an empty `dst`: RFC 9380, [Section 3.1](https://www.rfc-editor.org/rfc/rfc9380.html#section-3.1),
  requires a tag of nonzero length;
- for a `dst` longer than 255 bytes: RFC 9380,
  [Section 5.3.3](https://www.rfc-editor.org/rfc/rfc9380.html#section-5.3.3), reduces
  such a tag to a hash of itself first. That reduction is not yet implemented, and the
  error says so.

It rejects with a `TypeError` when `message` or `dst` is not a `Uint8Array`.

RFC 9380 publishes no test vector for `hash_to_ristretto255`. Its two stages have
vectors of their own: `expand_message_xmd` in RFC 9380, Appendix K.3, and the element
derivation in RFC 9496, Appendix A.3. The whole chain is checked on the vectors of
[The generator h](../generator-h.md#test-vectors), which three implementations agree on.

### deriveGenerator and GENERATOR_DST

`deriveGenerator(message)` derives a Pedersen generator, such as `h`, with nothing up
anyone's sleeve. It is `hashToGroup(message, RistrettoElement.GENERATOR_DST)`, and it
then refuses, with a `RangeError`, an element `x·g` with `|x| ≤ 2¹⁶`, which no correct
hash produces. [The generator h](../generator-h.md) gives the construction, the tag, the
trust argument and the vectors.

`GENERATOR_DST` is the 60-character tag of every generator that vc-proofs derives:

```text
vc-proofs-V01-CS01-with-ristretto255_XMD:SHA-512_R255MAP_RO_
```

To check a published encoding against its message:

```ts
const derived = await RistrettoElement.deriveGenerator(message);
const valid = derived.equals(RistrettoElement.decode(published)); // decode throws on bad bytes
```

### SUITE_NAME and randomScalar

With `SUITE_NAME` and `randomScalar`, the class `RistrettoElement` is a
[group](blinding-context.md#the-group) for a blinding context, which uses no other group
by default. `SUITE_NAME` is the string `Ristretto255`, which begins the serialization of
a context. `randomScalar()` gives the random scalars a context draws. It needs the order
`ℓ` of the group, like the four members below: it reduces 64 random bytes mod `ℓ`, with
the `Fn` of `@noble/curves` (see [Scalars](#scalars)). It belongs to `RistrettoElement`
for the same reason as they do, `ℓ`; unlike them, it is also a member of the group of a
blinding context.

### ORDER, encodeScalar, decodeScalar and invertScalar

These four members, with `randomScalar` (see above), are the scalar operations that need
the order `ℓ` of the group. They are pure operations on `bigint`s; they belong to
`RistrettoElement` because `ℓ` does. Unlike `randomScalar`, they are not members of the
[group of a blinding context](blinding-context.md#the-group), which does not use them.

- **`ORDER`** is `ℓ = 2²⁵² + 27742317777372353535851937790883648493`, a `bigint`.
- **`encodeScalar(n)`** returns the 32 little-endian bytes of `n mod ℓ`, in a new array.
  So `encodeScalar(n + ℓ)` and `encodeScalar(n − 2ℓ)` equal `encodeScalar(n)`, and
  `encodeScalar(-1n)` is the encoding of `ℓ − 1`: the cyclicity of the group is taken
  care of on the way out. It throws a `TypeError` when `n` is not a `bigint`.
- **`decodeScalar(bytes)`** returns the `bigint` of 32 little-endian bytes, from `0n` to
  `ℓ − 1`. It throws a `TypeError` for anything but a `Uint8Array` of 32 bytes (a view
  with an offset is read as its bytes), and for the encoding of an integer `≥ ℓ`, which
  is not canonical: it does not reduce it. So every scalar has exactly one encoding,
  which a signature or the transcript of a proof needs. The two functions are inverses:
  `decodeScalar(encodeScalar(n))` is `n mod ℓ`, and `encodeScalar(decodeScalar(bytes))`
  gives `bytes` back.
- **`invertScalar(n)`** returns the inverse of `n mod ℓ` in the field of scalars, from
  `1n` to `ℓ − 1`: `n · invertScalar(n) ≡ 1 (mod ℓ)`. This is not the inverse in the
  integers, which exists only for `±1`. It throws a `RangeError` when `n ≡ 0 (mod ℓ)`,
  which has no inverse, and a `TypeError` when `n` is not a `bigint`. It computes
  `(n mod ℓ)^(ℓ − 2)` with the `Fn` of `@noble/curves`: the exponent is public, unlike
  the steps of an extended Euclid, which depend on `n`.

## Scalars

A scalar is a `bigint`, any integer: there is no scalar class. `n·P` is `P` added to
itself `n` times, `(((P + P) + P) + …) + P`. However cyclic the group, nothing bounds the
number of additions, so `n` is any non-negative integer. And since `−P` is the element
`Q` such that `Q + P` is the identity, `n·P` for `n < 0` is `(−n)·(−P)`. So `n·P` is
defined for every integer `n`, in any group.

- **Reduction.** Every operation that uses a scalar reduces it mod `ℓ` before anything
  else, as an optimization (see [multiplyScalar](#multiplyscalar)). A caller never needs
  to reduce a scalar itself, and may pass negative and large values.
- **Arithmetic.** The sum, difference and product of scalars are the `+`, `−` and `*` of
  `bigint`. Besides them, `RistrettoElement` gives the operations that need `ℓ`:
  `invertScalar`, `encodeScalar` and `decodeScalar` (see
  [ORDER, encodeScalar, decodeScalar and invertScalar](#order-encodescalar-decodescalar-and-invertscalar)).
- **`randomScalar()`** reads 64 bytes from `crypto.getRandomValues` as a little-endian
  integer, and reduces it mod `ℓ`: a `bigint` from `0` to `ℓ − 1`. Reducing 512 bits mod
  `ℓ` leaves a bias below `2⁻²⁵⁹`. It may return `0n`, with probability `1/ℓ`; a caller
  that needs a non-zero scalar draws again.
- **`bigint`s in, `bigint`s out.** Where a scalar is expected, anything other than a
  `bigint` is a `TypeError`, an integer `number` included. Every scalar returned is a
  `bigint`, never a `number`.
- **From the numbers of an application.** The group converts nothing: only the
  application knows how a value of its own, such as a day count, is bounded and scaled.
  That conversion belongs to the [bounded integers](bounded-int.md) made from the
  integers of Z_ℓ (see [The integers of Z_ℓ](#the-integers-of-z_ℓ)). The group takes their
  `value`: with `Scalar = context.boundedInt()`, for a context over `RistrettoElement`,
  `P.multiplyScalar(Scalar.from(5n).value)` is `P.multiplyScalar(5n)`, and
  `P.multiplyScalar(Scalar.from(5n))` is a `TypeError`.
- **Ranges.** Whether a linear combination of committed values can wrap around `ℓ`
  depends on the range of each value, not on the value itself. The group knows no range:
  ranges belong to the classes of [`BoundedInt`](bounded-int.md#the-class-constants),
  and the linear combinations check them against `ORDER` (#31). The class of the
  integers of Z_ℓ holds `ℓ` integers, and no class made from it holds more
  (see [The integers of Z_ℓ](#the-integers-of-z_ℓ)).

## The integers of Z_ℓ

The bounded integers of ristretto255, the integers `0 … ℓ − 1` and the classes made from
them, come from the blinding context, which commits to them: `context.boundedInt()`, for
a context over `RistrettoElement` (see
[The class of a group](blinding-context.md#the-class-of-a-group)).

## Constant time

No JavaScript code can promise constant time: `bigint` operations, the JIT compiler and
the garbage collector all have timings that depend on data. The classes do what can be
done above that:

- every operation on field elements is a method of the `Fp` (the field of edwards25519)
  of `@noble/curves`; the reduction of a scalar mod `ℓ`, `randomScalar`, `encodeScalar`,
  `decodeScalar` and `invertScalar` are methods of its `Fn`, never operations of our own
  on `bigint`;
- the selections of RFC 9496 (`CT_SELECT`, `CT_ABS`) use `Fp.cmov`, not a JavaScript
  conditional;
- `multiplyScalar` uses the fixed-window multiplication of `@noble/curves`, whose sequence
  of point operations does not depend on the scalar, and runs it for every scalar, a
  scalar that reduces to 0 included (see [multiplyScalar](#multiplyscalar));
- `equals` computes both comparisons of RFC 9496 before it combines them.

`@noble/curves` states two limits, which therefore apply here:

- its field operations are not constant time;
- on Edwards curves, ristretto255 included, it does not blind the multiplication of a
  point **other than `g`** by a secret scalar. An attacker who could time many such
  multiplications by the **same** scalar might learn bits of it.

**The rule for callers**: never multiply a point other than `g` by the same secret scalar
more than once. Draw a fresh scalar for each use instead, as for the blinding factor `r`
of a commitment (`r·h`) and the nonce `k` of a proof (`k·h`). A long-lived secret, such as
a witness kept by the wallet, enters a proof through scalar arithmetic
(`z = k + c·r`), never through a point multiplication. Followed, the rule leaves the
attacker one timing per secret, which is not enough for the attack.

The `+`, `−` and `*` that callers write on scalars are the `bigint` arithmetic of
JavaScript (see [Scalars](#scalars)), whose timing depends on the size of its operands.
The reduction mod `ℓ` at the start of each multiplication bounds the size of what the
multiplication itself works on.

## Checked against libsodium

The tests check `RistrettoElement` against the RFC vectors and against
[libsodium](https://github.com/jedisct1/libsodium), an implementation in C written apart
from `@noble/curves` and from this code. They load libsodium 1.0.22, compiled to
WebAssembly by [libsodium.js](https://github.com/jedisct1/libsodium.js)
(`libsodium-wrappers-sumo`), in each runtime of the test suite. That package is a
development dependency only: the published package does not contain it, and `src/`
cannot import it.

- **The RFC vectors**: RFC 9496, Appendix A.1 (the multiples `0·g` to `15·g`), A.2 (the
  encodings `decode` refuses) and A.3 (the element derivation), and RFC 9380, Appendix
  K.3 (`expand_message_xmd` over SHA-512). libsodium itself is first checked on A.1 and
  A.3, then the class is.
- **Differential tests**: 64 inputs, derived from a counter by SHA-512, so that a failure
  is reproducible. On them, every operation that has a libsodium counterpart in the
  table above returns the bytes that libsodium returns, and `decode` accepts exactly the
  encodings that `crypto_core_ristretto255_is_valid_point` accepts. `multiplyScalar` is
  checked on 512-bit scalars, which it reduces mod `ℓ`, against
  `crypto_core_ristretto255_scalar_reduce` and `crypto_scalarmult_ristretto255`.
  `encodeScalar` of a 512-bit integer is `crypto_core_ristretto255_scalar_reduce` of its
  64 bytes, and of its negation `crypto_core_ristretto255_scalar_negate` of that
  reduction; `invertScalar` is `crypto_core_ristretto255_scalar_invert`; and
  `decodeScalar` reads libsodium's encodings back.

Expected values come either from the text of an RFC or from libsodium, never from code
of vc-proofs. libsodium has no `hash_to_ristretto255`; `hashToGroup` is checked as
[hashToGroup](#hashtogroup) says.

<!--
Change History

| PR  | Summary |
|-----|---------|
| #38 | new: RistrettoElement and RistrettoScalar (#35) |
| #40 | links the blinding context; SUITE_NAME and randomScalar; scalars are bigints, RistrettoScalar removed; ORDER, encodeScalar, decodeScalar, invertScalar; multiplyScalar runs its multiplication for a scalar that reduces to 0 (#39) |
| #47 | values are bounded and scaled, never salted; ranges belong to the classes (#44) |
| #51 | section BoundedInt: the integer of Z_ℓ, its constants, define without order; from(5n) in Scalars (#49) |
| #53 | section BoundedInt: no order; low and high; no class made from it holds more than ℓ integers; the generic define (#52) |
| #55 | section The integers of Z_ℓ, moved to the blinding context; Scalars through context.boundedInt() (#48) |
-->
