# Threat model

This document states whom vc-proofs trusts, which attacks it must defeat, and which
risks it accepts. It goes with [the protocol](protocol.md), which defines the parties,
the credentials and the flows named here. The claims that each exported function
establishes, and the checks that enforce them, are added by #6 (see [Claims](#claims)).

Labels are stable: **T** for a threat the library must defeat, **A** for an accepted
residual risk. Other documents and issues cite them by label.

## Trust model

- **The issuer** is trusted for two things only: to put into the credential the date of
  birth that the identity check returned, and to draw good randomness. Every other
  failure of the issuer must be detectable by the verifier.
- **The wallet is not trusted.** Its holder can read and edit its code, its storage and
  its messages. Whatever the wallet states is checked by the issuer or by the verifier
  against signatures, commitments and WebAuthn data, never taken as true.
- **The verifier is not trusted** with the date of birth: it never receives the day
  count, a blinding factor or a disclosure meant for the issuer only. It is the party
  that must detect every remaining failure of the issuer and of the wallet.
- **The browser and the authenticator** are trusted to enforce origins and RP IDs, to
  sign, to perform user verification (UV) and user presence (UP), and to compute PRF
  outputs. They prove nothing about who the person is.
- **The identity-check provider** is trusted for the date of birth and the assessment it
  returns to the issuer. It decides nothing about issuance.
- **Public keys** that are distributed (the issuer's keys, the verifier's keys) are
  trusted to be authentic.

## Threats to resist

The library must defeat each of these. The functions that answer them are listed in
[integration.md](integration.md); the claims and their tests come with #6.

- **T1** A deliberately malicious holder below the requested age edits the wallet's
  code, storage, age filter, witnesses or messages to obtain an "old enough". Answered by
  the issuer's signature on the commitment and the verifier's proof check.
- **T2** A forged credential, or a forged proof of `age_in_days >= N`, built from a false
  value or from public inputs the verifier did not set. Answered by the signature checks
  and the proof check against the certified commitment.
- **T3** A copied or forwarded credential. A pair credential is useless without a fresh
  assertion by its own pair passkey; a master credential is useless without the master
  key, which cannot be extracted.
- **T4** An impersonated verifier or an altered request: a broken signature, a verifier
  that is not authorized, a wrong account, or a signed request replayed from another
  verifier's page. Answered by the request signature, the issuer's own check of it, and
  the wallet's [origin check](protocol.md#origin-check-by-the-wallet).
- **T5** A replayed assertion, proof or whole presentation under a fresh challenge.
  Answered by the binding of every proof and assertion to the request hash and the nonce,
  and by the verifier's replay cache of nonces.
