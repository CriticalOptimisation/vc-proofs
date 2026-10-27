# vc-proofs

Holder binding and threshold proofs for verifiable credentials, as a browser library.

The package is isomorphic: one TypeScript code base, published as ES modules, runs in
the browser (the holder and the prover) and in Node.js (the issuer).

## Install

The package is published in GitHub Packages as `@criticaloptimisation/vc-proofs`.
GitHub Packages needs a token to install a package, even a public one: create a
personal access token (classic) with the `read:packages` scope, export it as
`NODE_AUTH_TOKEN`, and add to the `.npmrc` of your project:

```ini
@criticaloptimisation:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Then:

```sh
npm install @criticaloptimisation/vc-proofs
```

## Entry points

| Import                                 | Layer      | Exports                                                                     |
| -------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| `@criticaloptimisation/vc-proofs`      | high level | the functions that return signed objects and check them, for every side     |
| `@criticaloptimisation/vc-proofs/core` | low level  | the primitives, such as `requestHash`, on which the high-level API is built |

Both run in Node.js and in the browser: they use only WebCrypto, `TextEncoder`, typed
arrays and `BigInt`. The high-level entry point exports nothing yet. See
[Integration](docs/integration.md#entry-points).

The package has no runtime dependencies.

## Supported runtimes

- **Node.js 22 or later.** The floor follows the oldest Node.js LTS line that still
  receives security fixes; it rises when that line reaches its end of life.
- **Browsers that support the WebAuthn PRF extension.** The holder derives its storage
  key from the passkey's PRF output, so a browser without PRF cannot hold credentials.
  The code targets ES2022, which every such browser supports.

## Verifying a release

Each published tarball carries a GitHub artifact attestation of its build:

```sh
npm pack @criticaloptimisation/vc-proofs@<version>
gh attestation verify criticaloptimisation-vc-proofs-<version>.tgz -R CriticalOptimisation/vc-proofs
```

## Documentation

- [The age-proof protocol](docs/protocol.md): the contract that the library implements,
  its parties, credentials, flows and profiles.
- [Threat model](docs/threat-model.md): the trust model, the threats the library must
  defeat, and the residual risks it accepts.
- [Integration](docs/integration.md): the functions an issuer, a wallet and a verifier
  call at each step.
- [Development guide](docs/development.md).

## Development

See [docs/development.md](docs/development.md).

## Licence

Apache License 2.0: see [LICENSE](LICENSE) and [NOTICE](NOTICE).

<!--
Change History

| PR  | Summary |
|-----|---------|
| #19 | install, entry points, runtimes, release verification |
| #28 | Documentation section: protocol, threat model, integration |
| #32 | entry points: the high-level API and ./core (#29) |
-->
