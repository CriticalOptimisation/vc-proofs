/**
 * The low-level entry point, `@criticaloptimisation/vc-proofs/core`: the primitives.
 * Each one computes or checks one value and returns plain data, never a signed object.
 * The high-level entry point (`src/index.ts`) is built on them and reaches them only
 * through this file.
 *
 * Code under `src/core/` imports nothing outside `src/core/`, except the pinned
 * `@noble/curves` for the arithmetic of ristretto255, which `ristretto.ts` wraps in the
 * class `RistrettoElement`, whose scalars are `bigint`s (docs/core/ristretto255.md).
 * `BoundedInt` (docs/core/bounded-int.md) wraps an integer in a class, for the bounds of
 * a value: the one exported here is the integer of Z_ℓ, of `ristretto.ts`, whose order
 * `ℓ` every class made from it inherits. The generic class of `bounded-int.ts`, which it
 * extends, is not exported.
 */
export { BlindingContext } from "./blinding-context.js";
export type { Group } from "./blinding-context.js";
export { requestHash } from "./request-hash.js";
export { BoundedInt, RistrettoElement } from "./ristretto.js";

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #32    | low-level entry point; export requestHash (#29)               |
// | #37    | export the derivation of a generator (#34)                    |
// | #38    | export RistrettoElement and RistrettoScalar, not generator (#35) |
// | #40    | export BlindingContext and the type Group; no RistrettoScalar (#39) |
// | #42    | export BoundedInt (#41)                                       |