- **T6** A verifier request replayed to the issuer to trigger identity checks or
  issuances. Answered by the single-use
  [issuance authorization](protocol.md#issuance-authorization).
- **T7** Correlation of one holder across verifiers or across accounts. Answered by
  [unlinkable pairs](protocol.md#unlinkability).
- **T8** Disclosure of the date of birth or of a blinding factor to a verifier.
- **T9** A downgrade to a plain `dc+sd-jwt` presentation. Answered by the mandatory
  format of [no downgrade](protocol.md#no-downgrade).
- **T10** Side channels: response sizes or errors that depend on the answer.
- **T11** Presence or verification invented by the wallet. The issuer and the verifier
  rely only on the WebAuthn data and its binding to the request.

## Accepted residual risks

These risks remain by design. Each is stated with the reason it is accepted.

- **A1** A browser or WebAuthn implementation broken on purpose, including one that lets
  a non-extractable key be exported. The platform is the root of the ceremonies.
- **A2** A real-time relay to a cooperating adult, who answers the ceremony in place of
  the holder.
- **A3** An adult who enrolled genuinely and then delegates on purpose, for example by
  lending a device that holds the master key.
- **A4** A holder who extracts their own witnesses after a genuine UV. Encryption at
  rest protects personal data from others, not from the data subject. The holder learns
  their own date of birth and blinding factors and gains nothing: a proof still needs the
  pair passkey and the certified commitment.
- **A5** A holder who damages their own wallet. The result is invalid proofs, never
  access to restricted content.
- **A6** Data that an authorized verifier receives and then leaks (see
  [Leak at a verifier](#leak-at-a-verifier)).
- **A7** An issuer that puts a wrong date of birth into a credential or uses weak
  randomness, and an identity-check provider that returns a wrong result. These are the
  trust assumptions of the [trust model](#trust-model). Any other failure of the issuer
  (a malformed credential, a wrong pair digest, a disclosure meant for the issuer left in
  a credential for a verifier) is not accepted: the verifier must detect it.
- **A8** Inference of the holder's age from the answers to repeated authorized requests
  (see [Inference from repeated requests](#inference-from-repeated-requests)).
- **A9** User verification taken as proof that the person present is the person whose
  identity was checked. It is not: UV shows that someone unlocked the authenticator.
- **A10** A wallet that, at issuance, binds a key pair already bound to another pair. A
  stateless issuer keeps no list of bound keys and cannot notice it, and the two pairs
  become linkable. A registry of bound public keys would close it at the cost of issuer
  state; the question is deferred. The same failure at presentation time is not accepted
  (see [Pair-binding failure](#pair-binding-failure)).

## Inference from repeated requests

A verifier that asks the same threshold at every view sees the answer change from
"uncertain" to "old enough" on one day. That day is when the holder turned the age on in
the wallet's age filter, not the birthday: the answer does not change by itself when the
holder reaches the age. Sizes and errors are kept the same for both answers wherever
possible. What remains is accepted as **A8**.

## Pair-binding failure

**What must not happen.** A new (verifier, account) pair sends a request, and a faulty
wallet, instead of obtaining a new credential, answers with a credential already bound to
another pair. The issuer is not involved, and the verifier receives a presentation that
is valid in every other respect. The two accounts now share a `cnf` key, a commitment and
an issuer signature: both verifiers, and any third party that sees both presentations,
can link them.

**Requirement on the wallet application.** The choice of a credential for a pair is the
only job of a small, isolated part of the wallet, the pair-binding module. It maps the
pair (the verifier's authenticated client identifier and the account token) to a
credential by exact match; any miss starts an issuance. It is kept apart from the rest of
the wallet and held to a very high level of assurance, with its own tests. It belongs to
the wallet application, not to vc-proofs.

**Second line, in vc-proofs.** Each pair credential carries a
[pair digest](protocol.md#pair-digest). The verifier recomputes it from its own request
and refuses a credential bound to another pair.

## Leak at a verifier

**What a verifier holds**, for each account: its own account data (an internal handle,
the user's login data and contact details), the pair credential (issuer signature,
commitment, `cnf` key, issuance time), the issuance authorizations it granted, and what
it keeps of the presentations (thresholds, answers, times).

**What a leak of that data cannot do:**

- reveal the date of birth: the commitment hides it, and the proofs are zero-knowledge;
- open a session or present a credential: both need the holder's passkeys, and the
  leaked nonces are spent or expired;
- link the account to the same holder's accounts at other verifiers through the
  credentials: each pair has its own;
- harm the issuer or other holders: the verifier holds no key of theirs.

**What a leak can do:**

- tie age facts to the account's contact details: an "old enough" bounds the age, and
  the day an answer changed gives the day the holder turned that age on (**A8**);
- link accounts across services through those contact details, outside this design.

**Mitigations.** A verifier should keep, per account, only the latest answer for each
threshold, and should not keep proofs once verified. The age filter keeps the answers
coarse.

## Defence in depth

A strict content security policy and origin isolation make script injection harder in an
honest wallet. They are defence in depth, not part of the soundness argument: a holder
can always edit their own wallet, and that must never produce a valid false proof.

## Claims

Added by #6: each claim that an exported function establishes, its adversary, the check
that enforces it and the test that shows it, mapped to the labels above.
