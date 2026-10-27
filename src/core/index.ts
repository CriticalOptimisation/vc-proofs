/**
 * The low-level entry point, `@criticaloptimisation/vc-proofs/core`: the primitives.
 * Each one computes or checks one value and returns plain data, never a signed object.
 * The high-level entry point (`src/index.ts`) is built on them and reaches them only
 * through this file.
 *
 * Code under `src/core/` imports nothing outside `src/core/`.
 */
export { requestHash } from "./request-hash.js";

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #32    | low-level entry point; export requestHash (#29)               |
