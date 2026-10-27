/**
 * The high-level entry point, `@criticaloptimisation/vc-proofs`: one API for every side,
 * the issuer, the verifier and the wallet. Its functions run every check and return
 * signed objects: the master credential and the pair credentials that the issuer issues,
 * and the presentation that the wallet builds; and they check those objects for the
 * other parts. An application imports what it calls, and its bundler drops the rest.
 *
 * Placeholder: it exports nothing yet. Its functions are fixed by #21 (issuer), #22
 * (wallet) and #23 (verifier). They reach the primitives only through the low-level
 * entry point, `./core/index.js`, never through a file under `src/core/`.
 *
 * Code under `src/` may use only what Node.js 22 and every browser with WebAuthn PRF
 * provide: WebCrypto (`globalThis.crypto`), `TextEncoder`, `TextDecoder`, typed arrays
 * and `BigInt`. Lint forbids `node:*` imports and the `window`, `document` and
 * `navigator` globals.
 */
export {};

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #19    | empty common entry point                                      |
// | #32    | high-level entry point, an empty placeholder (#29)            |
