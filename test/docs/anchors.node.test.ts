/**
 * The link targets of the public contract (#27): every anchor that the issues
 * link to exists as a heading of its document, and no document repeats an
 * anchor. A renamed heading breaks the links of the issues, so it fails here.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { anchors, headings, read, root, slug } from "./markdown.js";

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
  ...Array.from({ length: 10 }, (_, i) => `A${String(i + 1)}`),
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
