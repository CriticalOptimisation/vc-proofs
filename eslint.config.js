/**
 * ESLint flat configuration: typescript-eslint's `strictTypeChecked` rules, and the
 * isomorphic rules of the source layout (docs/development.md).
 */
import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

/** Node.js built-in modules: the source runs in Node.js and in the browser alike. */
const nodeImports = {
  regex: "^node:",
  message: "Node.js built-in modules are not allowed in src/.",
};

/** libsodium is a development dependency: the tests compare the code with it. */
const libsodiumImports = {
  regex: "^libsodium",
  message: "libsodium is a development dependency, for the tests only: src/ may not import it.",
};

/**
 * The isomorphic and layering rules of the source layout (docs/development.md): no
 * `node:*` import, no libsodium import and no `window`, `document` or `navigator`
 * global in `src/`; the high-level code reaches `src/core/` only through
 * `src/core/index.ts`, and the code of `src/core/` imports nothing outside it
 * (`src/core/` is flat). They need no type
 * information, so test/tooling/isomorphic-lint.node.test.ts checks them alone.
 *
 * Each file gets one `no-restricted-imports` entry: a later entry for the same file
 * would replace the patterns of an earlier one.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const isomorphicRules = [
  {
    name: "vc-proofs/high-level-imports",
    files: ["src/**/*.ts"],
    ignores: ["src/core/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            nodeImports,
            libsodiumImports,
            {
              regex: "(^|/)core/(?!index\\.js$)",
              message: "The high-level code reaches src/core/ only through src/core/index.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    name: "vc-proofs/low-level-imports",
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            nodeImports,
            libsodiumImports,
            {
              regex: "^\\.\\./",
              message: "The code of src/core/ imports nothing outside src/core/.",
            },
          ],
        },
      ],
    },
  },
  {
    name: "vc-proofs/no-dom-globals-in-src",
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["window", "document", "navigator"].map((name) => ({
          name,
          message: `${name} is not allowed in src/.`,
        })),
      ],
    },
  },
];

export default defineConfig(
  { ignores: ["dist/", "coverage/"] },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  isomorphicRules,
);

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #19    | strictTypeChecked and the isomorphicRules export              |
// | #32    | no node:* or DOM global in src/; the core layering (#29)      |
