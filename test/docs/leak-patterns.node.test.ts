/**
 * The private exclusion list (#27): no file that git tracks contains a value of
 * it. The values are never in the repository. They come from the `LEAK_PATTERNS`
 * environment variable (a CI secret), or else from `.leak-patterns` at the
 * repository root, which git ignores: one literal per line, `#` starts a comment,
 * matched without regard to case. With neither, the check is skipped, and its
 * title says so.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { read, root } from "./markdown.js";

function source(): string | undefined {
  const env = process.env["LEAK_PATTERNS"];
  if (env !== undefined && env.trim() !== "") return env;
  return existsSync(join(root, ".leak-patterns")) ? read(".leak-patterns") : undefined;
}

const text = source();
const patterns = (text ?? "")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"))
  .map((line) => line.toLowerCase());

test.skipIf(text === undefined)(
  text === undefined
    ? "no private pattern list (set LEAK_PATTERNS or create .leak-patterns): leak check skipped"
    : `no tracked file contains one of the ${String(patterns.length)} private patterns`,
  () => {
    expect(patterns.length).toBeGreaterThan(0);
    const listed = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
    expect(listed.status).toBe(0);
    const files = listed.stdout.split("\0").filter((f) => f !== "" && f !== "package-lock.json");
    const leaks: string[] = [];
    for (const file of files) {
      if (!existsSync(join(root, file))) continue;
      const content = read(file);
      if (content.includes("\0")) continue;
      const lower = content.toLowerCase();
      // The pattern itself is never printed: its index in the list is enough.
      patterns.forEach((pattern, index) => {
        if (lower.includes(pattern)) leaks.push(`${file}: pattern ${String(index + 1)}`);
      });
    }
    expect(leaks).toEqual([]);
  },
);
