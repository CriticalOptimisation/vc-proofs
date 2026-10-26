/**
 * Example host names only (#27): a public document names no real deployment.
 * Every host it mentions is an RFC 2606 name, `localhost`, or a site on the
 * allow-list below (standards and the tools the guides link to).
 */
import { expect, test } from "vitest";
import { hosts, publicMarkdown, read } from "./markdown.js";

const allowed = new Set([
  "github.com",
  "npm.pkg.github.com",
  "semver.org",
  "vitest.dev",
  "openid.net",
  "www.rfc-editor.org",
  "datatracker.ietf.org",
  "www.w3.org",
  "storage.spec.whatwg.org",
]);

function isExample(host: string): boolean {
  return (
    host === "localhost" ||
    host === "example" ||
    host.endsWith(".example") ||
    /^(?:.+\.)?example\.(?:com|net|org)$/.test(host) ||
    allowed.has(host)
  );
}

test.each(publicMarkdown())("%s names example hosts only", (path) => {
  expect([...new Set(hosts(read(path)))].filter((host) => !isExample(host))).toEqual([]);
});
