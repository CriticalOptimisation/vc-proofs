/**
 * The public documents stand on their own (#27): they cite no section of a
 * private document, link to no private repository, and quote no local notes.
 */
import { expect, test } from "vitest";
import { publicMarkdown, read } from "./markdown.js";

/** What a public document must never contain, with the reason. */
const forbidden: [RegExp, string][] = [
  [/§/, "a section mark: public documents cite their own headings"],
  [/github\.com\/CriticalOptimisation\/age-demo\b/i, "a link to the private repository"],
  [/\bage-demo\/docs\//i, "a path in the private repository"],
  [/\bdocs\/architecture\.md\b/, "a private document: this repository has none of that name"],
  [/\banalyses\//, "the local notes, never quoted"],
];

test.each(publicMarkdown())("%s has no private reference", (path) => {
  const text = read(path);
  expect(forbidden.filter(([pattern]) => pattern.test(text)).map(([, reason]) => reason)).toEqual(
    [],
  );
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #28    | no section mark or private reference (#27)                    |
