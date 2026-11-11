/**
 * docs/core/blinding-context.md documents every public member of `BlindingContext`
 * (#39), in the section of the class, and quotes the serialization that the code gives
 * for the age-check context. The members are read from the class, so a member added
 * without its documentation fails here.
 *
 * The class is looked up on the entry point's namespace, so that this file compiles
 * before the export exists. The page also documents `Committed` and `Blinded` (#48), and
 * its example of them runs here as written.
 */
import { describe, expect, test } from "vitest";
import { BoundedInt as GenericBoundedInt } from "../../src/core/bounded-int.js";
import * as entryPoint from "../../src/core/index.js";
import { RistrettoElement } from "../../src/core/index.js";
import vectors from "../vectors/blinding-context.json" with { type: "json" };
import { read } from "./markdown.js";

/** A commitment and its opening, as the page documents them. */
interface Blinded {
  readonly commitment: RistrettoElement;
  readonly value: GenericBoundedInt;
  readonly blinding: GenericBoundedInt;
}

interface Context {
  serialize(): Promise<Uint8Array>;
  boundedInt?: () => typeof GenericBoundedInt;
  blind(x: GenericBoundedInt): Promise<Blinded>;
  isOpeningOf(opening: Blinded): Promise<boolean>;
}

interface ContextClass {
  readonly prototype: unknown;
  fromEncoded(h: Uint8Array, message: Uint8Array, group: typeof RistrettoElement): Context;
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
  test("the class has the public members of the plan, and no message", () => {
    expect(members(BlindingContext).sort()).toEqual(
      [
        "blind",
        "boundedInt",
        "group",
        "h",
        "isOpeningOf",
        "serialize",
        "static fromEncoded",
      ].sort(),
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
    RistrettoElement,
  );
  const serialized = hex((await context?.serialize()) ?? new Uint8Array());
  expect(serialized).toBe(vectors.context.serialized);
  expect(page).toContain(serialized);
  expect(page).toContain(vectors.suiteNameHex);
});

describe("docs/core/blinding-context.md, section Committed and Blinded", () => {
  test("it documents Committed and Blinded as plain structures: { commitment, type } and { commitment, value, blinding }", () => {
    const text = section("Committed and Blinded");
    expect(text).toMatch(/\*\*`Committed<E>`\*\*, `\{ commitment, type \}`/);
    expect(text).toMatch(/\*\*`Blinded<E>`\*\*, `\{ commitment, value, blinding \}`/);
    expect(text).toMatch(/two plain structures that anyone may build/);
    expect(text).toMatch(/exports them as types/);
    expect(text).toMatch(/so a `Blinded` does not repeat it/);
  });

  test("its example runs as written: blind, isOpeningOf, and an opening rebuilt from bytes", async () => {
    const text = section("Committed and Blinded");
    expect(text).toContain("const Scalar = context.boundedInt();");
    expect(text).toContain("opening.value.constructor === Days; // true");
    expect(text).toContain("await context.isOpeningOf(opening); // true");
    if (BlindingContext === undefined) throw new Error("no BlindingContext");
    const context = BlindingContext.fromEncoded(
      fromHex(vectors.context.h),
      fromHex(vectors.context.messageHex),
      RistrettoElement,
    );
    expect(typeof context.boundedInt).toBe("function");
    const Scalar = context.boundedInt?.();
    if (Scalar === undefined) return;
    const Days = Scalar.define({ name: "Days", min: -0.5, max: 65535.5 });
    const opening = await context.blind(Days.from(20000n));
    expect(opening.value.constructor).toBe(Days);
    expect(await context.isOpeningOf(opening)).toBe(true);
    const received: Blinded = {
      commitment: RistrettoElement.decode(opening.commitment.encode()),
      value: Days.fromValue(20000n),
      blinding: Scalar.fromValue(
        RistrettoElement.decodeScalar(RistrettoElement.encodeScalar(opening.blinding.value)),
      ),
    };
    expect(await context.isOpeningOf(received)).toBe(true);
  });
});

test("docs/core/blinding-context.md requires the group of fromEncoded: no group? in the table, no default group, and the examples name RistrettoElement", () => {
  const table = section("BlindingContext");
  expect(table).toContain("`static fromEncoded(h, message, group)`");
  expect(page).not.toContain("group?");
  expect(page).not.toMatch(/by default/);
  expect(table).toMatch(/The group is required: there is no default group/);
  for (const call of page.match(/BlindingContext\.fromEncoded\([^)]*\)/g) ?? []) {
    expect(call).toMatch(/, RistrettoElement\)$/);
  }
  expect(page).not.toContain("BlindingContext.boundedInt");
});

test("docs/core/blinding-context.md quotes the RangeError of blind, which prints no number, as the code gives it", async () => {
  const quoted =
    /`(BlindingContext\.blind: Wide holds more values than the group Ristretto255 has\s+scalars)`/.exec(
      section("BlindingContext"),
    )?.[1];
  expect(quoted).toBeDefined();
  const context = BlindingContext?.fromEncoded(
    fromHex(vectors.context.h),
    fromHex(vectors.context.messageHex),
    RistrettoElement,
  );
  const L = RistrettoElement.ORDER;
  const Wide = GenericBoundedInt.define({ name: "Wide", min: -0.5, max: [10n * L + 5n, -1] });
  const error: unknown = await context?.blind(Wide.fromValue(5n)).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(RangeError);
  expect((error as Error).message).toBe(quoted?.replace(/\s+/g, " "));
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #40    | new: the page names every public member, and the serialization (#39) |
