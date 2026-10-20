/**
 * The WebAuthn test helper `withVirtualAuthenticator` (docs/development.md, *WebAuthn
 * tests*): it removes its authenticator even when the test body throws, and its options
 * turn user verification, user presence and PRF off, for the refusal paths.
 */
import { cdp } from "vitest/browser";
import { describe, expect, test } from "vitest";
import { withVirtualAuthenticator } from "../helpers/virtual-authenticator.js";

/** A short ceremony timeout: a refused ceremony ends instead of waiting for a user. */
const TIMEOUT_MS = 2_000;

function create(userVerification: UserVerificationRequirement) {
  return navigator.credentials.create({
    publicKey: {
      rp: { id: location.hostname, name: "vc-proofs test" },
      user: { id: new Uint8Array(16), name: "test", displayName: "test" },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: { residentKey: "required", userVerification },
      extensions: { prf: { eval: { first: new Uint8Array(32) } } },
      timeout: TIMEOUT_MS,
    },
  }) as Promise<PublicKeyCredential>;
}

describe("withVirtualAuthenticator", () => {
  test("returns what the test body returns, and removes the authenticator", async () => {
    let id = "";
    const value = await withVirtualAuthenticator({}, (authenticatorId) => {
      id = authenticatorId;
      return Promise.resolve(42);
    });
    expect(value).toBe(42);
    expect(id).not.toBe("");
    await expect(cdp().send("WebAuthn.getCredentials", { authenticatorId: id })).rejects.toThrow();
  });

  test("removes the authenticator when the test body throws, and rethrows", async () => {
    let id = "";
    const body = (authenticatorId: string): Promise<never> => {
      id = authenticatorId;
      return Promise.reject(new Error("test body failed"));
    };
    await expect(withVirtualAuthenticator({}, body)).rejects.toThrow("test body failed");
    expect(id).not.toBe("");
    await expect(cdp().send("WebAuthn.getCredentials", { authenticatorId: id })).rejects.toThrow();
  });

  test("prf: false gives a credential without PRF", async () => {
    await withVirtualAuthenticator({ prf: false }, async () => {
      const created = await create("required");
      expect(created.getClientExtensionResults().prf?.enabled ?? false).toBe(false);
    });
  });

  test("userVerification: false refuses a ceremony that requires UV", async () => {
    await withVirtualAuthenticator({ userVerification: false }, async () => {
      await expect(create("required")).rejects.toMatchObject({ name: "NotAllowedError" });
    });
  });

  test("userPresence: false lets a ceremony time out", async () => {
    await withVirtualAuthenticator({ userPresence: false }, async () => {
      await expect(create("discouraged")).rejects.toMatchObject({ name: "NotAllowedError" });
    });
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #19    | cleanup and options of the PRF helper                         |
