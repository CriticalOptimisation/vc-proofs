#!/usr/bin/env python3
"""Reference derivation of the Pedersen generator h (#34, docs/generator-h.md).

An implementation of hash_to_ristretto255 (RFC 9380, Appendix B) written apart from
the TypeScript code of vc-proofs, in another language, from the text of the RFCs:

- expand_message_xmd with SHA-512 (RFC 9380, Section 5.3.1), on Python's hashlib;
- the ristretto255 group (RFC 9496, Section 4): decoding, encoding, MAP and element
  derivation, in pure Python integers;
- and, for the final value, libsodium's crypto_core_ristretto255_from_hash, a third
  implementation of the element derivation, in C, loaded through ctypes.

Commands, run from the root of the repository:

    python3 tools/generator-h/reference.py vectors   # writes test/vectors/generator-h.json
    python3 tools/generator-h/reference.py check     # recomputes it; exit 1 on any difference

Both commands first check this implementation against the RFC vectors of
test/vectors/rfc9380-rfc9496.json, and stop if one differs. They need Python 3.9 or
later and libsodium 1.0.18 or later (Debian and Ubuntu: apt-get install libsodium23).
The code is written for clarity, not for speed or constant time: it handles public
values only.
"""

import ctypes
import ctypes.util
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RFC_VECTORS = ROOT / "test" / "vectors" / "rfc9380-rfc9496.json"
VECTORS = ROOT / "test" / "vectors" / "generator-h.json"

# The domain separation tag of every generator that vc-proofs derives (RFC 9380,
# Section 8.10 form): the library, its version, its ciphersuite counter, and the
# identifier RFC 9380 Appendix B gives to hash_to_ristretto255 with SHA-512.
DST = b"vc-proofs-V01-CS01-with-ristretto255_XMD:SHA-512_R255MAP_RO_"

# The messages of the published vectors: two neutral ones, and the message of the
# age-check application (the maintainer's answer Q3 on #34).
MESSAGES = [
    ("empty", b""),
    ("abc", b"abc"),
    ("age-check", b"age-check.calcool.ai/pedersen/h/v1"),
]

# h = x*g is refused when |x| <= 2**SMALL_EXPONENT_BITS (decision G4 of the plan).
SMALL_EXPONENT_BITS = 16

# Planted multiples x*g for the tests of the small-exponent search.
PLANTED_REFUSED = [0, 1, -1, 12345, -777, 2**16, -(2**16)]
PLANTED_ACCEPTED = [2**16 + 1, -(2**16) - 1, 2**40]

# --- The field and the constants of RFC 9496, Section 4.1 ------------------

P = 2**255 - 19
L = 2**252 + 27742317777372353535851937790883648493
D = 37095705934669439343138083508754565189542113879843219016388785533085940283555
SQRT_M1 = 19681161376707505956807079304988542015446066515923890162744021073123829784752
SQRT_AD_MINUS_ONE = 25063068953384623474111414158702152701244531502492656460079210482610430750235
INVSQRT_A_MINUS_D = 54469307008909316920995813868745141605393597292927456921205312896311721017578
ONE_MINUS_D_SQ = 1159843021668779879193775521855586647937357759715417654439879720876111806838
D_MINUS_ONE_SQ = 40440834346308536858101042469323190826248399146238708352240133220865137265952


def inv(a):
    return pow(a, P - 2, P)


def is_negative(e):
    return (e % P) & 1 == 1


def ct_abs(e):
    return (-e) % P if is_negative(e) else e % P


def check_constants():
    """Each constant satisfies the relation that defines it (a = -1 for edwards25519)."""
    assert D == (-121665 * inv(121666)) % P, "D"
    assert SQRT_M1 * SQRT_M1 % P == P - 1, "SQRT_M1"
    assert SQRT_AD_MINUS_ONE**2 % P == (-D - 1) % P, "SQRT_AD_MINUS_ONE"
    assert INVSQRT_A_MINUS_D**2 * (-1 - D) % P == 1, "INVSQRT_A_MINUS_D"
    assert ONE_MINUS_D_SQ == (1 - D * D) % P, "ONE_MINUS_D_SQ"
    assert D_MINUS_ONE_SQ == (D - 1) ** 2 % P, "D_MINUS_ONE_SQ"


