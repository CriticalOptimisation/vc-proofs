/**
 * A virtual WebAuthn authenticator for the tests that run in Chromium
 * (`*.chromium.test.ts`).
 *
 * It is added to the page through the Chrome DevTools Protocol, so no hardware and no
 * user is needed. By default it behaves as a platform authenticator that holds
 * resident keys, verifies the user, simulates user presence and supports the PRF
 * extension.
 */
import { cdp } from "vitest/browser";

export interface VirtualAuthenticatorOptions {
  /** The authenticator verifies the user (UV). Default: true. */
  readonly userVerification?: boolean;
  /** The authenticator simulates user presence (UP). Default: true. */
  readonly userPresence?: boolean;
  /** The authenticator supports the PRF extension. Default: true. */
  readonly prf?: boolean;
}

/**
 * Adds a virtual authenticator to the page, runs `fn`, and removes the
 * authenticator, even when `fn` throws.
 *
 * @param options what the authenticator supports; every option defaults to true.
 * @param fn the test body; it receives the authenticator's CDP identifier.
 * @returns what `fn` returns.
 */
export async function withVirtualAuthenticator<T>(
  options: VirtualAuthenticatorOptions,
  fn: (authenticatorId: string) => Promise<T>,
): Promise<T> {
  const session = cdp();
  await session.send("WebAuthn.enable");
  const { authenticatorId } = await session.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: options.userVerification ?? true,
      automaticPresenceSimulation: options.userPresence ?? true,
      hasPrf: options.prf ?? true,
    },
  });
  try {
    return await fn(authenticatorId);
  } finally {
    await session.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  }
}
