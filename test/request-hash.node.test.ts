/**
 * The vectors of `requestHash` (#29), checked against an implementation independent of
 * the WebCrypto call under test: `node:crypto`'s `createHash`. Also checks that each vector
 * is filed on the right side of the compact JWS grammar of docs/integration.md, *Request
 * hash*. This test reads only the vectors file, so it guards against a typo in a digest or
 * a misfiled vector, whatever the state of the library.
 */
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import vectors from "./vectors/request-hash.json" with { type: "json" };

const compactJws = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

describe("request-hash.json", () => {
  test.each(vectors.valid)("$name: sha256 is the digest of requestJws", (vector) => {
    expect(createHash("sha256").update(vector.requestJws, "ascii").digest("hex")).toBe(
      vector.sha256,
    );
  });

  test.each(vectors.valid)("$name: requestJws is a compact JWS", (vector) => {
    expect(vector.requestJws).toMatch(compactJws);
  });

  test.each(vectors.invalid)("$name: input is not a compact JWS", ({ input }) => {
    expect(typeof input === "string" && compactJws.test(input)).toBe(false);
  });
});
