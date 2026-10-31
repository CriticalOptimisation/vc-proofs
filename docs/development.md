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

| Directory   | Entry point | Layer                                         |
| ----------- | ----------- | --------------------------------------------- |
| `src/`      | `.`         | high level: the functions that sign and check |
| `src/core/` | `./core`    | low level: the primitives                     |

All of `src/` may use only WebCrypto (`globalThis.crypto`), `TextEncoder`,
`TextDecoder`, typed arrays and `BigInt`, so the same code runs in Node.js and in the
browser. Lint enforces the rules:

- an import of `node:*` is an error in `src/`;
- a reference to `window`, `document` or `navigator` is an error in `src/`;
- the high-level code imports from `src/core/` only its entry point,
  `src/core/index.ts` (as `./core/index.js`);
- the code of `src/core/` imports nothing outside `src/core/`, which is flat, except
  the runtime dependency `@noble/curves` (see [Dependencies](#dependencies)).

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

### Documentation checks

The tests of `test/docs/` (Node.js only) keep the public documents, `README.md` and
every Markdown file under `docs/`, fit for a public repository:

- **Anchors**: the headings that issues and documents link to exist, and no document
  repeats one. Renaming such a heading fails the check: update the links first.
- **No private reference**: no section mark, no link to a private repository, no
  quotation of the git-ignored local design notes.
- **Example host names**: every host a document names, in a URL, a `did:web:` or
  `x509_san_dns:` value or a backquoted domain name, is an example name of RFC 2606
  (`verifier.example`, `example.com`), `localhost`, or a site on the allow-list of
  `test/docs/hosts.node.test.ts`.
- **Private patterns**: no file that git tracks contains a value of the private
  exclusion list. The list is never committed. The test reads it from the
  `LEAK_PATTERNS` environment variable, or else from `.leak-patterns` at the repository
  root, which git ignores and `worktree.sh` links into each worktree: one literal per
  line, `#` for comments, compared without regard to case. In CI, `LEAK_PATTERNS` comes
  from the repository secret of that name. Without either, the test is skipped, and its
  title says so: a check before a pull request must not be skipped.
- **Links**: every relative link resolves to a file, and every `#fragment` to a heading
  of that file.

## Lint and formatting

ESLint uses the flat configuration `eslint.config.js`, with typescript-eslint's
`strictTypeChecked` rules and the isomorphic rules above. Formatting is Prettier's;
CI checks it with `npm run format:check`.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on every push to `main`:

| Job             | Node.js    | Does                                                                                |
| --------------- | ---------- | ----------------------------------------------------------------------------------- |
| `lint`          | 26         | lint, format check, type check                                                      |
| `audit`         | 26         | `npm audit --audit-level=high`, `npm audit signatures`                              |
| `test-node`     | 22, 24, 26 | the `node` project                                                                  |
| `test-browser`  | 26         | the `chromium`, `firefox` and `webkit` projects                                     |
| `build`         | 26         | the build; imports each entry point by the package's own name; `npm pack --dry-run` |
| `independent-h` |            | the independent check of the generator vectors (see below)                          |
| `ci`            |            | succeeds only when every job above succeeded                                        |

The `independent-h` job installs libsodium and runs
`python3 tools/generator-h/reference.py check`: a Python and libsodium implementation
of the derivation of [the generator h](generator-h.md), written apart from the
TypeScript code, recomputes `test/vectors/generator-h.json` and fails on any
difference. To regenerate the file after a deliberate change, run
`python3 tools/generator-h/reference.py vectors`, then `npx prettier --write` on it.

`ci` is the one check that branch protection requires before a merge. The workflows
have read-only permissions, and every action is pinned by its commit SHA.

## Dependencies

- `package-lock.json` is committed, and CI installs with `npm ci`.
- `.npmrc` sets `save-exact=true`: every dependency is recorded at an exact version.
- CI audits the dependencies and their registry signatures (`audit` job).
- Dependabot proposes updates of the npm packages and of the GitHub Actions every
  week, as pull requests that go through the usual review.
- The package has **one runtime dependency**, `@noble/curves`, which brings
  `@noble/hashes`. WebCrypto has no point arithmetic, and the Pedersen commitments
  need the group ristretto255 ([The generator h](generator-h.md)). Everything else,
  SHA-512 included, comes from WebCrypto. A pull request that adds another dependency
  must say why the platform (WebCrypto, WebAuthn) and this one are not enough.
- One development dependency is a cryptographic library: `libsodium-wrappers-sumo`,
  libsodium compiled to WebAssembly. The tests of `RistrettoElement` and
  `RistrettoScalar` compare them with it in every test project, so that their expected
  values never come from code of vc-proofs
  ([Checked against libsodium](core/ristretto255.md#checked-against-libsodium)). It is
  not a runtime dependency: `dist/` and the published package do not contain it, and
  lint forbids `src/core/` to import it.

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
| #28 | Documentation checks |
| #32 | the high- and low-level layers; isomorphic rules for all of src/ (#29) |
| #37 | the runtime dependency @noble/curves; the independent-h job (#34) |
-->
