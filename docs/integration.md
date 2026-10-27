# Integration: what an application calls

This document lists, for each server endpoint of the issuer and the verifier and for each
wallet ceremony, the vc-proofs functions that the application calls, and what stays in
the application. The steps themselves are described in [the protocol](protocol.md).

**The names are proposals.** They come from the first application built on vc-proofs and
are fixed by the issues of the three modules: #21 (issuer), #22 (wallet) and #23
(verifier). Those issues update this document when they fix a name, an input or an
output.

## Entry points

The package has two layers, one entry point each:

| Import                                 | Layer      | Exports                                                                                                                                                                                                                                     |
| -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@criticaloptimisation/vc-proofs`      | high level | the functions that run every check and return signed objects, or check them: the master and pair credentials that the issuer issues, the wallet's presentation, the verifier's check. **Empty for now**: #21, #22 and #23 fix its functions |
| `@criticaloptimisation/vc-proofs/core` | low level  | the primitives, such as [`requestHash`](#request-hash): each computes or checks one value and returns plain data, never a signed object                                                                                                     |

The high-level API is one API for the three sides: an application imports the functions
it calls, and its bundler leaves out the rest. It is built on the low-level API and
reaches it only through its entry point. Which layer each name below belongs to is fixed
with the name, by #21, #22 and #23.

## Issuer endpoints

Two entry points sign: `issueRoot`, for the [first issuance](protocol.md#first-issuance)
after the identity check, and `issueDerived`, for an
[issuance for a new pair](protocol.md#issuance-for-a-new-pair) from the master
credential. Each runs every check first, and they are the only functions that produce a
signed credential. The lower-level functions below are exported too, by the low-level
entry point, for the application and for tests; how the signing ones are exported without
opening a path around the checks is #21's to settle.

| Endpoint (OpenID4VCI)        | vc-proofs calls                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pushed authorization request | `requestHash(requestJws)`, shared with the verifier                                                                                                                                                                                                                                                                                                                                                                                                       |
| Authorization                | none                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Token                        | none                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Nonce                        | `createIssuanceChallenge(context, macKey)`, checked later by `checkIssuanceChallenge`                                                                                                                                                                                                                                                                                                                                                                     |
| Credential                   | `verifyWebAuthnRegistration(attestation, expected)`; `verifyMasterKeySignature(jwk, context, signature)`; `verifyMasterCredential(sdJwt, issuerKeys)` → `{ dobDays, idCheck, masterPublicKey }`; `commit(dobDays)` → `{ commitment, witness }`; `pairDigest(clientId, accountToken)`; `signPairCredential({ commitment, cnf, iat, pairDigest }, key)`; `signInitialCredential({ ..., masterPublicKey, idCheck, dobDays }, key)`; `encodeWitness(witness)` |
| Deferred credential          | the same as the credential endpoint                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Wallet ceremonies

| Ceremony                                               | vc-proofs calls                                                                                                                                                                                                                                           |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First issuance, and issuance for a new pair (one list) | `createMasterKey()`; `pairPasskeyCreationOptions(cNonce, ...)`; `signIssuanceContext(masterKey, context)`; `verifyIssuedCredential(sdJwt, witness, issuerKeys)`; `wrapWitness(prfOutput, witness, associatedData)`                                        |
| Presentation                                           | `requestHash(requestJws)`; `presentationChallenge(requestHash, nonce, credentialDigest)`; `unwrapWitness(prfOutput, wrapped, associatedData)`; `prove(predicates, witness, answers)` → `{ results }`; `buildPresentation(credential, assertion, results)` |

`createMasterKey` is called on the first issuance only. `answers` is what the
[age filter](protocol.md#age-filter-as-input) decides for each predicate.

## Verifier endpoints

| Endpoint                      | vc-proofs calls                                                                                                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request creation              | `encodeZkPredicates(predicates)`; `requestHash(requestJws)`, shared with the issuer                                                                                                                                                            |
| Issuance-reference redemption | none                                                                                                                                                                                                                                           |
| Presentation check            | `verifyPresentation(presentation, { requestHash, nonce, clientId, accountToken, issuerKeys, rpId, walletOrigin, maxAge })` → `{ results: [{ id, old_enough }] }`: it checks the SD-JWT, the pair digest, the WebAuthn assertion and the proofs |

## Request hash

```ts
import { requestHash } from "@criticaloptimisation/vc-proofs/core";

