/**
 * Helpers for the documentation checks of test/docs/ (docs/development.md,
 * *Documentation checks*): the public Markdown files, their headings and GitHub
 * anchors, their links, and the host names they mention.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root, with a trailing separator. */
export const root = fileURLToPath(new URL("../..", import.meta.url));

/** Reads a file of the repository, by its path relative to the root. */
export function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

/** The public Markdown files: `README.md` and every `.md` under `docs/`, sorted. */
export function publicMarkdown(): string[] {
  const found = ["README.md"];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".md")) found.push(path);
    }
  };
  walk("docs");
  return found.sort();
}

/** The text with every fenced code block blanked, line for line. */
export function withoutFences(text: string): string {
  let fence: string | undefined;
  return text
    .split("\n")
    .map((line) => {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
      if (fence === undefined && marker !== undefined) {
        fence = marker;
        return "";
      }
      if (fence !== undefined) {
        if (marker?.startsWith(fence) === true) fence = undefined;
        return "";
      }
      return line;
    })
    .join("\n");
}

/** The text of every ATX heading outside fenced code blocks, in order. */
export function headings(text: string): string[] {
  return withoutFences(text)
    .split("\n")
    .flatMap((line) => {
      const match = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
      return match?.[1] === undefined ? [] : [match[1]];
    });
}

/**
 * The anchor GitHub gives a heading: its text without Markdown emphasis or code
 * marks, in lower case, with every character other than a letter, a digit, a
 * space, a hyphen or an underscore dropped, and each space turned into a hyphen.
 */
export function slug(heading: string): string {
  return heading
    .replace(/[`*]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/ /g, "-");
}

/** The anchors of a Markdown text, with GitHub's `-1`, `-2` suffixes for repeats. */
export function anchors(text: string): string[] {
  const seen = new Map<string, number>();
  return headings(text).map((heading) => {
    const base = slug(heading);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${String(count)}`;
  });
}

/** The targets of the inline and reference links, outside code. */
export function links(text: string): string[] {
  const prose = withoutFences(text).replace(/`[^`\n]*`/g, "");
  const inline = [...prose.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)];
  const reference = [...prose.matchAll(/^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+"[^"]*")?\s*$/gm)];
  return [...inline, ...reference].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
}

/**
 * The top-level labels that make a backquoted token count as a host name. File
 * names and property paths (`package.json`, `location.hostname`) do not end in one.
 */
const topLevelLabels = [
  "ai",
  "app",
  "care",
  "cloud",
  "co",
  "com",
  "de",
  "dev",
  "eu",
  "fr",
  "io",
  "net",
  "org",
  "uk",
];

/**
 * The host names a Markdown text mentions, code included: the host of every URL,
 * of every `did:web:` and `x509_san_dns:` value, and every backquoted token shaped
 * like a domain name whose last label is in `topLevelLabels`. In lower case.
 */
export function hosts(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\bhttps?:\/\/(?:[^@/\s]*@)?([^/\s:)>"'`\]]+)/gi)) {
    if (match[1] !== undefined) found.push(match[1]);
  }
  for (const match of text.matchAll(/\b(?:did:web|x509_san_dns):([a-z0-9.-]+)/gi)) {
    if (match[1] !== undefined) found.push(match[1]);
  }
  for (const match of text.matchAll(/`([a-z0-9-]+(?:\.[a-z0-9-]+)+)`/gi)) {
    const token = match[1];
    const last = token?.split(".").at(-1)?.toLowerCase();
    if (token !== undefined && last !== undefined && topLevelLabels.includes(last)) {
      found.push(token);
    }
  }
  return found.map((host) => host.toLowerCase().replace(/\.$/, ""));
}

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #28    | helpers of the documentation checks (#27)                     |