def sqrt_ratio_m1(u, v):
    """RFC 9496, Section 4.2."""
    u %= P
    v %= P
    r = (u * pow(v, 3, P)) * pow(u * pow(v, 7, P), (P - 5) // 8, P) % P
    check = v * r * r % P
    correct_sign_sqrt = check == u
    flipped_sign_sqrt = check == (-u) % P
    flipped_sign_sqrt_i = check == (-u * SQRT_M1) % P
    if flipped_sign_sqrt or flipped_sign_sqrt_i:
        r = SQRT_M1 * r % P
    return (correct_sign_sqrt or flipped_sign_sqrt), ct_abs(r)


# --- Points of edwards25519 in extended coordinates (x, y, z, t) ------------

IDENTITY = (0, 1, 1, 0)


def add(p1, p2):
    """Addition on edwards25519, a = -1 (RFC 8032, Section 5.1.4)."""
    x1, y1, z1, t1 = p1
    x2, y2, z2, t2 = p2
    a = (y1 - x1) * (y2 - x2) % P
    b = (y1 + x1) * (y2 + x2) % P
    c = t1 * 2 * D * t2 % P
    d = z1 * 2 * z2 % P
    e, f, g, h = b - a, d - c, d + c, b + a
    return (e * f % P, g * h % P, f * g % P, e * h % P)


def neg(p):
    x, y, z, t = p
    return ((-x) % P, y, z, (-t) % P)


def mul(k, p):
    """k*p for any integer k, by double-and-add."""
    if k < 0:
        return mul(-k, neg(p))
    result = IDENTITY
    while k:
        if k & 1:
            result = add(result, p)
        p = add(p, p)
        k >>= 1
    return result


def base_point():
    """The edwards25519 base point of RFC 8032: y = 4/5, x even."""
    y = 4 * inv(5) % P
    ok, x = sqrt_ratio_m1(y * y - 1, D * y * y + 1)
    assert ok
    return (x, y, 1, x * y % P)


# --- ristretto255, RFC 9496, Section 4.3 -------------------------------------


def decode(s_bytes):
    """Section 4.3.1. Returns a point, or None when decoding fails."""
    if len(s_bytes) != 32:
        return None
    s = int.from_bytes(s_bytes, "little")
    if s >= P or is_negative(s):
        return None
    ss = s * s % P
    u1 = (1 - ss) % P
    u2 = (1 + ss) % P
    u2_sqr = u2 * u2 % P
    v = (-(D * u1 * u1) - u2_sqr) % P
    was_square, invsqrt = sqrt_ratio_m1(1, v * u2_sqr)
    den_x = invsqrt * u2 % P
    den_y = invsqrt * den_x * v % P
    x = ct_abs(2 * s * den_x)
    y = u1 * den_y % P
    t = x * y % P
    if not was_square or is_negative(t) or y == 0:
        return None
    return (x, y, 1, t)


def encode(point):
    """Section 4.3.2."""
    x0, y0, z0, t0 = point
    u1 = (z0 + y0) * (z0 - y0) % P
    u2 = x0 * y0 % P
    _, invsqrt = sqrt_ratio_m1(1, u1 * u2 * u2)
    den1 = invsqrt * u1 % P
    den2 = invsqrt * u2 % P
    z_inv = den1 * den2 * t0 % P
    ix0 = x0 * SQRT_M1 % P
    iy0 = y0 * SQRT_M1 % P
    enchanted_denominator = den1 * INVSQRT_A_MINUS_D % P
    rotate = is_negative(t0 * z_inv)
    x, y = (iy0, ix0) if rotate else (x0, y0)
    z = z0
    den_inv = enchanted_denominator if rotate else den2
    if is_negative(x * z_inv):
        y = (-y) % P
    s = ct_abs(den_inv * (z - y))
    return s.to_bytes(32, "little")


def ristretto_map(b32):
    """MAP of Section 4.3.4, on a 32-byte string."""
    t = (int.from_bytes(b32, "little") & ((1 << 255) - 1)) % P
    r = SQRT_M1 * t * t % P
    u = (r + 1) * ONE_MINUS_D_SQ % P
    v = (-1 - r * D) * (r + D) % P
    was_square, s = sqrt_ratio_m1(u, v)
    s_prime = (-ct_abs(s * t)) % P
    s = s if was_square else s_prime
    c = P - 1 if was_square else r
    n = (c * (r - 1) * D_MINUS_ONE_SQ - v) % P
    w0 = 2 * s * v % P
    w1 = n * SQRT_AD_MINUS_ONE % P
    w2 = (1 - s * s) % P
    w3 = (1 + s * s) % P
    return (w0 * w3 % P, w2 * w1 % P, w1 * w3 % P, w0 * w2 % P)


def element_derivation(b64):
    """Section 4.3.4: MAP(b[0:32]) + MAP(b[32:64]), and the two terms."""
    assert len(b64) == 64
    p0 = ristretto_map(b64[:32])
    p1 = ristretto_map(b64[32:])
    return p0, p1, add(p0, p1)


# --- expand_message_xmd, RFC 9380, Section 5.3.1 -----------------------------


def expand_message_xmd_sha512(msg, dst, len_in_bytes):
    b_in_bytes, s_in_bytes = 64, 128
    ell = -(-len_in_bytes // b_in_bytes)
    if ell > 255 or len_in_bytes > 65535 or len(dst) > 255:
        raise ValueError("expand_message_xmd: input out of range")
    dst_prime = dst + bytes([len(dst)])
    msg_prime = bytes(s_in_bytes) + msg + len_in_bytes.to_bytes(2, "big") + b"\x00" + dst_prime
    b0 = hashlib.sha512(msg_prime).digest()
    b = [hashlib.sha512(b0 + b"\x01" + dst_prime).digest()]
    for i in range(2, ell + 1):
        mixed = bytes(x ^ y for x, y in zip(b0, b[-1]))
        b.append(hashlib.sha512(mixed + bytes([i]) + dst_prime).digest())
    return b"".join(b)[:len_in_bytes]


# --- The small-exponent search ------------------------------------------------


def find_small_exponent(encoding, bits):
    """The x with |x| <= 2**bits and encoding = encode(x*g), or None.

    Baby-step giant-step: x = i*m + j with m = 2**ceil(bits/2), 0 <= j < m, and i
    from -(2**bits // m) - 1 to 2**bits // m. Exact: it never misses an x in range.
    """
    g = base_point()
    bound = 2**bits
    m = 1 << ((bits + 1) // 2)
    table = {}
    point = IDENTITY
    for j in range(m):
        table.setdefault(encode(point), j)
        point = add(point, g)
    step = neg(mul(m, g))
    i_max = bound // m + 1
    target = decode(encoding)
    if target is None:
        raise ValueError("find_small_exponent: invalid encoding")
    current = add(target, mul(i_max * m, g))  # h - (-i_max)*m*g
    for i in range(-i_max, i_max + 1):
        j = table.get(encode(current))
        if j is not None:
            x = i * m + j
            if abs(x) <= bound:
                return x
        current = add(current, step)
    return None


# --- libsodium ----------------------------------------------------------------


def load_libsodium():
    name = ctypes.util.find_library("sodium")
    if name is None:
        sys.exit("reference.py: libsodium not found (Debian and Ubuntu: apt-get install libsodium23)")
    lib = ctypes.CDLL(name)
    if lib.sodium_init() < 0:
        sys.exit("reference.py: sodium_init failed")
    lib.sodium_version_string.restype = ctypes.c_char_p
    return lib


def sodium_from_hash(lib, b64):
    out = ctypes.create_string_buffer(32)
    if lib.crypto_core_ristretto255_from_hash(out, b64) != 0:
        raise RuntimeError("crypto_core_ristretto255_from_hash failed")
    return out.raw


# --- Self-test against the RFC vectors ---------------------------------------


def self_test(lib):
    check_constants()
    rfc = json.loads(RFC_VECTORS.read_text())
    xmd = rfc["expandMessageXmdSha512"]
    for v in xmd["vectors"]:
        got = expand_message_xmd_sha512(v["msg"].encode(), xmd["dst"].encode(), v["lenInBytes"])
        assert got.hex() == v["uniformBytes"], f"RFC 9380 K.3: msg of {len(v['msg'])} bytes"
    g = base_point()
    point = IDENTITY
    for k, expected in enumerate(rfc["multiplesOfGenerator"]["encodings"]):
        assert encode(point).hex() == expected, f"RFC 9496 A.1: B[{k}]"
        if k:
            assert encode(decode(bytes.fromhex(expected))) == bytes.fromhex(expected)
        point = add(point, g)
    for bad in rfc["invalidEncodings"]["encodings"]:
        assert decode(bytes.fromhex(bad)) is None, f"RFC 9496 A.2: {bad}"
    for v in rfc["elementDerivation"]["vectors"]:
        b64 = bytes.fromhex(v["input"])
        assert encode(element_derivation(b64)[2]).hex() == v["output"], "RFC 9496 A.3 (Python)"
        assert sodium_from_hash(lib, b64).hex() == v["output"], "RFC 9496 A.3 (libsodium)"


# --- The vectors of h ---------------------------------------------------------


def derive(lib, name, message):
    uniform = expand_message_xmd_sha512(message, DST, 64)
    p0, p1, h = element_derivation(uniform)
    h_bytes = encode(h)
    if sodium_from_hash(lib, uniform) != h_bytes:
        sys.exit(f"reference.py: libsodium disagrees on h for {name}")
    if decode(h_bytes) is None or encode(decode(h_bytes)) != h_bytes:
        sys.exit(f"reference.py: h for {name} is not a canonical encoding")
    small = find_small_exponent(h_bytes, SMALL_EXPONENT_BITS)
    if small is not None:
        sys.exit(f"reference.py: h for {name} is {small}*g, refused")
    return {
        "name": name,
        "message": message.decode("ascii"),
        "messageHex": message.hex(),
        "uniform": uniform.hex(),
        "p0": encode(p0).hex(),
        "p1": encode(p1).hex(),
        "h": h_bytes.hex(),
    }


def planted(xs):
    g = base_point()
    return [{"x": str(x), "encoding": encode(mul(x, g)).hex()} for x in xs]


def build(lib):
    return {
        "description": (
            "Test vectors of the derivation of h (#34, docs/generator-h.md): "
            "hash_to_ristretto255 of RFC 9380 Appendix B with expand_message_xmd(SHA-512), "
            "under the DST of vc-proofs. uniform is the output of expand_message_xmd, "
            "p0 and p1 the encodings of MAP of its two halves, h the encoding of their sum. "
            "Byte strings are lowercase hex. Produced by tools/generator-h/reference.py, "
            "outside the TypeScript code; h is also recomputed with libsodium."
        ),
        "check": "python3 tools/generator-h/reference.py check",
        "dst": DST.decode("ascii"),
        "dstHex": DST.hex(),
        "smallExponentBits": SMALL_EXPONENT_BITS,
        "vectors": [derive(lib, name, message) for name, message in MESSAGES],
        "smallExponents": {
            "description": (
                "Planted multiples x*g of the canonical generator. find_small_exponent "
                "with bits = smallExponentBits finds x for each refused entry and "
                "nothing for each accepted one."
            ),
            "refused": planted(PLANTED_REFUSED),
            "accepted": planted(PLANTED_ACCEPTED),
        },
    }


def main(argv):
    if len(argv) != 2 or argv[1] not in ("vectors", "check"):
        sys.exit("usage: reference.py vectors|check")
    lib = load_libsodium()
    self_test(lib)
    print(f"RFC 9380 K.3 and RFC 9496 A.1-A.3: ok (libsodium {lib.sodium_version_string().decode()})")
    built = build(lib)
    for v in built["vectors"]:
        print(f"{v['name']}: h = {v['h']}")
    if argv[1] == "vectors":
        VECTORS.write_text(json.dumps(built, indent=2) + "\n")
        print(f"written: {VECTORS.relative_to(ROOT)}")
        return 0
    if json.loads(VECTORS.read_text()) != built:
        print(f"differs: {VECTORS.relative_to(ROOT)}", file=sys.stderr)
        return 1
    print(f"identical: {VECTORS.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

# --- Change History -------------------------------------------------------
# | PR     | Summary                                                       |
# |--------|---------------------------------------------------------------|
# | #37    | new: reference derivation of h, vectors and their check (#34) |
