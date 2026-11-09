/**
 * The package as it is published: after the build, each entry point of the `exports` map
 * resolves and imports by the package's own name and exports exactly the names of its
 * layer, and the tarball holds only `dist/`, the licence files, the README and
 * `package.json`.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const require = createRequire(import.meta.url);
const tsc = require.resolve("typescript/bin/tsc");
/**
 * The public surface: each entry point of the `exports` map, and the exact names it
 * exports. `.` is the high-level API, a placeholder until #21, #22 and #23 fix its
 * functions; `./core` is the low-level API, the primitives.
 */
const surface: Record<string, string[]> = {
  "": [],
  "/core": ["BlindingContext", "BoundedInt", "RistrettoElement", "requestHash"],
};
const entries = Object.keys(surface);

/** Runs a Node.js ES module script in the repository root, as a consumer would. */
function runModule(script: string) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: root,
    encoding: "utf8",
  });
}

beforeAll(() => {
  execFileSync(process.execPath, [tsc, "-p", "tsconfig.build.json"], { cwd: root });
}, 120_000);

// Each test starts Node.js or npm, which is slow while the browser projects run.
describe("after the build", { timeout: 120_000 }, () => {
  for (const entry of entries) {
    const specifier = `@criticaloptimisation/vc-proofs${entry}`;

    test(`${specifier} resolves to dist/ and imports`, () => {
      const run = runModule(
        `const url = import.meta.resolve(${JSON.stringify(specifier)});\n` +
          `await import(url);\n` +
          `console.log(url);\n`,
      );
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
      const target = entry === "" ? "dist/index.js" : `dist${entry}/index.js`;
      expect(run.stdout.trim()).toMatch(new RegExp(`/${target.replaceAll(".", "\\.")}$`));
    });

    test(`${specifier} exports exactly ${JSON.stringify(surface[entry])}`, () => {
      const run = runModule(
        `const module = await import(${JSON.stringify(specifier)});\n` +
          `console.log(JSON.stringify(Object.keys(module).sort()));\n`,
      );
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
      expect(JSON.parse(run.stdout) as string[]).toEqual(surface[entry]);
    });
  }

  // REVIEW PLACEHOLDER (#44, second return to Task 4: every class has min and end, BoundedInt too)
  // the declarations of ./core declare BoundedInt, its constants, from, fromValue, define,
  // defineRaw, value, the errors, valueOf and toString
  //   -> the declarations of ./core declare BoundedInt, its constants with the range of
  //      BoundedInt, from, fromValue, define, defineRaw, value, the errors, valueOf and toString
  // test("the declarations of ./core declare BoundedInt, its constants, from, fromValue, define, defineRaw, value, the errors, valueOf and toString", () => {
  //   const index = readFileSync(`${root}dist/core/index.d.ts`, "utf8");
  //   expect(index).toMatch(/export \{ BoundedInt \} from "\.\/bounded-int\.js";/);
  //   const declarations = readFileSync(`${root}dist/core/bounded-int.d.ts`, "utf8");
  //   expect(declarations).toContain("export declare class BoundedInt {");
  //   expect(declarations).toContain("protected constructor(");
  //   expect(declarations).toContain("static readonly scale: number;");
  //   expect(declarations).toContain("static readonly min?: bigint;");
  //   expect(declarations).toContain("static readonly end?: bigint;");
  //   expect(declarations).toContain("static readonly integerOnly: boolean;");
  //   expect(declarations).toContain("static from(x: bigint | number, error?: number): BoundedInt;");
  //   expect(declarations).toContain("static fromValue(q: bigint, errors?: ");
  //   expect(declarations).toContain("static define(spec: ");
  //   expect(declarations).toContain("static defineRaw(spec: ");
  //   expect(declarations).toContain("get value(): bigint;");
  //   for (const error of ["errorBound", "quadraticError", "termError"]) {
  //     expect(declarations).toContain(`get ${error}(): number;`);
  //   }
  //   expect(declarations).toContain("valueOf(): number;");
  //   expect(declarations).toContain("toString(): string;");
  // });
  test("the declarations of ./core declare BoundedInt, its constants with the range of BoundedInt, from, fromValue, define, defineRaw, value, the errors, valueOf and toString", () => {
    const index = readFileSync(`${root}dist/core/index.d.ts`, "utf8");
    expect(index).toMatch(/export \{ BoundedInt \} from "\.\/bounded-int\.js";/);
    const declarations = readFileSync(`${root}dist/core/bounded-int.d.ts`, "utf8");
    expect(declarations).toContain("export declare class BoundedInt {");
    expect(declarations).toContain("protected constructor(");
    expect(declarations).toContain("static readonly scale: number;");
    expect(declarations).toContain("static readonly min: bigint;");
    expect(declarations).toContain("static readonly end: bigint;");
    expect(declarations).toContain("static readonly integerOnly: boolean;");
    expect(declarations).toContain("static from(x: bigint | number, error?: number): BoundedInt;");
    expect(declarations).toContain("static fromValue(q: bigint, errors?: ");
    expect(declarations).toContain("static define(spec: ");
    expect(declarations).toContain("static defineRaw(spec: ");
    expect(declarations).toContain("get value(): bigint;");
    for (const error of ["errorBound", "quadraticError", "termError"]) {
      expect(declarations).toContain(`get ${error}(): number;`);
    }
    expect(declarations).toContain("valueOf(): number;");
    expect(declarations).toContain("toString(): string;");
  });

  test("a path outside the exports map does not resolve", () => {
    const run = runModule(`await import("@criticaloptimisation/vc-proofs/dist/index.js");\n`);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("ERR_PACKAGE_PATH_NOT_EXPORTED");
  });

  test("the tarball holds only dist/, LICENSE, NOTICE, README.md and package.json", () => {
    const run = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    expect(run.status).toBe(0);
    const [pack] = JSON.parse(run.stdout) as [{ files: { path: string }[] }];
    const paths = pack.files.map((f) => f.path).sort();

    expect(paths.filter((p) => !p.startsWith("dist/"))).toEqual([
      "LICENSE",
      "NOTICE",
      "README.md",
      "package.json",
    ]);
    for (const entry of entries) {
      expect(paths).toContain(`dist${entry}/index.js`);
      expect(paths).toContain(`dist${entry}/index.d.ts`);
    }
    expect(
      paths.filter((p) => p.startsWith("dist/") && !/\.(js|d\.ts|d\.ts\.map)$/.test(p)),
    ).toEqual([]);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #19    | exports after the build, tarball contents                     |
// | #32    | entry points . and ./core; the exact names of each (#29)      |
// | #37    | ./core exports the derivation of a generator (#34)            |
// | #38    | ./core exports RistrettoElement, RistrettoScalar (#35)        |
// | #40    | ./core exports BlindingContext, and no RistrettoScalar (#39)   |
// | #42    | ./core exports BoundedInt, and declares it (#41)              |
// | #47    | ./core declares the constants, min and end included, and new members of BoundedInt (#44) |
