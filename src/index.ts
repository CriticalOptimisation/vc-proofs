/**
 * The common entry point of `@criticaloptimisation/vc-proofs`, for every side: the
 * issuer in Node.js, and the holder and the prover in the browser.
 *
 * Code under `src/`, outside `src/node/` and `src/browser/`, may use only what Node.js 22
 * and every browser with WebAuthn PRF provide: WebCrypto (`globalThis.crypto`),
 * `TextEncoder`, `TextDecoder`, typed arrays and `BigInt`. Lint forbids `node:*`
 * imports and the `window`, `document` and `navigator` globals here.
 */
export { requestHash } from "./request-hash.js";

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #19    | empty common entry point                                      |
