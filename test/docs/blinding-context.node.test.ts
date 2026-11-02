/**
 * docs/core/blinding-context.md documents every public member of `BlindingContext`
 * (#39), in the section of the class, and quotes the serialization that the code gives
 * for the age-check context. The members are read from the class, so a member added
 * without its documentation fails here.
 *
 * The class is looked up on the entry point's namespace, so that this file compiles
 * before the export exists.
 */
import { describe, expect, test } from "vitest";
import * as entryPoint from "../../src/core/index.js";
import vectors from "../vectors/blinding-context.json" with { type: "json" };
import { read } from "./markdown.js";

interface ContextClass {
  readonly prototype: unknown;
  fromEncoded(h: Uint8Array, message: Uint8Array): { serialize(): Promise<Uint8Array> };
}

const BlindingContext = (entryPoint as Record<string, unknown>).BlindingContext as
  ContextClass | undefined;
const page = read("docs/core/blinding-context.md");

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** The text of the section `## <title>`, up to the next `## ` heading. */
function section(title: string): string {
  const start = page.indexOf(`\n## ${title}\n`);
  expect(start).toBeGreaterThan(-1);
  const end = page.indexOf("\n## ", start + 1);
  return page.slice(start, end === -1 ? undefined : end);
}

/** The public members of a class: its static members and those of its prototype. */
function members(cls: { readonly prototype: unknown } | undefined): string[] {
  if (cls === undefined) return [];
  const statics = Object.getOwnPropertyNames(cls).filter(
    (name) => !["length", "name", "prototype"].includes(name),
  );
  const instance = Object.getOwnPropertyNames(cls.prototype as object).filter(
    (name) => name !== "constructor",
  );
  return [...statics.map((name) => `static ${name}`), ...instance];
}

describe("docs/core/blinding-context.md, section BlindingContext", () => {
  test("the class has the public members of the plan", () => {
    expect(members(BlindingContext).sort()).toEqual(
      ["blind", "group", "h", "isOpeningOf", "message", "serialize", "static fromEncoded"].sort(),
    );
  });

  test.each(members(BlindingContext))("names `%s` in the table of the class", (member) => {
    // A member is named in backquotes, as `name(…)` or as `name` for a property.
    const escaped = member.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(section("BlindingContext")).toMatch(new RegExp("`" + escaped + "[`(]"));
  });
});

test("docs/core/blinding-context.md quotes the serialization of the age-check context, as computed", async () => {
  expect(typeof BlindingContext?.fromEncoded).toBe("function");
  const context = BlindingContext?.fromEncoded(
    fromHex(vectors.context.h),
    fromHex(vectors.context.messageHex),
  );
  const serialized = hex((await context?.serialize()) ?? new Uint8Array());
  expect(serialized).toBe(vectors.context.serialized);
  expect(page).toContain(serialized);
  expect(page).toContain(vectors.suiteNameHex);
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #39    | new: the page names every public member, and the serialization |
