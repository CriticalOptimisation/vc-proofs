# The group ristretto255

The commitments and proofs of vc-proofs work in the group ristretto255
([RFC 9496](https://www.rfc-editor.org/rfc/rfc9496.html)), of prime order
`ℓ = 2²⁵² + 27742317777372353535851937790883648493`. The low-level entry point,
`@criticaloptimisation/vc-proofs/core`, gives it two classes:

- `RistrettoElement`, an element of the group;
- `RistrettoScalar`, an integer modulo `ℓ`.

They are the only way the rest of the library handles group values. They hold the
arithmetic of [`@noble/curves`](https://github.com/paulmillr/noble-curves), but never
expose its types. They carry no protocol: the Pedersen context (the generators `g` and
`h` and the commitments built on them) is a class of its own, built on these two.

```ts
import { RistrettoElement, RistrettoScalar } from "@criticaloptimisation/vc-proofs/core";

const h = await RistrettoElement.deriveGenerator(new TextEncoder().encode("example/h/v1"));
const r = RistrettoScalar.random();
const blinding = h.multiplyScalar(r); // r·h
```

## Values and errors

- **Immutable.** No method changes its instance or its arguments. Each operation returns a
  new instance, and every `encode()` returns a new array, which the caller may change
  freely.
- **No public constructor.** Instances come only from the static factories below. A
  method that receives anything other than an instance of the expected class throws a
  `TypeError`.
- **Byte strings** are `Uint8Array`s, views with an offset included. Anything else, or a
  wrong length, is a `TypeError`.
- **Errors**: `TypeError` for an input that is not a valid value (wrong type, wrong
  length, invalid or non-canonical encoding); `RangeError` for a valid value that the
  operation refuses (a zero scalar to invert, an integer out of range, a refused DST, a
  refused generator).

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
| `encode()`                         | the canonical 32-byte encoding                  | none                                      |
| `equals(other)`                    | whether both are the same element               | none                                      |
| `isIdentity()`                     | whether this is the neutral element             | none                                      |
| `add(other)`                       | `this + other`                                  | `crypto_core_ristretto255_add`            |
| `subtract(other)`                  | `this − other`                                  | `crypto_core_ristretto255_sub`            |
| `negate()`                         | `−this`                                         | none                                      |
| `multiplyScalar(scalar)`           | `scalar·this`                                   | `crypto_scalarmult_ristretto255`          |

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
`P.subtract(P)`, `P.add(P.negate())` and `P.multiplyScalar(zero)` all give it.

Whether a caller may receive the identity is that caller's policy, decided by each
caller: a commitment equal to the identity, for instance, may be refused by the code
that reads it. Such a caller checks `isIdentity()` after `decode`.

### equals

`equals` is the equality of
[RFC 9496, Section 4.3.3](https://www.rfc-editor.org/rfc/rfc9496.html#section-4.3.3), as
`@noble/curves` implements it: it computes both of the RFC's comparisons before it
combines them, and it does not encode either element.

### multiplyScalar

`P.multiplyScalar(s)` is `s·P`, the sum of `s` copies of `P`. It uses the fixed-window
multiplication of `@noble/curves`, whose sequence of point operations does not depend on
`s` (see [Constant time](#constant-time)). That multiplication refuses the scalar 0, so a
zero scalar returns the identity before it is called. The only thing this branch can
reveal is whether `s` is zero.

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

## RistrettoScalar

| Member                           | Returns                                       | libsodium counterpart                    |
| -------------------------------- | --------------------------------------------- | ---------------------------------------- |
| `static decode(bytes)`           | the scalar of a canonical 32-byte encoding    | none                                     |
| `static fromBigInt(n)`           | `n mod ℓ`                                     | none                                     |
| `static fromUniformBytes(bytes)` | 64 bytes, read little-endian, reduced mod `ℓ` | `crypto_core_ristretto255_scalar_reduce` |
| `static random()`                | a uniformly random scalar                     | `crypto_core_ristretto255_scalar_random` |
| `encode()`                       | the canonical 32-byte encoding                | none                                     |
| `equals(other)`                  | whether both are the same scalar              | none                                     |
| `isZero()`                       | whether this is 0                             | none                                     |
| `add(other)`                     | `this + other mod ℓ`                          | `crypto_core_ristretto255_scalar_add`    |
| `subtract(other)`                | `this − other mod ℓ`                          | `crypto_core_ristretto255_scalar_sub`    |
| `multiply(other)`                | `this · other mod ℓ`                          | `crypto_core_ristretto255_scalar_mul`    |
| `negate()`                       | `−this mod ℓ`                                 | `crypto_core_ristretto255_scalar_negate` |
| `invert()`                       | `this⁻¹ mod ℓ`                                | `crypto_core_ristretto255_scalar_invert` |

- **Encoding.** 32 bytes, little-endian, canonical: the integer is below `ℓ`. `decode`
  throws a `TypeError` for any other length and for an integer `≥ ℓ`, such as the
  encoding of `ℓ` itself.
- **`fromBigInt(n)`** accepts a `bigint` with `|n| < 2²⁵¹`, and returns `n mod ℓ`, so
  `fromBigInt(-1n)` is `ℓ − 1`. Since `2 · 2²⁵¹ < ℓ`, each scalar has at most one signed
  reading in that range. A larger `|n|` is a `RangeError`, and anything other than a
  `bigint` is a `TypeError`.
- **`fromUniformBytes(bytes)`** needs exactly 64 bytes, else a `TypeError`. Reducing 512
  bits mod `ℓ` leaves a bias below `2⁻²⁵⁹`.
- **`random()`** is `fromUniformBytes` of 64 bytes from `crypto.getRandomValues`. It may
  return 0 with probability `1/ℓ`.
- **`equals`** compares the two encodings with the `equalBytes` of `@noble/curves`, which
  does not stop at the first difference.
- **`invert()`** throws a `RangeError` on zero, which has no inverse. It computes
  `this^(ℓ − 2)`: the exponent is public, so the sequence of operations does not depend
  on the scalar, unlike an extended Euclid.

`fromBigInt(0n)` and `fromBigInt(1n)` give 0 and 1; there are no separate factories for
them.

## Constant time

No JavaScript code can promise constant time: `bigint` operations, the JIT compiler and
the garbage collector all have timings that depend on data. The classes do what can be
done above that:

- every operation on field elements and scalars is a method of the `Fp` (the field of
  edwards25519) and `Fn` (scalars mod `ℓ`) of `@noble/curves`, never an operation of our
  own on `bigint`;
- the selections of RFC 9496 (`CT_SELECT`, `CT_ABS`) use `Fp.cmov`, not a JavaScript
  conditional;
- `multiplyScalar` uses the fixed-window multiplication of `@noble/curves`, whose sequence
  of point operations does not depend on the scalar;
- `equals` computes every comparison before it combines them: both of RFC 9496 for
  elements, every byte for scalars.

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

## Checked against libsodium

The tests check both classes against the RFC vectors and against
[libsodium](https://github.com/jedisct1/libsodium), an implementation in C written apart
from `@noble/curves` and from this code. They load libsodium 1.0.22, compiled to
WebAssembly by [libsodium.js](https://github.com/jedisct1/libsodium.js)
(`libsodium-wrappers-sumo`), in each runtime of the test suite. That package is a
development dependency only: the published package does not contain it, and `src/`
cannot import it.

- **The RFC vectors**: RFC 9496, Appendix A.1 (the multiples `0·g` to `15·g`), A.2 (the
  encodings `decode` refuses) and A.3 (the element derivation), and RFC 9380, Appendix
  K.3 (`expand_message_xmd` over SHA-512). libsodium itself is first checked on A.1 and
  A.3, then the classes are.
- **Differential tests**: 64 inputs, derived from a counter by SHA-512, so that a failure
  is reproducible. On them, every operation that has a libsodium counterpart in the
  tables above returns the bytes that libsodium returns, and `decode` accepts exactly the
  encodings that `crypto_core_ristretto255_is_valid_point` accepts.

Expected values come either from the text of an RFC or from libsodium, never from code
of vc-proofs. libsodium has no `hash_to_ristretto255`; `hashToGroup` is checked as
[hashToGroup](#hashtogroup) says.
