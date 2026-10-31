# The generator h

A Pedersen commitment to a value `b` with a blinding factor `r` is `C(b, r) = b·g + r·h`,
in the group ristretto255 ([RFC 9496](https://www.rfc-editor.org/rfc/rfc9496.html)). Here
`g` is the canonical generator of the group, and `h` is a second generator. This page
specifies how vc-proofs derives `h` from published parameters. It explains why nobody
knows the discrete logarithm of `h`, and how anyone can recompute `h` and check it.

`g` and `h` are parameters of the commitments: an application derives `h` once, from a
message of its own, and publishes it. vc-proofs supplies the derivation, its checks and
its test vectors. It fixes no message.

## Why h needs nothing up anyone's sleeve

Every element of ristretto255 other than the identity generates the whole group, of
prime order `ℓ = 2²⁵² + 27742317777372353535851937790883648493`. So `h = a·g` for exactly
one `a` in `[1, ℓ − 1]`. Whoever knows `a` can open any commitment to any value:

```text
C(b, r) = b·g + r·h = (b − a)·g + (r + 1)·h = C(b − a, r + 1)
```

with `b − a` taken modulo `ℓ`. This holds for every `b`. Conversely, two openings
`(b, r)` and `(b′, r′)` of one commitment give `a = (b − b′) / (r′ − r) mod ℓ`. So:

**The commitments are binding exactly as long as nobody can compute `a = log_g h`.**

The size of `a` does not bound the committed values: the only bound on them is `ℓ`,
since `b` and `b + ℓ` have the same commitment. The size of `a` matters only because a
small `a`, or one in a known narrow interval, could be found by a search.

`h` must therefore be produced so that nobody, its author included, learns `a`. **Never
derive `h` as `s·g` from a known scalar `s`**, for instance a hash reduced to a scalar:
that `s` is `a`.

## The construction

`h = hash_to_ristretto255(message, DST)`, as defined in
[RFC 9380, Appendix B](https://www.rfc-editor.org/rfc/rfc9380.html#appendix-B):

1. **Expansion.** `uniform = expand_message_xmd(SHA-512, message, DST, 64)`
   ([RFC 9380, Section 5.3.1](https://www.rfc-editor.org/rfc/rfc9380.html#section-5.3.1)):
   64 bytes.
2. **Mapping.** `P₀ = MAP(uniform[0:32])` and `P₁ = MAP(uniform[32:64])`, with `MAP` of
   [RFC 9496, Section 4.3.4](https://www.rfc-editor.org/rfc/rfc9496.html#section-4.3.4).
   `MAP` clears bit 255 of its 32 bytes, reads them as a little-endian integer, reduces
   it modulo `p = 2²⁵⁵ − 19`, and maps the field element to a group element.
3. **Addition.** `h = P₀ + P₁`, the group addition.
4. **Encoding.** The canonical 32-byte encoding of `h`
   ([RFC 9496, Section 4.3.2](https://www.rfc-editor.org/rfc/rfc9496.html#section-4.3.2)).

Steps 2 and 3 together are the _element derivation_ of RFC 9496. RFC 9380 calls them
`ristretto255_map`, a name that is easily confused with `MAP`, the function applied to
each half.

## Parameters

### Domain separation tag

`GENERATOR_DST` is the 60 ASCII bytes:

```text
vc-proofs-V01-CS01-with-ristretto255_XMD:SHA-512_R255MAP_RO_
```

In hex:

```text
76632d70726f6f66732d5630312d435330312d776974682d72697374726574746f3235355f584d443a5348412d3531325f523235354d41505f524f5f
```

It follows the form that
[RFC 9380, Section 8.10](https://www.rfc-editor.org/rfc/rfc9380.html#section-8.10)
recommends: the library (`vc-proofs`), its version (`V01`), a ciphersuite counter
(`CS01`), then the identifier that RFC 9380, Appendix B, gives to `hash_to_ristretto255`
with `expand_message_xmd` over SHA-512. It is longer than the 16 bytes that
[Section 3.1](https://www.rfc-editor.org/rfc/rfc9380.html#section-3.1) recommends, it
cannot collide with the tag of another protocol, and it has no free part. Every
generator that vc-proofs derives uses it. Generators differ by their messages.

### Message

The message is the application's, any bytes. It should be ASCII, under a namespace the
application controls, with a version suffix, and with nothing random-looking in it, so
that it explains itself and leaves no room for trying many messages. An application
that derives several generators gives each its own message.

## The trust argument

`h` is the output of a hash, modelled as a random oracle, on inputs fixed and published
before the output was computed. The inputs are meaningful, versioned strings with no
free field, so nobody could have tried many of them and kept a convenient `h`.

What a computation **can** prove:

1. **That `h` is the value this page specifies.** This is certain, not probabilistic:
   independent implementations agree on it (see [Reproducing h](#reproducing-h)).
2. **That `a` lies outside every interval searched.** This is also certain, for the
   intervals covered: see [Refused results](#refused-results) and
   [The offline exclusion](#the-offline-exclusion).

What no computation can prove: **that `a` cannot be computed at all.** That is the
discrete-logarithm problem itself. Generic attacks on ristretto255 cost about `2¹²⁶`
group operations, and an exhaustive check of `h` would amount to solving the problem.

The assumptions, and so the residual risks, are:

- **discrete logarithms in ristretto255 stay hard.** A break would break every
  commitment, whatever `h` is;
- **SHA-512 behaves as a random function** on these fixed inputs, through
  `expand_message_xmd`;
- **the implementations are correct.** Agreement between independent implementations
  supports this.

None of them is a property of the value of `h`, so no further check of `h` can lower
them.

## Refused results

`RistrettoElement.deriveGenerator` refuses, with a `RangeError`, a derived element `h = x·g` with
`|x| ≤ 2¹⁶` (`SMALL_EXPONENT_BITS = 16`). That covers the identity (`x = 0`), `g` and
`−g`. The search is a baby-step giant-step with 2⁸ baby steps and 2⁹ giant steps, about
800 group additions on each derivation. It is exact: it misses no `x` in range.

A correct hash never lands there: the probability is about `2⁻²³⁵`. The check guards
against implementation errors, such as a derivation that returns a small multiple of
`g`. It is not evidence of security. There is no retry: an application whose message is
refused chooses another message.

## The offline exclusion

Larger intervals are excluded once per published `h`, offline, with a dedicated program
and its recorded output. That work is #36: first an exact baby-step giant-step search up
to about `|x| ≤ 2⁶⁴`; then GPU searches with Pollard's kangaroo method, for ever larger
intervals. Kangaroo is probabilistic: a run that finds nothing does not prove absence,
so its results are stated with their failure probability. Each result is recorded here.

No result is recorded yet.

## WebCrypto and @noble/curves

| Step                         | Implementation                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `expand_message_xmd`         | written in vc-proofs, over WebCrypto's SHA-512 (`crypto.subtle.digest`). The derivation is therefore asynchronous                                                        |
| `MAP`                        | written in vc-proofs (`src/core/ristretto.ts`) from RFC 9496, Section 4.3.4, over the field arithmetic of `@noble/curves`, which implements `MAP` but does not export it |
| Addition, encoding, decoding | [`@noble/curves`](https://github.com/paulmillr/noble-curves) 2.4.0, pinned at that exact version                                                                         |

WebCrypto has no point arithmetic, and no ristretto255: its Ed25519 only signs and
verifies. `@noble/curves` is the one runtime dependency of the package.

## The API

The derivation is a factory of `RistrettoElement`, in
`@criticaloptimisation/vc-proofs/core` (see [The group ristretto255](core/ristretto255.md)):

```ts
class RistrettoElement {
  static readonly GENERATOR_DST: string; // the tag above
  static deriveGenerator(message: Uint8Array): Promise<RistrettoElement>;
  static hashToGroup(message: Uint8Array, dst: Uint8Array): Promise<RistrettoElement>;
  encode(): Uint8Array; // the 32 bytes of h
  // ...
}
```

- `deriveGenerator(message)` is `hashToGroup(message, GENERATOR_DST)`, followed by the
  check of [Refused results](#refused-results). It rejects with a `TypeError` when
  `message` is not a `Uint8Array`, and with a `RangeError` when `h` is refused.
- `(await RistrettoElement.deriveGenerator(message)).encode()` is the published 32-byte
  encoding of `h`.
- The intermediate values of the [test vectors](#test-vectors) (`uniform`, `p0`, `p1`)
  are not part of the API. The tests reproduce them from the internal functions of
  `src/core/ristretto.ts`.

## Runtime use

An application may hold the published encoding of `h` rather than derive it on every
commitment. Decoding that encoding checks only that it is a canonical encoding of a
group element. It does not refuse the identity, which is a valid element encoded as 32
zero bytes. **Decoding says nothing about where the element came from.** To check that
the encoding is the `h` derived from its message, derive it once and compare, for
example when the application starts or in its tests:

```ts
const h = RistrettoElement.decode(published); // throws on bytes that encode no element
if (!(await RistrettoElement.deriveGenerator(message)).equals(h)) {
  throw new Error("h is not the generator derived from its message");
}
```

## Reproducing h

From the root of the repository:

```sh
sudo apt-get install -y libsodium23 # Debian and Ubuntu
python3 tools/generator-h/reference.py check
```

`tools/generator-h/reference.py` implements the construction a second time, in Python,
from the text of the RFCs: `expand_message_xmd` on `hashlib`, and ristretto255 in plain
integers. It also recomputes each `h` a third time from `uniform` with
[libsodium](https://github.com/jedisct1/libsodium)'s
`crypto_core_ristretto255_from_hash`, which is the element derivation of RFC 9496 in C.
Before that, it checks itself against the vectors of RFC 9380, Appendix K.3, and RFC
9496, Appendix A. It then recomputes every value of `test/vectors/generator-h.json` and
reports any difference. With libsodium 1.0.18 the output is:

```text
RFC 9380 K.3 and RFC 9496 A.1-A.3: ok (libsodium 1.0.18)
empty: h = 12751dbfd8fd63e993bd6ea14710d9aa64120aebed435192bffe9cffbaf97e31
abc: h = 18363e8998f6cfdc470379d095c6af1964974c8eb350cc4f26cc3271cdd7714e
age-check: h = 249aa3ca590fa8d666326390ef5b7b422b92231a320746e5013c9be76e407347
identical: test/vectors/generator-h.json
```

The `independent-h` job of CI runs the same command on every pull request. The test
suite checks the TypeScript code against the same file, in Node.js and in each browser.
So three implementations, written apart from each other in three languages, agree on
every value.

## Test vectors

All values are hex. `uniform` is the output of `expand_message_xmd`. `p0` and `p1` are
the encodings of the two mapped halves, and `h` is the encoding of their sum. The
messages are given as text.

### Vector empty

- message: the empty string
- uniform:
  `39e46f24e83f1a96876a593e9dc72c4e0550047b1fb39c1ed44949262940d3e82e9b4c9fe57fabedace4caba8bd560c38b3367aae906899f5697c91b20d445b0`
- p0: `9acd79274bea66346a792f4279e041e12ad4d456451c7ffcfd480a2f15ba275c`
- p1: `f2ecee23aa0eca3cba50a475299db9b3b2c3998b202bd201c9f4f39d52d4293b`
- h: `12751dbfd8fd63e993bd6ea14710d9aa64120aebed435192bffe9cffbaf97e31`

### Vector abc

- message: `abc`
- uniform:
  `8873bca02f44da6396340232cd6d75c2335716a802d36fd9b6c5076a50f35b5d107af468233ca2c34fbb112bc4ff41b53e08245e3ef699bb875a19b4bc3269ab`
- p0: `5c01d63025f268a5785a06531b4bdd203459e536896deaa38434e3bf58f6a711`
- p1: `8203b7d590dde8971e3fe22e7e02fadcbed1fdaa7d3d389bbc7bb64a4b334a2f`
- h: `18363e8998f6cfdc470379d095c6af1964974c8eb350cc4f26cc3271cdd7714e`

### Vector age-check

- message: `age-check.calcool.ai/pedersen/h/v1`, the message of the age-check application
- uniform:
  `93fa6c6e1055445cb014fd63f25db561ff2a019bd127234b090da881b73a30c0647a490d1c2d710e67adce657c7fa05827631711279dc3f78dbbefe887ec7fe9`
- p0: `fe30a3dc2e4d506a31802c6b1cc7a0a2dd1f0a1a57e87a6a05f56e6ee7645139`
- p1: `247a2ee6429a1e6c7f622a59c4ebbfce5e4b25679cbc2e7cad80e805f59f9f6c`
- h: `249aa3ca590fa8d666326390ef5b7b422b92231a320746e5013c9be76e407347`

<!--
Change History

| PR  | Summary |
|-----|---------|
| #37 | the derivation of h: construction, parameters, trust argument, vectors (#34) |
-->
