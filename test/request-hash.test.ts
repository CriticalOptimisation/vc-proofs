/**
 * `requestHash` (#29): the SHA-256 digest of a signed request object in JWS Compact
 * Serialization, as received (docs/protocol.md, *Request hash*; docs/integration.md,
 * *Request hash*). The same file runs in Node.js and in every headless browser, so the
 * vectors check the same value on every runtime.
 *
 * The function is looked up on the entry point's namespace rather than imported by name,
 * so that this file compiles before the export exists, and fails on the behaviour.
 */
import { describe, expect, test } from "vitest";
import * as entryPoint from "../src/core/index.js";
import vectors from "./vectors/request-hash.json" with { type: "json" };

const requestHash = (entryPoint as Record<string, unknown>).requestHash as (
  requestJws: unknown,
) => Promise<Uint8Array>;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("requestHash", () => {
  test("is a function exported by the low-level entry point", () => {
    expect(typeof requestHash).toBe("function");
  });

  // REVIEW PLACEHOLDER (#32: requestHash moves to the low-level entry point, ./core)
  // is a function exported by the common entry point -> is a function exported by the low-level entry point
  //
  // test("is a function exported by the common entry point", () => {
  //   expect(typeof requestHash).toBe("function");
  // });

  test.each(vectors.valid)("$name: the 32-byte SHA-256 digest of the string", async (vector) => {
    const digest = await requestHash(vector.requestJws);
    expect(digest).toBeInstanceOf(Uint8Array);
    expect(digest.length).toBe(32);
    expect(hex(digest)).toBe(vector.sha256);
  });

  test("requests one character apart have different digests", async () => {
    const names = [
      "request-object",
      "request-object-header-byte",
      "request-object-payload-byte",
      "request-object-signature-byte",
    ];
    const digests = await Promise.all(
      names.map(async (name) => {
        const vector = vectors.valid.find((candidate) => candidate.name === name);
        if (vector === undefined) throw new Error(`missing vector ${name}`);
        return hex(await requestHash(vector.requestJws));
      }),
    );
    expect(new Set(digests).size).toBe(names.length);
  });

  const valid = vectors.valid[0]?.requestJws ?? "";
  const invalid: { name: string; input: unknown }[] = [
    ...vectors.invalid,
    { name: "undefined", input: undefined },
    { name: "bytes of a valid JWS", input: new TextEncoder().encode(valid) },
  ];

  test.each(invalid)("$name: rejects with a TypeError", async ({ input }) => {
    await expect(requestHash(input)).rejects.toThrow(TypeError);
  });
});

describe("requestHash, edge cases", () => {
  const valid = vectors.valid[0]?.requestJws ?? "";

  test("hashes a 1 MiB request: no length limit", async () => {
    const large = `eyJhbGciOiJFUzI1NiJ9.${"A".repeat(1 << 20)}.c2lnbmF0dXJl`;
    const expected = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(large)),
    );
    expect(hex(await requestHash(large))).toBe(hex(expected));
  });

  test("returns a new array on each call", async () => {
    const first = await requestHash(valid);
    const expected = hex(first);
    first.fill(0);
    const second = await requestHash(valid);
    expect(second).not.toBe(first);
    expect(hex(second)).toBe(expected);
  });

  test("refuses a String object wrapping a valid request", async () => {
    await expect(requestHash(new String(valid))).rejects.toThrow(TypeError);
  });

  test("refuses a non-ASCII character in a segment", async () => {
    await expect(requestHash(`é${valid}`)).rejects.toThrow(TypeError);
  });

  test("refuses a line break inside a segment", async () => {
    await expect(requestHash(valid.replace(".", "\r\n."))).rejects.toThrow(TypeError);
  });

  test("rejects asynchronously: the call itself does not throw", async () => {
    let result: Promise<Uint8Array> | undefined;
    expect(() => {
      result = requestHash(42);
    }).not.toThrow();
    await expect(result).rejects.toThrow(TypeError);
  });

  test("the error message names no part of the input", async () => {
    const input = `${valid}.secret`;
    const error: unknown = await requestHash(input).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TypeError);
    const message = (error as TypeError).message;
    expect(message).not.toContain("secret");
    expect(message).not.toContain(valid.slice(0, 16));
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #32    | vectors and edge cases of requestHash, through ./core (#29)   |
