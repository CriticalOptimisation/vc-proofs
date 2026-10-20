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

| Import                                    | For                        | May use                                          |
| ----------------------------------------- | -------------------------- | ------------------------------------------------ |
| `@criticaloptimisation/vc-proofs`         | code common to every side  | WebCrypto, `TextEncoder`, typed arrays, `BigInt` |
| `@criticaloptimisation/vc-proofs/node`    | the issuer, in Node.js     | the above, and Node.js built-in modules          |
| `@criticaloptimisation/vc-proofs/browser` | the holder, in the browser | the above, and WebAuthn and the DOM              |

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

## Development

See [docs/development.md](docs/development.md).

## Licence

Apache License 2.0: see [LICENSE](LICENSE) and [NOTICE](NOTICE).

<!--
Change History

| PR  | Summary |
|-----|---------|
| #19 | install, entry points, runtimes, release verification |
-->
