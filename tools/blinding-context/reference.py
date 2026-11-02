#!/usr/bin/env python3
"""Reference values of the blinding context (#39, docs/core/blinding-context.md).

The vectors of test/vectors/blinding-context.json, computed apart from the TypeScript
code of vc-proofs:

- the serialization of the age-check context, "Ristretto255" || h;
- Pedersen commitments C = m*g + r*h with fixed m and r, on the ristretto255 arithmetic
  of tools/generator-h/reference.py (imported, not copied), and each recomputed with
  libsodium's crypto_scalarmult_ristretto255_base, crypto_scalarmult_ristretto255 and
  crypto_core_ristretto255_add, a second implementation, in C.

Commands, run from the root of the repository:

    python3 tools/blinding-context/reference.py vectors   # writes the vector file
    python3 tools/blinding-context/reference.py check     # recomputes it; exit 1 on any difference

Both commands first run the self-test of tools/generator-h/reference.py, and take h
from test/vectors/generator-h.json after recomputing it. They need what that script
needs: Python 3.9 or later and libsodium 1.0.18 or later. The code handles public
values only, and is written for clarity, not for speed or constant time.
"""

import ctypes
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VECTORS = ROOT / "test" / "vectors" / "blinding-context.json"
GENERATOR_H = ROOT / "tools" / "generator-h" / "reference.py"

# The name of the group, as it opens the serialization of a context (the maintainer's
# answer to Q2 on #39): the suite is the group and the generator h.
SUITE_NAME = b"Ristretto255"

# The context of the vectors: the age-check application of #34.
CONTEXT = "age-check"

# The committed values: a day count, and 0 (C = r*h).
COMMITMENTS = [("day-count", 20000), ("zero", 0)]


def load_generator_h():
    # No __pycache__ next to the imported script: git does not ignore it.
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location("generator_h_reference", GENERATOR_H)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ref = load_generator_h()


def scalar_bytes(n):
    """The canonical 32-byte little-endian encoding of n mod l."""
    return (n % ref.L).to_bytes(32, "little")


def fixed_blinding(name):
    """A fixed, reproducible r for vector `name`: SHA-512 of a label, reduced mod l."""
    digest = hashlib.sha512(b"vc-proofs blinding-context test vector r " + name.encode()).digest()
    return int.from_bytes(digest, "little") % ref.L


def sodium_commit(lib, m, r, h_bytes):
    """m*g + r*h by libsodium. Its scalar multiplications refuse the identity, so m = 0
    gives r*h alone."""
    rh = ctypes.create_string_buffer(32)
    if lib.crypto_scalarmult_ristretto255(rh, scalar_bytes(r), h_bytes) != 0:
        raise RuntimeError("crypto_scalarmult_ristretto255 failed")
    if m % ref.L == 0:
        return rh.raw
    mg = ctypes.create_string_buffer(32)
    if lib.crypto_scalarmult_ristretto255_base(mg, scalar_bytes(m)) != 0:
        raise RuntimeError("crypto_scalarmult_ristretto255_base failed")
    out = ctypes.create_string_buffer(32)
    if lib.crypto_core_ristretto255_add(out, mg.raw, rh.raw) != 0:
        raise RuntimeError("crypto_core_ristretto255_add failed")
    return out.raw


def commit(lib, name, m, h_bytes):
    r = fixed_blinding(name)
    if r == 0:
        sys.exit(f"reference.py: r of {name} is 0")
    h = ref.decode(h_bytes)
    point = ref.add(ref.mul(m, ref.base_point()), ref.mul(r, h))
    c = ref.encode(point)
    if sodium_commit(lib, m, r, h_bytes) != c:
        sys.exit(f"reference.py: libsodium disagrees on the commitment {name}")
    return {
        "name": name,
        "m": str(m),
        "mHex": scalar_bytes(m).hex(),
        "r": scalar_bytes(r).hex(),
        "commitment": c.hex(),
    }


def build(lib):
    generator = json.loads(ref.VECTORS.read_text())
    if generator != ref.build(lib):
        sys.exit(f"reference.py: {ref.VECTORS.relative_to(ROOT)} differs from its recomputation")
    vector = next(v for v in generator["vectors"] if v["name"] == CONTEXT)
    message = bytes.fromhex(vector["messageHex"])
    h_bytes = bytes.fromhex(vector["h"])
    return {
        "description": (
            "Test vectors of the blinding context (#39, docs/core/blinding-context.md). "
            "context: the age-check context of test/vectors/generator-h.json and its "
            "serialization, the ASCII bytes of suiteName followed by the 32 bytes of h. "
            "commitments: C = m*g + r*h for fixed m and r; scalars are 32-byte "
            "little-endian encodings. Byte strings are lowercase hex. Produced by "
            "tools/blinding-context/reference.py, outside the TypeScript code; every "
            "commitment is also recomputed with libsodium."
        ),
        "check": "python3 tools/blinding-context/reference.py check",
        "suiteName": SUITE_NAME.decode("ascii"),
        "suiteNameHex": SUITE_NAME.hex(),
        "context": {
            "name": CONTEXT,
            "message": message.decode("ascii"),
            "messageHex": message.hex(),
            "h": h_bytes.hex(),
            "serialized": (SUITE_NAME + h_bytes).hex(),
        },
        "commitments": [commit(lib, name, m, h_bytes) for name, m in COMMITMENTS],
    }


def main(argv):
    if len(argv) != 2 or argv[1] not in ("vectors", "check"):
        sys.exit("usage: reference.py vectors|check")
    lib = ref.load_libsodium()
    ref.self_test(lib)
    print(f"RFC 9380 K.3 and RFC 9496 A.1-A.3: ok (libsodium {lib.sodium_version_string().decode()})")
    built = build(lib)
    print(f"{CONTEXT}: serialized = {built['context']['serialized']}")
    for c in built["commitments"]:
        print(f"{c['name']}: C = {c['commitment']}")
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
# | #39    | new: the vectors of the blinding context and their check      |
