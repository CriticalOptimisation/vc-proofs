/**
 * The request hash: the digest that binds the issuance transaction, the WebAuthn
 * challenges and the proofs to one signed request object (docs/protocol.md, *Request
 * hash*; docs/integration.md, *Request hash*).
 */

/** Three non-empty base64url segments separated by two dots, and nothing else. */
const compactJws = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Computes the request hash of a signed request object: the SHA-256 digest of its JWS
 * Compact Serialization, as received, signature included, with no domain tag.
 *
 * The string is hashed as it is: it is not decoded, trimmed or normalized, its signature
 * is not verified and none of its claims is read. The same request is the same string.
 *
 * The function imposes no limit on the length of `requestJws`: the application must
 * enforce one upstream, before the request reaches it.
 *
 * @param requestJws - the request object exactly as it was received.
 * @returns a new 32-byte array on each call.
 * @throws TypeError, as a rejection of the promise, when `requestJws` is not a string of
 *   three non-empty base64url segments separated by two dots. The message names no part
 *   of the input.
 */
export async function requestHash(requestJws: string): Promise<Uint8Array> {
  if (typeof requestJws !== "string" || !compactJws.test(requestJws)) {
    throw new TypeError("requestHash: requestJws must be a JWS in compact serialization");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requestJws));
  return new Uint8Array(digest);
}
