# Integration: what an application calls

This document lists, for each server endpoint of the issuer and the verifier and for each
wallet ceremony, the vc-proofs functions that the application calls, and what stays in
the application. The steps themselves are described in [the protocol](protocol.md).

**The names are proposals.** They come from the first application built on vc-proofs and
are fixed by the issues of the three modules: #21 (issuer), #22 (wallet) and #23
(verifier). Those issues update this document when they fix a name, an input or an
output.

## Issuer endpoints

Two entry points sign: `issueRoot`, for the [first issuance](protocol.md#first-issuance)
after the identity check, and `issueDerived`, for an
[issuance for a new pair](protocol.md#issuance-for-a-new-pair) from the master
credential. Each runs every check first, and they are the only functions that produce a
signed credential. The lower-level functions below are exported too, for the application
and for tests; how the signing ones are exported without opening a path around the checks
is #21's to settle.

| Endpoint (OpenID4VCI)        | vc-proofs calls                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pushed authorization request | `requestHash(requestJws)`, shared with the verifier                                                                                                                                                                                                                                                                                                                                                                                                       |
| Authorization                | none                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Token                        | none                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Nonce                        | `createIssuanceChallenge(context, macKey)`, checked later by `checkIssuanceChallenge`                                                                                                                                                                                                                                                                                                                                                                     |
| Credential                   | `verifyWebAuthnRegistration(attestation, expected)`; `verifyMasterKeySignature(jwk, context, signature)`; `verifyMasterCredential(sdJwt, issuerKeys)` → `{ dobDays, idCheck, masterPublicKey }`; `commit(dobDays)` → `{ commitment, witness }`; `pairDigest(clientId, accountToken)`; `signPairCredential({ commitment, cnf, iat, pairDigest }, key)`; `signInitialCredential({ ..., masterPublicKey, idCheck, dobDays }, key)`; `encodeWitness(witness)` |
| Deferred credential          | the same as the credential endpoint                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Wallet ceremonies

| Ceremony                                               | vc-proofs calls                                                                                                                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| First issuance, and issuance for a new pair (one list) | `createMasterKey()`; `pairPasskeyCreationOptions(cNonce, ...)`; `signIssuanceContext(masterKey, context)`; `verifyIssuedCredential(sdJwt, witness, issuerKeys)`; `wrapWitness(prfOutput, witness, associatedData)`             |
| Presentation                                           | `presentationChallenge(requestHash, nonce, credentialDigest)`; `unwrapWitness(prfOutput, wrapped, associatedData)`; `prove(predicates, witness, answers)` → `{ results }`; `buildPresentation(credential, assertion, results)` |

`createMasterKey` is called on the first issuance only. `answers` is what the
[age filter](protocol.md#age-filter-as-input) decides for each predicate.

## Verifier endpoints

| Endpoint                      | vc-proofs calls                                                                                                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request creation              | `encodeZkPredicates(predicates)`; `requestHash(requestJws)`, shared with the issuer                                                                                                                                                            |
| Issuance-reference redemption | none                                                                                                                                                                                                                                           |
| Presentation check            | `verifyPresentation(presentation, { requestHash, nonce, clientId, accountToken, issuerKeys, rpId, walletOrigin, maxAge })` → `{ results: [{ id, old_enough }] }`: it checks the SD-JWT, the pair digest, the WebAuthn assertion and the proofs |

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
-->
