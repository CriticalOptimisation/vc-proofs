/**
 * The link targets of the public contract (#27): every anchor that the issues
 * link to exists as a heading of its document, and no document repeats an
 * anchor. A renamed heading breaks the links of the issues, so it fails here.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { anchors, headings, read, root, slug } from "./markdown.js";

/** The residual risks of the threat model, group by group, most severe first (#46). */
const severity: [string, string[]][] = [
  ["circumvention-at-will", ["A1", "A7", "A9"]],
  ["limited-access", []],
  ["loss-of-privacy", ["A12", "A6", "A10", "A8"]],
  ["loss-of-access-wallet-or-issuer-failure", ["A11"]],
  ["loss-of-access-verifier-failure", []],
  ["not-a-threat", ["A2", "A3", "A5", "A4"]],
];

/** The fixed anchors of each document, by path. */
const fixed: Record<string, string[]> = {
  "docs/protocol.md": [
    "purpose-and-scope",
    "design-invariants",
    "stateless-issuer",
    "presentation-without-the-issuer",
    "one-issuance-per-request",
    "unlinkable-pairs",
    "authenticator-operations",
    "every-request-gets-a-proof",
    "the-age-filter-decides",
    "witnesses-protected-at-rest",
    "the-wallet-is-not-trusted",
    "no-downgrade",
    "time-limits-no-counters",
    "the-issuer-reads-the-day-count",
    "roles-and-trust-boundaries",
    "keys-and-credentials",
    "master-key",
    "master-credential",
    "pair-credential",
    "pair-digest",
    "witness-and-its-wrapping",
    "issuance-from-the-disclosed-day-count",
    "day-count-and-age-predicates",
    "verifier-request",
    "request-hash",
    "origin-check-by-the-wallet",
    "issuance",
    "issuance-authorization",
    "issuance-context-and-challenge",
    "first-issuance",
    "issuance-for-a-new-pair",
    "presentation",
    "presentation-challenge",
    "routine-presentation",
    "age-proof-and-answer",
    "age-filter-as-input",
    "lifetimes-and-renewal",
    "openid4vci-profile",
    "openid4vp-and-dcql-profile",
    "unlinkability",
    "deferred-work",
    "standards",
  ],
  "docs/threat-model.md": [
    "trust-model",
    "threats-to-resist",
    "accepted-residual-risks",
    ...severity.map(([anchor]) => anchor),
    "inference-from-repeated-requests",
    "pair-binding-failure",
    "leak-at-a-verifier",
    "defence-in-depth",
    "claims",
  ],
  "docs/integration.md": [
    "issuer-endpoints",
    "wallet-ceremonies",
    "verifier-endpoints",
    "what-stays-in-the-application",
  ],
};

/** The stable ids of the threat model, each the bold label of one list item. */
const ids = [
  ...Array.from({ length: 11 }, (_, i) => `T${String(i + 1)}`),
  ...Array.from({ length: 12 }, (_, i) => `A${String(i + 1)}`),
];

describe.each(Object.entries(fixed))("%s", (path, expected) => {
  test("exists", () => {
    expect(existsSync(join(root, path))).toBe(true);
  });

  test("has every fixed anchor", () => {
    const present = existsSync(join(root, path)) ? anchors(read(path)) : [];
    expect(expected.filter((anchor) => !present.includes(anchor))).toEqual([]);
  });

  test("repeats no anchor", () => {
    const slugs = existsSync(join(root, path)) ? headings(read(path)).map(slug) : [];
    expect(slugs.filter((anchor, index) => slugs.indexOf(anchor) !== index)).toEqual([]);
  });
});

test("docs/threat-model.md labels each threat and residual risk once", () => {
  const path = "docs/threat-model.md";
  const text = existsSync(join(root, path)) ? read(path) : "";
  const count = (id: string): number =>
    text.match(new RegExp(`^- \\*\\*${id}\\*\\*`, "gm"))?.length ?? 0;
  expect(ids.filter((id) => count(id) !== 1)).toEqual([]);
});

test("docs/threat-model.md orders the residual risks by severity", () => {
  const path = "docs/threat-model.md";
  const text = existsSync(join(root, path)) ? read(path) : "";
  const section = /^## Accepted residual risks$([\s\S]*?)(?=^## )/m.exec(text)?.[1] ?? "";
  const groups: [string, string[]][] = [];
  for (const line of section.split("\n")) {
    const heading = /^### (.*)$/.exec(line)?.[1];
    if (heading !== undefined) groups.push([slug(heading), []]);
    const label = /^- \*\*(A\d+)\*\*/.exec(line)?.[1];
    if (label !== undefined) {
      if (groups.length === 0) groups.push(["", []]);
      groups.at(-1)?.[1].push(label);
    }
  }
  expect(groups).toEqual(severity);
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #28    | fixed anchors and threat-model labels (#27)                   |