function requestHash(requestJws: string): Promise<Uint8Array>;
```

`requestHash` computes the [request hash](protocol.md#request-hash) of a signed request
object: the SHA-256 digest, 32 bytes, of the request's JWS Compact Serialization. It is a
primitive, exported by the low-level entry point, `./core`. The issuer, the verifier and
the wallet all use it, directly or through the high-level API, and the value must be the
same on the three sides and in every runtime.

- **Input**: the request object exactly as it was received, a string of three non-empty
  base64url segments separated by two dots. The function does not decode it, does not
  verify its signature and reads none of its claims: the issuer and the verifier check
  the request themselves.
- **Errors**: the promise rejects with a `TypeError` when `requestJws` is not a string,
  or is not three non-empty segments of the base64url alphabet (`A`–`Z`, `a`–`z`, `0`–`9`,
  `-`, `_`) separated by two dots, with nothing before or after. This refuses an empty
  value, surrounding whitespace or a trailing newline, an unsigned request (empty
  signature segment), padding, an encrypted request (five segments) and the JSON
  serialization. The function never trims: a value trimmed on one side only would give a
  different hash on the other.
- **No length limit**: `requestHash` imposes no limit on the length of its input. The
  application **must** enforce a length limit upstream, before the request reaches the
  function, as it bounds any input it receives over HTTP or from a wallet.
- **Pure**: no storage, no logs, no I/O, no randomness, no clock. In the browser it needs
  a secure context, as WebCrypto does.

Who calls it, and on what:

- **The verifier** hashes the exact string it hands out, and keeps the value for
  `verifyPresentation`. Each signature of a request is new, so a request signed again is
  another request with another hash. With the OpenID4VP `request_uri_method=post`, the
  verifier signs the request object when the wallet fetches it, and hashes it then.
- **The issuer** hashes the request that the wallet forwards at the pushed authorization
  request endpoint. It computes the value itself and never takes one from the wallet.
- **The wallet** hashes the request it received, for `presentationChallenge`.

## What stays in the application

vc-proofs has no storage, no logs and no I/O. The application keeps:

- **storage**: the wallet's credentials, wrapped witnesses and master key; the verifier's
  accounts, requests and replay cache of nonces; the issuer's short-lived transaction
  state, which the library hands back to it;
- **keys and their custody**: the issuer's signing and MAC keys, the verifier's request
  signing key, and the resolution and caching of each party's public keys;
- **the WebAuthn calls** themselves, in the wallet's pages, with the options and
  challenges that vc-proofs computes;
- **the pair-binding module** of the wallet, which chooses the credential for a pair (see
  [Pair-binding failure](threat-model.md#pair-binding-failure));
- **the age filter**: its settings page, menu and storage;
- **the messaging** between the verifier's page and the wallet's window, and the
  wallet's [origin check](protocol.md#origin-check-by-the-wallet);
- **HTTP**: the OpenID4VCI and OpenID4VP endpoints, their sessions, headers and errors,
  the issuance-reference redemption, and the content policy of the verifier;
- **policy**: the verifier's authorization of each issuance, its `maxAge` and its age
  thresholds; the issuer's schedule of identity checks and its maximum identity-check
  age.

<!--
Change History

| PR  | Summary |
|-----|---------|
| #28 | vc-proofs calls per endpoint and ceremony (#27) |
| #32 | Entry points: the high and low levels; Request hash section, in ./core; requestHash in the Presentation row (#29) |
-->
