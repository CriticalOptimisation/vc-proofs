/**
 * Smoke test of the isomorphic harness: the same test runs in Node.js and in every
 * headless browser, through the WebCrypto API that the common code relies on
 * (`globalThis.crypto.subtle`, global in Node.js 22 and later).
 */
import { describe, expect, test } from "vitest";

const ecdsa = { name: "ECDSA", namedCurve: "P-256" } as const;
const es256 = { name: "ECDSA", hash: "SHA-256" } as const;

describe("ES256 through globalThis.crypto.subtle", () => {
  test("a signature verifies, and fails on a changed message", async () => {
    const keys = await crypto.subtle.generateKey(ecdsa, false, ["sign", "verify"]);
    const message = new TextEncoder().encode("vc-proofs");
    const signature = await crypto.subtle.sign(es256, keys.privateKey, message);

    // A JWS ES256 signature is r || s, 32 bytes each (RFC 7518, section 3.4).
    expect(signature.byteLength).toBe(64);
    expect(await crypto.subtle.verify(es256, keys.publicKey, signature, message)).toBe(true);

    const changed = new TextEncoder().encode("vc-proofz");
    expect(await crypto.subtle.verify(es256, keys.publicKey, signature, changed)).toBe(false);
  });
});
