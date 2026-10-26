/**
 * The relative links of the public documents resolve (#27): to an existing file,
 * and, with a `#fragment`, to a heading of that file.
 */
import { existsSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { expect, test } from "vitest";
import { anchors, links, publicMarkdown, read, root } from "./markdown.js";

function broken(path: string): string[] {
  const result: string[] = [];
  for (const link of links(read(path))) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(link)) continue; // https:, mailto: and the like
    const [file = "", fragment] = link.split("#", 2);
    const target = file === "" ? path : normalize(join(dirname(path), decodeURI(file)));
    const absolute = join(root, target);
    if (!existsSync(absolute)) {
      result.push(`${link}: no file ${target}`);
      continue;
    }
    if (fragment !== undefined && fragment !== "") {
      if (statSync(absolute).isDirectory() || !target.endsWith(".md")) {
        result.push(`${link}: a fragment on a file that is not Markdown`);
      } else if (!anchors(read(target)).includes(decodeURIComponent(fragment))) {
        result.push(`${link}: no heading #${fragment} in ${target}`);
      }
    }
  }
  return result;
}

test.each(publicMarkdown())("%s has no broken relative link", (path) => {
  expect(broken(path)).toEqual([]);
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #28    | relative links and anchors resolve (#27)                      |
