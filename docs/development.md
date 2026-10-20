# Development guide

This guide covers the tooling of the repository: the Node.js versions, the build, the
tests, lint, CI, the dependency policy and the release procedure.

## Node.js versions

| Use           | Version               | Where it is set                  |
| ------------- | --------------------- | -------------------------------- |
| Development   | Node.js 26            | `.node-version`                  |
| Runtime floor | Node.js 22 or later   | `engines.node` in `package.json` |
| CI            | Node.js 22, 24 and 26 | `.github/workflows/ci.yml`       |

Development runs on the newest line, whose JavaScript engine is the closest to the
browsers that run the WebAuthn ceremonies. CI also tests the floor, so code that uses
an API too new for Node.js 22 fails there, not in production.

`.node-version` is read by [fnm](https://github.com/Schniz/fnm) and by
`actions/setup-node`. With fnm:

```sh
fnm install          # installs the version named in .node-version
fnm use              # or enable `fnm env --use-on-cd` in your shell
fnm install 22       # to run the tests on the floor as well
```

`.npmrc` sets `engine-strict=true`: npm refuses to install on a Node.js version below
the floor.

## Getting started

```sh
npm ci
npx playwright install chromium firefox webkit
npm test
```

`npm ci` installs exactly what `package-lock.json` records. The Playwright browsers are
downloaded to `~/.cache/ms-playwright`; on a fresh Linux machine,
`npx playwright install --with-deps` also installs their system libraries.

## Scripts

| Script                 | Runs                                                                          |
| ---------------------- | ----------------------------------------------------------------------------- |
| `npm run build`        | `tsc -p tsconfig.build.json`: compiles `src/` to `dist/`, with `.d.ts` files  |
| `npm run typecheck`    | `tsc`: type-checks `src/`, `test/` and the configuration files, emits nothing |
| `npm run lint`         | `eslint .`                                                                    |
| `npm run format`       | `prettier --write .`                                                          |
| `npm run format:check` | `prettier --check .`                                                          |
| `npm test`             | every test project                                                            |
| `npm run test:node`    | the `node` project only                                                       |
| `npm run test:browser` | the `chromium`, `firefox` and `webkit` projects                               |

## Source layout and the isomorphic rules

| Directory      | Entry point | May use                                                                               |
| -------------- | ----------- | ------------------------------------------------------------------------------------- |
| `src/`         | `.`         | WebCrypto (`globalThis.crypto`), `TextEncoder`, `TextDecoder`, typed arrays, `BigInt` |
| `src/node/`    | `./node`    | the above, and Node.js built-in modules (`node:*`)                                    |
| `src/browser/` | `./browser` | the above, and WebAuthn and the DOM                                                   |

Lint enforces the split:

- an import of `node:*` is an error outside `src/node/` and `test/`;
- a reference to `window`, `document` or `navigator` is an error outside `src/browser/`
  and `test/`.

The code is TypeScript in strict mode (with `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`), compiled to ES2022 ES modules with `NodeNext` module
resolution. Every relative import therefore names its `.js` file, so the output runs
as it is in Node.js and in the browser. The build is `tsc` alone: there is no bundler
step, so nothing is added to the published code, and no third-party script can reach
the holder window.

Avoid APIs that Node.js 22 or the browsers with WebAuthn PRF lack, even when the
development version has them: `Uint8Array.fromBase64`, for instance, exists in
Node.js 26 but not in Node.js 22.

## Tests

Tests are written with [Vitest](https://vitest.dev/). One configuration,
`vitest.config.ts`, runs the same test files in several projects:

| Project    | Runs in           | Collects                                                      |
| ---------- | ----------------- | ------------------------------------------------------------- |
| `node`     | Node.js           | `*.test.ts`, except `*.chromium.test.ts`                      |
| `chromium` | headless Chromium | `*.test.ts`, except `*.node.test.ts`                          |
| `firefox`  | headless Firefox  | `*.test.ts`, except `*.node.test.ts` and `*.chromium.test.ts` |
| `webkit`   | headless WebKit   | `*.test.ts`, except `*.node.test.ts` and `*.chromium.test.ts` |

The suffix of a test file says where it runs:

- `*.test.ts`: everywhere. This is the default for the isomorphic code.
- `*.node.test.ts`: in Node.js only, for the issuer and for tooling tests.
- `*.chromium.test.ts`: in Chromium only. WebAuthn tests must use it, because only
  Chromium offers a virtual authenticator to the tests.

To run one project or one file:

```sh
npx vitest run --project chromium
npx vitest run test/smoke/es256.test.ts
```

### WebAuthn tests

`test/helpers/virtual-authenticator.ts` exports `withVirtualAuthenticator(options, fn)`.
Through the Chrome DevTools Protocol, it adds a virtual CTAP 2.1 platform authenticator
to the page, with resident keys, user verification and the PRF extension; runs `fn`;
and removes the authenticator, even when `fn` throws. The options turn user
verification, user presence or PRF off, to test the refusal paths:

```ts
import { withVirtualAuthenticator } from "../helpers/virtual-authenticator.js";

await withVirtualAuthenticator({}, async () => {
  // navigator.credentials.create(...) and get(...) succeed here,
  // with UP and UV set and a PRF output.
});
```

The relying party ID of these tests is `location.hostname`, which is `localhost` under
the test server: a secure context, so WebAuthn is available. The virtual authenticator
does not replace a test on a real device: the PRF support of the phones is measured
separately (#7).

## Lint and formatting

ESLint uses the flat configuration `eslint.config.js`, with typescript-eslint's
`strictTypeChecked` rules and the isomorphic rules above. Formatting is Prettier's;
CI checks it with `npm run format:check`.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on every push to `main`:

| Job            | Node.js    | Does                                                                                |
| -------------- | ---------- | ----------------------------------------------------------------------------------- |
| `lint`         | 26         | lint, format check, type check                                                      |
| `audit`        | 26         | `npm audit --audit-level=high`, `npm audit signatures`                              |
| `test-node`    | 22, 24, 26 | the `node` project                                                                  |
| `test-browser` | 26         | the `chromium`, `firefox` and `webkit` projects                                     |
| `build`        | 26         | the build; imports each entry point by the package's own name; `npm pack --dry-run` |
| `ci`           |            | succeeds only when every job above succeeded                                        |

`ci` is the one check that branch protection requires before a merge. The workflows
have read-only permissions, and every action is pinned by its commit SHA.

## Dependencies

- `package-lock.json` is committed, and CI installs with `npm ci`.
- `.npmrc` sets `save-exact=true`: every dependency is recorded at an exact version.
- CI audits the dependencies and their registry signatures (`audit` job).
- Dependabot proposes updates of the npm packages and of the GitHub Actions every
  week, as pull requests that go through the usual review.
- The package has **no runtime dependencies**. A pull request that adds one must say
  why the platform (WebCrypto, WebAuthn) is not enough.

## Releasing

1. In a pull request, set `version` in `package.json` to the new version, following
   [Semantic Versioning](https://semver.org/). While the version is 0.x, raising the
   Node.js floor is a minor change; from 1.0 it is a major one.
2. Once it is merged, create a GitHub Release on `main` whose tag is `v` followed by
   the version, for instance `v0.2.0`.
3. The release starts `.github/workflows/publish.yml`. It runs the whole CI, checks
   that the tag matches `version`, builds and packs the tarball, attests its build
   provenance, and publishes it to GitHub Packages.

To check the publish workflow without publishing, run it by hand from the _Actions_
tab (_Run workflow_): the `dry_run` input is true by default, and `npm publish` then
only reports what it would publish.

<!--
Change History

| PR  | Summary |
|-----|---------|
| #19 | development guide: Node.js, scripts, layout, tests, CI, release |
-->
