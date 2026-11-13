/**
 * The low-level entry point, `@criticaloptimisation/vc-proofs/core`: the primitives.
 * Each one computes or checks one value and returns plain data, never a signed object.
 * The high-level entry point (`src/index.ts`) is built on them and reaches them only
 * through this file.
 *
 * Code under `src/core/` imports nothing outside `src/core/`, except the pinned
 * `@noble/curves` for the arithmetic of ristretto255, which `ristretto.ts` wraps in the
 * class `RistrettoElement`, whose scalars are `bigint`s (docs/core/ristretto255.md).
 * The values of the commitments are bounded integers (docs/core/bounded-int.md): the
 * generic class of `bounded-int.ts` is not exported, and neither is any subclass. A
 * blinding context gives the class of the integers of its group, `context.boundedInt()`,
 * from which the classes of the values are made (docs/core/blinding-context.md, *The
 * class of a group*). `Committed` and `Blinded`, the two forms of a commitment, are
 * exported as types, and so are `Decimal` and `Quantity`, the quantities its signatures
 * name; the helpers of `bounded-int.ts` for the other modules are not exported.
 */
export { BlindingContext } from "./blinding-context.js";
export type { Blinded, Committed, Group } from "./blinding-context.js";
export type { Decimal, Quantity } from "./bounded-int.js";
export { requestHash } from "./request-hash.js";
export { RistrettoElement } from "./ristretto.js";

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #32    | low-level entry point; export requestHash (#29)               |
// | #37    | export the derivation of a generator (#34)                    |
// | #38    | export RistrettoElement and RistrettoScalar, not generator (#35) |
// | #40    | export BlindingContext and the type Group; no RistrettoScalar (#39) |
// | #42    | export BoundedInt (#41)                                       |
// | #51    | export BoundedInt from ristretto.ts, not the generic class (#49) |
// | #53    | header: the BoundedInt of Z_ℓ holds at most ℓ integers, as every class made from it (#52) |
// | #55    | export the types Blinded and Committed; no BoundedInt (#48) |
