/**
 * ESLint flat configuration: typescript-eslint's `strictTypeChecked` rules, and the
 * isomorphic rules of the source layout (docs/development.md).
 */
import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

/**
 * The isomorphic rules: `node:*` imports only in `src/node/`, and the `window`,
 * `document` and `navigator` globals only in `src/browser/`. They need no type
 * information, so test/tooling/isomorphic-lint.node.test.ts checks them alone.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const isomorphicRules = [
  {
    name: "vc-proofs/no-node-imports-outside-src-node",
    files: ["src/**/*.ts"],
    ignores: ["src/node/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^node:",
              message: "Node.js built-in modules are allowed only in src/node/.",
            },
          ],
        },
      ],
    },
  },
  {
    name: "vc-proofs/no-dom-globals-outside-src-browser",
    files: ["src/**/*.ts"],
    ignores: ["src/browser/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["window", "document", "navigator"].map((name) => ({
          name,
          message: `${name} is allowed only in src/browser/.`,
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
