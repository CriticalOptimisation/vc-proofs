/**
 * The isomorphic rules of the source layout (docs/development.md): `node:*` imports
 * only in `src/node/`, `window`, `document` and `navigator` only in `src/browser/`.
 *
 * The rules are the `isomorphicRules` export of `eslint.config.js`, which the default
 * export includes. They need no type information, so they are checked here on code
 * snippets placed at chosen paths.
 */
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { isomorphicRules } from "../../eslint.config.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: isomorphicRules });

async function errorsAt(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.ruleId ?? "");
}

describe("node:* imports", () => {
  const code = 'import { createHash } from "node:crypto";\nexport const h = createHash;\n';

  test("are an error in the common code", async () => {
    expect(await errorsAt("src/x.ts", code)).toEqual(["no-restricted-imports"]);
  });

  test("are an error in the browser code", async () => {
    expect(await errorsAt("src/browser/x.ts", code)).toEqual(["no-restricted-imports"]);
  });

  test("are allowed in src/node/", async () => {
    expect(await errorsAt("src/node/x.ts", code)).toEqual([]);
  });
});

describe("window, document and navigator", () => {
  for (const name of ["window", "document", "navigator"]) {
    const code = `export const g = ${name};\n`;

    test(`${name} is an error in the common code`, async () => {
      expect(await errorsAt("src/x.ts", code)).toEqual(["no-restricted-globals"]);
    });

    test(`${name} is an error in the node code`, async () => {
      expect(await errorsAt("src/node/x.ts", code)).toEqual(["no-restricted-globals"]);
    });

    test(`${name} is allowed in src/browser/`, async () => {
      expect(await errorsAt("src/browser/x.ts", code)).toEqual([]);
    });
  }
});
