/**
 * The file suffixes of docs/development.md (*Tests*): each Vitest project collects the
 * files it must run, and only those. Checked with `vitest list --filesOnly`, which globs
 * without starting a browser.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const require = createRequire(import.meta.url);
const vitest = join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");

/** The test files of each project, by project name, relative to the repository root. */
const byProject = new Map<string, string[]>();

// vitest list is slow while the browser projects run, hence the long timeout.
beforeAll(() => {
  const run = spawnSync(process.execPath, [vitest, "list", "--filesOnly", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  for (const { file, projectName } of JSON.parse(run.stdout) as Listed[]) {
    // A browser project is listed with its instance, as in "chromium (chromium)".
    const name = projectName.replace(/ \(.*\)$/, "");
    const files = byProject.get(name) ?? [];
    files.push(relative(root, file).replaceAll("\\", "/"));
    byProject.set(name, files);
  }
}, 120_000);

interface Listed {
  file: string;
  projectName: string;
}

function collected(name: string): string[] {
  return [...(byProject.get(name) ?? [])].sort();
}

const isNodeOnly = (f: string) => f.endsWith(".node.test.ts");
const isChromiumOnly = (f: string) => f.endsWith(".chromium.test.ts");

describe("each project collects its files", () => {
  test("node: every test file except *.chromium.test.ts", () => {
    const files = collected("node");
    expect(files).toContain("test/smoke/es256.test.ts");
    expect(files).toContain("test/tooling/isomorphic-lint.node.test.ts");
    expect(files.filter(isChromiumOnly)).toEqual([]);
  });

  test("chromium: every test file except *.node.test.ts", () => {
    const files = collected("chromium");
    expect(files).toContain("test/smoke/es256.test.ts");
    expect(files).toContain("test/smoke/prf.chromium.test.ts");
    expect(files.filter(isNodeOnly)).toEqual([]);
  });

  for (const name of ["firefox", "webkit"]) {
    test(`${name}: neither *.node.test.ts nor *.chromium.test.ts`, () => {
      const files = collected(name);
      expect(files).toContain("test/smoke/es256.test.ts");
      expect(files.filter((f) => isNodeOnly(f) || isChromiumOnly(f))).toEqual([]);
    });
  }

  test("the helpers are not collected as tests", () => {
    for (const name of ["node", "chromium", "firefox", "webkit"]) {
      expect(collected(name).filter((f) => f.startsWith("test/helpers/"))).toEqual([]);
    }
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #19    | files collected by each project                               |
