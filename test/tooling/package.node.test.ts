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
  "/core": ["BlindingContext", "RistrettoElement", "requestHash"],
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

  // REVIEW PLACEHOLDER (#48: ./core exports no BoundedInt; the class of the group comes from BlindingContext.boundedInt())
  // the declarations of ./core export BoundedInt from ristretto.ts: a class that extends the generic one, with its own min and max only
  //   -> the declarations of ./core export no BoundedInt, and the types Committed, Blinded and Group of blinding-context.ts; ristretto.ts declares no BoundedInt
  // test("the declarations of ./core export BoundedInt from ristretto.ts: a class that extends the generic one, with its own min and max only", () => {
  //   const index = readFileSync(`${root}dist/core/index.d.ts`, "utf8");
  //   expect(index).toMatch(/export \{[^}]*\bBoundedInt\b[^}]*\} from "\.\/ristretto\.js";/);
  //   expect(index).not.toContain("./bounded-int.js");
  //   const declarations = readFileSync(`${root}dist/core/ristretto.d.ts`, "utf8");
  //   expect(declarations).toMatch(
  //     /import \{ BoundedInt as (\w+)\b[^}]*\} from "\.\/bounded-int\.js";/,
  //   );
  //   const base = /import \{ BoundedInt as (\w+)/.exec(declarations)?.[1] ?? "";
  //   expect(declarations).toContain(`export declare class BoundedInt extends ${base} {`);
  //   expect(declarations).toContain("static readonly min: Quantity;");
  //   expect(declarations).toContain("static readonly max: Quantity;");
  //   const own = /export declare class BoundedInt extends \w+ \{([^}]*)\}/.exec(declarations);
  //   expect(own?.[1]).not.toMatch(/order|define/);
  //   expect(declarations).not.toContain("RistrettoBoundedIntSpec");
  // });
  test("the declarations of ./core export no BoundedInt, and the types Committed, Blinded and Group of blinding-context.ts; ristretto.ts declares no BoundedInt", () => {
    const index = readFileSync(`${root}dist/core/index.d.ts`, "utf8");
    expect(index).not.toMatch(/\bBoundedInt\b/);
    expect(index).not.toContain("./bounded-int.js");
    const types = /export type \{([^}]*)\} from "\.\/blinding-context\.js";/.exec(index)?.[1];
    expect(
      types
        ?.split(",")
        .map((name) => name.trim())
        .sort(),
    ).toEqual(["Blinded", "Committed", "Group"]);
    const ristretto = readFileSync(`${root}dist/core/ristretto.d.ts`, "utf8");
    expect(ristretto).not.toMatch(/\bBoundedInt\b/);
    const context = readFileSync(`${root}dist/core/blinding-context.d.ts`, "utf8");
    expect(context).toMatch(/export interface Committed<E/);
    expect(context).toMatch(/export interface Blinded<E/);
    expect(context).toMatch(/static boundedInt\(\): typeof \w+;/);
    expect(context).toMatch(/\n\s+boundedInt\(\): typeof \w+;/);
    expect(context).toMatch(/readonly ORDER: bigint;/);
  });

  test("the declarations of bounded-int.ts declare the generic BoundedInt, its constants without integerOnly nor order, the quantities, from, fromValue, define typed as its class, low, high, the errors of the class, value, valueOf, toString and toLocaleString", () => {
    const declarations = readFileSync(`${root}dist/core/bounded-int.d.ts`, "utf8");
    expect(declarations).toContain("export declare class BoundedInt {");
    expect(declarations).toContain("protected constructor(value: bigint);");
    expect(declarations).toContain("export type Quantity = bigint | number | Decimal;");
    expect(declarations).toContain("static readonly scale: number;");
    expect(declarations).toContain("static readonly min: Quantity;");
    expect(declarations).toContain("static readonly max: Quantity;");
    expect(declarations).not.toContain("integerOnly");
    expect(declarations).not.toMatch(/\border\b/);
    expect(declarations).not.toContain("BoundedIntOrder");
    expect(declarations).toContain("static readonly error?: Quantity;");
    expect(declarations).toContain("static from(x: Quantity): BoundedInt;");
    expect(declarations).toContain("static fromValue(q: bigint): BoundedInt;");
    expect(declarations).toMatch(
      /static define<T extends \w+>\(this: T, spec: BoundedIntSpec\): T;/,
    );
    expect(declarations).toContain("static get low(): bigint;");
    expect(declarations).toContain("static get high(): bigint;");
    expect(declarations).not.toContain("defineRaw");
    for (const error of ["errorBound", "quadraticError", "termError"]) {
      expect(declarations).toContain(`static get ${error}(): number;`);
    }
    expect(declarations).toContain("get value(): bigint;");
    expect(declarations).toContain("valueOf(): number;");
    expect(declarations).toContain("toString(): string;");
    expect(declarations).toContain("toLocaleString(");
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
// | #51    | ./core exports BoundedInt from ristretto.ts and declares it (#49) |
// | #53    | declarations without order, RistrettoBoundedIntSpec or define override; low, high, define<T> (#52) |
