/**
 * Smoke test of the WebAuthn harness: a passkey ceremony with the PRF extension, in
 * headless Chromium, on a virtual authenticator. The holder derives its storage key
 * from the PRF output and requires UP and UV at every presentation (R8).
 */
import { expect, test } from "vitest";
import { withVirtualAuthenticator } from "../helpers/virtual-authenticator.js";

/** Bit 0 of the authenticator data flags is UP, bit 2 is UV (WebAuthn, section 6.1). */
const UP = 0x01;
const UV = 0x04;
const FLAGS_OFFSET = 32; // after the 32-byte RP ID hash

test("create and get return the same 32-byte PRF output, with UP and UV", async () => {
  await withVirtualAuthenticator({}, async () => {
    const rpId = location.hostname;
    const salt = new Uint8Array(32).fill(7);

    const created = (await navigator.credentials.create({
      publicKey: {
        rp: { id: rpId, name: "vc-proofs test" },
        user: { id: new Uint8Array(16), name: "test", displayName: "test" },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        extensions: { prf: { eval: { first: salt } } },
      },
    })) as PublicKeyCredential;
    const atCreate = created.getClientExtensionResults().prf;
    expect(atCreate?.enabled).toBe(true);

    const asserted = (await navigator.credentials.get({
      publicKey: {
        rpId,
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        userVerification: "required",
        allowCredentials: [{ type: "public-key", id: created.rawId }],
        extensions: { prf: { eval: { first: salt } } },
      },
    })) as PublicKeyCredential;
    const atGet = asserted.getClientExtensionResults().prf?.results?.first;
    expect(atGet).toBeDefined();
    const output = new Uint8Array(atGet as ArrayBuffer);
    expect(output.byteLength).toBe(32);

    const first = atCreate?.results?.first;
    expect(first).toBeDefined();
    expect(new Uint8Array(first as ArrayBuffer)).toEqual(output);

    const response = asserted.response as AuthenticatorAssertionResponse;
    const flags = new Uint8Array(response.authenticatorData)[FLAGS_OFFSET] ?? 0;
    expect(flags & UP).toBe(UP);
    expect(flags & UV).toBe(UV);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #19    | WebAuthn ceremony with PRF on a virtual authenticator         |
