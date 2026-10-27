/**
 * The isomorphic and layering rules of the source layout (docs/development.md): no
 * `node:*` import and no `window`, `document` or `navigator` global in `src/`; the
 * high-level code reaches `src/core/` only through `src/core/index.ts`, and `src/core/`
 * imports nothing outside it.
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

  test("are an error in the high-level code", async () => {
    expect(await errorsAt("src/x.ts", code)).toEqual(["no-restricted-imports"]);
  });

  test("are an error in the low-level code", async () => {
    expect(await errorsAt("src/core/x.ts", code)).toEqual(["no-restricted-imports"]);
  });

  // REVIEW PLACEHOLDER (#32: src/browser/ and src/node/ are gone; node:* is an error in all of src/)
  // are an error in the common code -> are an error in the high-level code
  // are an error in the browser code -> are an error in the high-level code
  // are allowed in src/node/ -> are an error in the low-level code
  //
  // test("are an error in the common code", async () => {
  //   expect(await errorsAt("src/x.ts", code)).toEqual(["no-restricted-imports"]);
  // });
  //
  // test("are an error in the browser code", async () => {
  //   expect(await errorsAt("src/browser/x.ts", code)).toEqual(["no-restricted-imports"]);
  // });
  //
  // test("are allowed in src/node/", async () => {
  //   expect(await errorsAt("src/node/x.ts", code)).toEqual([]);
  // });
});

describe("window, document and navigator", () => {
  for (const name of ["window", "document", "navigator"]) {
    const code = `export const g = ${name};\n`;

    test(`${name} is an error in the high-level code`, async () => {
      expect(await errorsAt("src/x.ts", code)).toEqual(["no-restricted-globals"]);
    });

    test(`${name} is an error in the low-level code`, async () => {
      expect(await errorsAt("src/core/x.ts", code)).toEqual(["no-restricted-globals"]);
    });

    // REVIEW PLACEHOLDER (#32: src/browser/ and src/node/ are gone; the globals are an error in all of src/)
    // ${name} is an error in the common code -> ${name} is an error in the high-level code
    // ${name} is an error in the node code -> ${name} is an error in the low-level code
    // ${name} is allowed in src/browser/ -> ${name} is an error in the low-level code
    //
    // test(`${name} is an error in the common code`, async () => {
    //   expect(await errorsAt("src/x.ts", code)).toEqual(["no-restricted-globals"]);
    // });
    //
    // test(`${name} is an error in the node code`, async () => {
    //   expect(await errorsAt("src/node/x.ts", code)).toEqual(["no-restricted-globals"]);
    // });
    //
    // test(`${name} is allowed in src/browser/`, async () => {
    //   expect(await errorsAt("src/browser/x.ts", code)).toEqual([]);
    // });
  }
});

describe("layering: the high-level code and src/core/", () => {
  test("the high-level code may import src/core/index.js", async () => {
    const code = 'export { requestHash } from "./core/index.js";\n';
    expect(await errorsAt("src/x.ts", code)).toEqual([]);
  });

  test("the high-level code may not import another file of src/core/", async () => {
    const code =
      'import { requestHash } from "./core/request-hash.js";\nexport const r = requestHash;\n';
    expect(await errorsAt("src/x.ts", code)).toEqual(["no-restricted-imports"]);
  });

  test("the high-level code may not re-export another file of src/core/", async () => {
    const code = 'export { requestHash } from "./core/request-hash.js";\n';
    expect(await errorsAt("src/x.ts", code)).toEqual(["no-restricted-imports"]);
  });

  test("the rule holds from a subdirectory of the high-level code", async () => {
    const allowed = 'export { requestHash } from "../core/index.js";\n';
    const refused = 'export { requestHash } from "../core/request-hash.js";\n';
    expect(await errorsAt("src/issuer/x.ts", allowed)).toEqual([]);
    expect(await errorsAt("src/issuer/x.ts", refused)).toEqual(["no-restricted-imports"]);
  });

  test("src/core/ may import its own files", async () => {
    const code = 'export { requestHash } from "./request-hash.js";\n';
    expect(await errorsAt("src/core/x.ts", code)).toEqual([]);
  });

  test("src/core/ may not import the high-level code", async () => {
    const code = 'export * from "../index.js";\n';
    expect(await errorsAt("src/core/x.ts", code)).toEqual(["no-restricted-imports"]);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #19    | the isomorphic lint rules                                     |
// | #32    | no node:* or DOM global in src/; the core layering (#29)      |
