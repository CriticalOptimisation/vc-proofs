/**
 * `BlindingContext` (#39, #48; docs/core/blinding-context.md): the validation in the
 * constructor, the members that await it, the serialization, the class of a group
 * (`boundedInt`), the commitments to bounded integers and their openings (`Blinded`), the
 * queue of blindings, and a context over a group other than the default. The expected
 * values come from test/vectors/generator-h.json and test/vectors/blinding-context.json,
 * which tools/generator-h/reference.py and tools/blinding-context/reference.py compute
 * apart from the TypeScript code, with libsodium. The same file runs in Node.js and in
 * every headless browser.
 *
 * The class is looked up on the entry point's namespace, and the seams of
 * src/core/blinding-context.ts are imported dynamically, so that this file compiles and
 * runs before they exist, and fails on the behaviour. Until `BlindingContext.boundedInt`
 * exists, the classes of the values are made from a stand-in with the same constants, so
 * that the tests of `blind` and `isOpeningOf` reach the behaviour they check.
 */
import { describe, expect, test, vi } from "vitest";
import { BoundedInt as GenericBoundedInt } from "../src/core/bounded-int.js";
import * as entryPoint from "../src/core/index.js";
import { RistrettoElement } from "../src/core/index.js";
import contextVectors from "./vectors/blinding-context.json" with { type: "json" };
import generatorVectors from "./vectors/generator-h.json" with { type: "json" };

/** A class of bounded integers. */
type BoundedIntClass = typeof GenericBoundedInt;

/** A commitment and its opening (docs/core/blinding-context.md, Committed and Blinded). */
interface Blinded {
  readonly commitment: RistrettoElement;
  readonly value: GenericBoundedInt;
  readonly blinding: GenericBoundedInt;
}

/** What the seam blindWith resolves to: the commitment, and r as a bigint. */
interface BlindedWith {
  readonly commitment: RistrettoElement;
  readonly blinding: bigint;
}

interface Context {
  readonly group: unknown;
  h(): Promise<RistrettoElement>;
  serialize(): Promise<Uint8Array>;
  boundedInt(): BoundedIntClass;
  blind(x: GenericBoundedInt): Promise<Blinded>;
  isOpeningOf(opening: Blinded): Promise<boolean>;
}

/** What a context needs of its group (docs/core/blinding-context.md, The group). */
interface TestGroup {
  readonly SUITE_NAME: string;
  readonly GENERATOR_DST: string;
  readonly ORDER: bigint;
  decode(bytes: Uint8Array): RistrettoElement;
  hashToGroup(message: Uint8Array, dst: Uint8Array): Promise<RistrettoElement>;
  canonicalGenerator(): RistrettoElement;
  randomScalar(): bigint;
}

interface ContextClass {
  fromEncoded(h: Uint8Array, message: Uint8Array, group?: TestGroup): Context;
  boundedInt?: () => BoundedIntClass;
}

interface Seams {
  BlindingContext?: ContextClass;
  blindWith?: (context: Context, scalar: bigint, draw: () => bigint) => Promise<BlindedWith>;
  blindValueWith?: (context: Context, x: GenericBoundedInt, draw: () => bigint) => Promise<Blinded>;
  queuedBlindings?: (context: Context) => number;
}

const BlindingContext = (entryPoint as Record<string, unknown>).BlindingContext as ContextClass;
/**
 * The seams of src/core/blinding-context.ts, which the entry point does not export. The
 * specifier is not a literal, so that neither TypeScript nor Vite resolves it before the
 * file exists; it names the `.ts` file, which Vite serves to the browsers as it is.
 * A browser may load that file as a second instance of the module, whose seams reach
 * only its own contexts: the tests of the seams build theirs with its `BlindingContext`.
 */
const seamsPath = ["..", "src", "core", "blinding-context.ts"].join("/");
const seams = (await import(/* @vite-ignore */ seamsPath).catch(() => ({}))) as Seams;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** The vector `name` of test/vectors/generator-h.json: its message and its h. */
function generator(name: string): { message: Uint8Array; h: Uint8Array } {
  const vector = generatorVectors.vectors.find((v) => v.name === name);
  if (vector === undefined) throw new Error(`no generator vector ${name}`);
  return { message: fromHex(vector.messageHex), h: fromHex(vector.h) };
}

const ageCheck = () => generator("age-check");
const abc = () => generator("abc");
const g = () => RistrettoElement.canonicalGenerator();
/** ℓ, the order of ristretto255 (RFC 9496). */
const L = 2n ** 252n + 27742317777372353535851937790883648493n;

/** The class of ristretto255, `BlindingContext.boundedInt()`, or a stand-in until it exists. */
const Scalar: BoundedIntClass =
  typeof BlindingContext.boundedInt === "function"
    ? BlindingContext.boundedInt()
    : GenericBoundedInt.define({ name: "Ristretto255Scalar", min: -0.5, max: [10n * L - 5n, -1] });
/** A class of values, made from the class of the group. */
const Days = Scalar.define({ name: "Days", min: -0.5, max: 65535.5 });
/** A class of values with negative integers: −799 … 1599, in steps of 0.01. */
const Reading = Scalar.define({ name: "Reading", min: -7.99, max: 15.995, step: 0.01 });

/** An opening built by hand, with the integers of its value and of its blinding factor. */
function opening(commitment: RistrettoElement, m: bigint, r: bigint): Blinded {
  return { commitment, value: Days.fromValue(m), blinding: Scalar.fromValue(r) };
}

/** The integer of a little-endian encoding, such as the scalars of the vectors. */
function littleEndian(bytes: Uint8Array): bigint {
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i] ?? 0);
  return n;
}

/** m·g + r·h, by the group class of #35. */
function pedersen(m: bigint, r: bigint, h: RistrettoElement): RistrettoElement {
  return g().multiplyScalar(m).add(h.multiplyScalar(r));
}

/** The age-check context, built from fresh arrays. */
function ageCheckContext(): Context {
  const { h, message } = ageCheck();
  return BlindingContext.fromEncoded(h, message);
}

/** The age-check context, from the module instance of the seams. */
function seamContext(): Context {
  const { h, message } = ageCheck();
  return (seams.BlindingContext ?? BlindingContext).fromEncoded(h, message);
}

/** The contexts whose h is not derived from their message. */
const invalid: [string, () => Context][] = [
  ["the h of another message", () => BlindingContext.fromEncoded(abc().h, ageCheck().message)],
  ["another message", () => BlindingContext.fromEncoded(ageCheck().h, abc().message)],
  ["the identity as h", () => BlindingContext.fromEncoded(new Uint8Array(32), ageCheck().message)],
];

/** The rejections that reach no handler while `run` and a few macrotasks run. */
async function unhandledRejections(run: () => void): Promise<unknown[]> {
  const seen: unknown[] = [];
  const browser = "onunhandledrejection" in globalThis;
  const onBrowser = (event: PromiseRejectionEvent) => {
    seen.push(event.reason);
  };
  const onNode = (reason: unknown) => {
    seen.push(reason);
  };
  if (browser) globalThis.addEventListener("unhandledrejection", onBrowser);
  else process.on("unhandledRejection", onNode);
  try {
    run();
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    if (browser) globalThis.removeEventListener("unhandledrejection", onBrowser);
    else process.off("unhandledRejection", onNode);
  }
  return seen;
}

describe("BlindingContext: construction and validation", () => {
  test("is a class exported by the low-level entry point", () => {
    expect(typeof BlindingContext).toBe("function");
    expect(typeof BlindingContext.fromEncoded).toBe("function");
  });

  test("fromEncoded builds the age-check context synchronously, and it validates, keeping no message", async () => {
    const { h, message } = ageCheck();
    const context = BlindingContext.fromEncoded(h, message);
    expect(context).not.toBeInstanceOf(Promise);
    expect("message" in context).toBe(false);
    expect(hex((await context.h()).encode())).toBe(contextVectors.context.h);
    expect(hex(await context.serialize())).toBe(contextVectors.context.serialized);
  });

  test("a context keeps no message: it has no member message", () => {
    const context = ageCheckContext();
    expect("message" in context).toBe(false);
    expect((context as unknown as Record<string, unknown>).message).toBeUndefined();
  });

  test("serialize() is the ASCII bytes of Ristretto255, then the 32 bytes of h", async () => {
    const serialized = await ageCheckContext().serialize();
    expect(serialized.length).toBe(44);
    expect(new TextDecoder().decode(serialized.subarray(0, 12))).toBe("Ristretto255");
    expect(hex(serialized.subarray(0, 12))).toBe(contextVectors.suiteNameHex);
    expect(hex(serialized.subarray(12))).toBe(contextVectors.context.h);
  });

  test.each(invalid)(
    "%s: fromEncoded returns, and h, serialize, blind and isOpeningOf reject with a RangeError",
    async (_name, build) => {
      const context = build();
      expect(context).toBeDefined();
      await expect(context.h()).rejects.toThrow(RangeError);
      await expect(context.serialize()).rejects.toThrow(RangeError);
      await expect(context.blind(Days.from(1n))).rejects.toThrow(RangeError);
      await expect(context.isOpeningOf(opening(g(), 1n, 1n))).rejects.toThrow(RangeError);
    },
  );

  test("a late change to the caller's arrays changes nothing in a valid context: it still validates", async () => {
    const { h, message } = ageCheck();
    const context = BlindingContext.fromEncoded(h, message);
    // Before anything is awaited: the validation has not ended yet. A changed message
    // would make the check fail, so a context that resolves validated its own copy.
    h.set(abc().h);
    message.fill(0x61);
    expect(hex((await context.h()).encode())).toBe(contextVectors.context.h);
    expect(hex(await context.serialize())).toBe(contextVectors.context.serialized);
  });

  test("a late change to the caller's arrays does not make an invalid context valid", async () => {
    const h = abc().h;
    const context = BlindingContext.fromEncoded(h, ageCheck().message);
    h.set(ageCheck().h);
    await expect(context.h()).rejects.toThrow(RangeError);
    await expect(context.serialize()).rejects.toThrow(RangeError);
  });

  test("an invalid context that is never used causes no unhandled rejection", async () => {
    const seen = await unhandledRejections(() => {
      const build = invalid[0]?.[1];
      if (build === undefined) throw new Error("no invalid context");
      build();
    });
    expect(seen).toEqual([]);
  });

  test("group is the class RistrettoElement", () => {
    expect(ageCheckContext().group).toBe(RistrettoElement);
  });

  test("RistrettoElement is a group: its SUITE_NAME is Ristretto255, its randomScalar() a bigint, and it has no Scalar", () => {
    const group = RistrettoElement as unknown as Record<string, unknown>;
    expect(group.SUITE_NAME).toBe("Ristretto255");
    expect(typeof group.randomScalar).toBe("function");
    const draw = (group.randomScalar as () => unknown)();
    expect(typeof draw).toBe("bigint");
    expect("Scalar" in RistrettoElement).toBe(false);
    expect((entryPoint as Record<string, unknown>).RistrettoScalar).toBeUndefined();
  });

  test("a group declares its ORDER: RistrettoElement.ORDER is ℓ, and fromEncoded refuses a group without a bigint ORDER above 1, with a TypeError at once", () => {
    const group = RistrettoElement as unknown as Record<string, unknown>;
    expect(group.ORDER).toBe(L);
    expect(ageCheckContext().group).toHaveProperty("ORDER", L);
    const { h, message } = ageCheck();
    const base = {
      SUITE_NAME: "No-order",
      GENERATOR_DST: RistrettoElement.GENERATOR_DST,
      decode: (bytes: Uint8Array) => RistrettoElement.decode(bytes),
      hashToGroup: (bytes: Uint8Array, dst: Uint8Array) => RistrettoElement.hashToGroup(bytes, dst),
      canonicalGenerator: () => g(),
      randomScalar: () => RistrettoElement.randomScalar(),
    };
    for (const order of [undefined, 7, 1n, 0n]) {
      const without = { ...base, ORDER: order } as unknown as TestGroup;
      expect(() => BlindingContext.fromEncoded(h, message, without), String(order)).toThrow(
        TypeError,
      );
    }
  });
});

describe("BlindingContext.boundedInt: the class of a group", () => {
  test("BlindingContext.boundedInt() is the integers 0 … ℓ − 1 of ristretto255: Ristretto255Scalar, scale 0, [−0.5, ℓ − 0.5), frozen, the same object on every call", () => {
    expect(typeof BlindingContext.boundedInt).toBe("function");
    const Z = BlindingContext.boundedInt?.();
    expect(Z?.name).toBe("Ristretto255Scalar");
    expect(Z?.scale).toBe(0);
    expect(Z?.min).toBe(-0.5);
    expect(Z?.max).toEqual([10n * L - 5n, -1]);
    expect([Z?.low, Z?.high]).toEqual([0n, L - 1n]);
    expect(Z !== undefined && Object.isFrozen(Z)).toBe(true);
    expect(Object.getPrototypeOf(Z)).toBe(GenericBoundedInt);
    expect(BlindingContext.boundedInt?.()).toBe(Z);
  });

  test("context.boundedInt() of a ristretto255 context is BlindingContext.boundedInt(); ./core exports no BoundedInt", () => {
    const context = ageCheckContext();
    expect(typeof context.boundedInt).toBe("function");
    expect(context.boundedInt()).toBe(BlindingContext.boundedInt?.());
    expect(BlindingContext.fromEncoded(abc().h, abc().message).boundedInt()).toBe(
      context.boundedInt(),
    );
    expect((entryPoint as Record<string, unknown>).BoundedInt).toBeUndefined();
  });
});

describe("BlindingContext: commitments", () => {
  // REVIEW PLACEHOLDER (#48: blind takes a bounded integer, and resolves to its opening)
  // blind gives C = m·g + r·h with the returned r, a bigint from 1 to ℓ − 1
  //   -> blind(x) resolves to a frozen { commitment, value, blinding }: C = m·g + r·h, value is x, r a value of the class of the group from 1 to ℓ − 1
  // test("blind gives C = m·g + r·h with the returned r, a bigint from 1 to ℓ − 1", async () => {
  //   const context = ageCheckContext();
  //   const m = 20000n;
  //   const { commitment, blinding } = await context.blind(m);
  //   expect(typeof blinding).toBe("bigint");
  //   expect(blinding > 0n && blinding < L).toBe(true);
  //   expect(commitment.equals(pedersen(m, blinding, await context.h()))).toBe(true);
  // });
  test("blind(x) resolves to a frozen { commitment, value, blinding }: C = m·g + r·h, value is x, r a value of the class of the group from 1 to ℓ − 1", async () => {
    const context = ageCheckContext();
    const x = Days.from(20000n);
    const blinded = await context.blind(x);
    expect(Object.keys(blinded).sort()).toEqual(["blinding", "commitment", "value"]);
    expect(Object.isFrozen(blinded)).toBe(true);
    expect(blinded.value).toBe(x);
    expect(blinded.value.constructor).toBe(Days);
    const { blinding } = blinded;
    expect(blinding).toBeInstanceOf(Scalar);
    expect(blinding.constructor).toBe(Scalar);
    expect(blinding.value > 0n && blinding.value < L).toBe(true);
    expect(blinded.commitment.equals(pedersen(20000n, blinding.value, await context.h()))).toBe(
      true,
    );
  });

  test("blind of a value of the class of the group itself commits to its integer", async () => {
    const context = ageCheckContext();
    const x = Scalar.from(L - 1n);
    const { commitment, blinding } = await context.blind(x);
    expect(commitment.equals(pedersen(L - 1n, blinding.value, await context.h()))).toBe(true);
  });

  test("two commitments to the same value have different r and C", async () => {
    const context = ageCheckContext();
    const first = await context.blind(Days.from(20000n));
    const second = await context.blind(Days.from(20000n));
    expect(first.blinding.value).not.toBe(second.blinding.value);
    expect(first.commitment.equals(second.commitment)).toBe(false);
  });

  // REVIEW PLACEHOLDER (#48: blind takes a bounded integer, and refuses a bigint)
  // a BoundedInt passes its value: blind(x.value) commits to x, and blind(x) and isOpeningOf(x, …) reject with a TypeError
  //   -> blind of a bigint, of a number and of an object with a value rejects with a TypeError
  //   -> blind(x) resolves to a frozen { commitment, value, blinding }: C = m·g + r·h, value is x, r a value of the class of the group from 1 to ℓ − 1
  // test("a BoundedInt passes its value: blind(x.value) commits to x, and blind(x) and isOpeningOf(x, …) reject with a TypeError", async () => {
  //   const context = ageCheckContext();
  //   const x = BoundedInt.from(20000n);
  //   const { commitment, blinding } = await context.blind(x.value);
  //   expect(commitment.equals(pedersen(20000n, blinding, await context.h()))).toBe(true);
  //   expect(await context.isOpeningOf(x.value, BoundedInt.from(blinding).value, commitment)).toBe(
  //     true,
  //   );
  //   await expect(context.blind(x as never)).rejects.toBeInstanceOf(TypeError);
  //   await expect(context.isOpeningOf(x as never, blinding, commitment)).rejects.toBeInstanceOf(
  //     TypeError,
  //   );
  //   await expect(
  //     context.isOpeningOf(20000n, BoundedInt.from(blinding) as never, commitment),
  //   ).rejects.toBeInstanceOf(TypeError);
  // });
  test.each<[string, unknown]>([
    ["a bigint", 20000n],
    ["a number", 20000],
    ["an object with a value", { value: 20000n }],
  ])("blind of %s rejects with a TypeError", async (_name, value) => {
    await expect(ageCheckContext().blind(value as GenericBoundedInt)).rejects.toThrow(TypeError);
  });

  test("blind of a value whose class holds ℓ + 1 integers rejects with a RangeError that names the class and the group, and prints no number", async () => {
    // Made on the generic class, which does not count the integers of its children.
    const Wide = GenericBoundedInt.define({ name: "Wide", min: -0.5, max: [10n * L + 5n, -1] });
    expect(Wide.high - Wide.low + 1n).toBe(L + 1n);
    const error: unknown = await ageCheckContext()
      .blind(Wide.fromValue(5n))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RangeError);
    const message = (error as Error).message;
    expect(message).toMatch(/Wide/);
    expect(message).toMatch(/Ristretto255/);
    expect(message).not.toMatch(/\d{6}/);
  });

  // REVIEW PLACEHOLDER (#48: isOpeningOf takes a Blinded; the class of a value bounds it)
  // blind and isOpeningOf take any integer: m, m + ℓ and m − ℓ commit to the same value
  //   -> blindWith takes any integer: m, m + ℓ and m − ℓ commit to the same value
  //   -> a negative value is committed as it is: −12 of Reading gives (ℓ − 12)·g + r·h, and isOpeningOf accepts its opening
  // test("blind and isOpeningOf take any integer: m, m + ℓ and m − ℓ commit to the same value", async () => {
  //   expect(typeof seams.blindWith).toBe("function");
  //   const vector = contextVectors.commitments[0];
  //   if (vector === undefined) throw new Error("no commitment vector");
  //   const m = littleEndian(fromHex(vector.mHex));
  //   const r = littleEndian(fromHex(vector.r));
  //   const context = seamContext();
  //   for (const shifted of [m + L, m - L, m + 3n * L]) {
  //     const blinded = await seams.blindWith?.(context, shifted, () => r);
  //     expect(hex(blinded?.commitment.encode() ?? new Uint8Array())).toBe(vector.commitment);
  //   }
  //   const commitment = RistrettoElement.decode(fromHex(vector.commitment));
  //   expect(await context.isOpeningOf(m - L, r + L, commitment)).toBe(true);
  //   expect(await context.isOpeningOf(m, r - 2n * L, commitment)).toBe(true);
  //   expect(await context.isOpeningOf(m + 1n, r, commitment)).toBe(false);
  // });
  test("blindWith takes any integer: m, m + ℓ and m − ℓ commit to the same value", async () => {
    expect(typeof seams.blindWith).toBe("function");
    const vector = contextVectors.commitments[0];
    if (vector === undefined) throw new Error("no commitment vector");
    const m = littleEndian(fromHex(vector.mHex));
    const r = littleEndian(fromHex(vector.r));
    const context = seamContext();
    for (const shifted of [m + L, m - L, m + 3n * L]) {
      const blinded = await seams.blindWith?.(context, shifted, () => r);
      expect(hex(blinded?.commitment.encode() ?? new Uint8Array())).toBe(vector.commitment);
    }
  });

  test("a negative value is committed as it is: −12 of Reading gives (ℓ − 12)·g + r·h, and isOpeningOf accepts its opening", async () => {
    const context = ageCheckContext();
    const x = Reading.from([-125n, -3]); // −0.125, a tie, goes to −0.12
    expect(x.value).toBe(-12n);
    const blinded = await context.blind(x);
    const h = await context.h();
    expect(blinded.commitment.equals(pedersen(L - 12n, blinded.blinding.value, h))).toBe(true);
    expect(await context.isOpeningOf(blinded)).toBe(true);
    const twelve = { ...blinded, value: Reading.fromValue(12n) };
    expect(await context.isOpeningOf(twelve)).toBe(false);
  });

  test.each(contextVectors.commitments)(
    "blindWith a fixed r gives the commitment of vector $name",
    async (vector) => {
      expect(typeof seams.blindWith).toBe("function");
      const r = littleEndian(fromHex(vector.r));
      const m = littleEndian(fromHex(vector.mHex));
      expect(m).toBe(BigInt(vector.m));
      const blinded = await seams.blindWith?.(seamContext(), m, () => r);
      expect(hex(blinded?.commitment.encode() ?? new Uint8Array())).toBe(vector.commitment);
      expect(blinded?.blinding).toBe(r);
    },
  );

  test.each(contextVectors.commitments)(
    "blindValueWith a fixed r gives the commitment of vector $name, and its opening",
    async (vector) => {
      expect(typeof seams.blindValueWith).toBe("function");
      const r = littleEndian(fromHex(vector.r));
      const x = Days.from(BigInt(vector.m));
      const blinded = await seams.blindValueWith?.(seamContext(), x, () => r);
      expect(hex(blinded?.commitment.encode() ?? new Uint8Array())).toBe(vector.commitment);
      expect(blinded?.value).toBe(x);
      expect(blinded?.blinding.value).toBe(r);
      expect(blinded?.blinding.constructor).toBe(Scalar);
    },
  );

  test("blindWith draws again when the draw is 0n", async () => {
    expect(typeof seams.blindWith).toBe("function");
    const vector = contextVectors.commitments[0];
    if (vector === undefined) throw new Error("no commitment vector");
    const r = littleEndian(fromHex(vector.r));
    const draws = [0n, r];
    const draw = vi.fn(() => draws.shift() ?? 0n);
    const blinded = await seams.blindWith?.(
      seamContext(),
      littleEndian(fromHex(vector.mHex)),
      draw,
    );
    expect(draw).toHaveBeenCalledTimes(2);
    expect(hex(blinded?.commitment.encode() ?? new Uint8Array())).toBe(vector.commitment);
  });
});

describe("BlindingContext: openings", () => {
  test("isOpeningOf accepts the opening that blind returned", async () => {
    const context = ageCheckContext();
    const blinded = await context.blind(Days.from(20000n));
    expect(await context.isOpeningOf(blinded)).toBe(true);
  });

  test("isOpeningOf refuses a wrong value, a wrong blinding factor and a wrong commitment", async () => {
    const context = ageCheckContext();
    const blinded = await context.blind(Days.from(20000n));
    const other = await context.blind(Days.from(20000n));
    expect(await context.isOpeningOf({ ...blinded, value: Days.from(20001n) })).toBe(false);
    expect(await context.isOpeningOf({ ...blinded, blinding: other.blinding })).toBe(false);
    expect(await context.isOpeningOf({ ...blinded, commitment: other.commitment })).toBe(false);
  });

  test("isOpeningOf of an object literal built from the parts of an opening: a Blinded is a plain structure", async () => {
    const context = ageCheckContext();
    const blinded = await context.blind(Days.from(20000n));
    const rebuilt = opening(
      RistrettoElement.decode(blinded.commitment.encode()),
      20000n,
      RistrettoElement.decodeScalar(RistrettoElement.encodeScalar(blinded.blinding.value)),
    );
    expect(Object.isFrozen(rebuilt)).toBe(false);
    expect(await context.isOpeningOf(rebuilt)).toBe(true);
  });

  test("isOpeningOf refuses a blinding factor that is a bigint, or of another class of the same integers, with a TypeError", async () => {
    const context = ageCheckContext();
    const blinded = await context.blind(Days.from(20000n));
    const r = blinded.blinding.value;
    const asBigint = { ...blinded, blinding: r as unknown as GenericBoundedInt };
    await expect(context.isOpeningOf(asBigint)).rejects.toThrow(TypeError);
    const Copy = Scalar.define({ name: "Copy", min: -0.5, max: [10n * L - 5n, -1] });
    await expect(context.isOpeningOf({ ...blinded, blinding: Copy.fromValue(r) })).rejects.toThrow(
      TypeError,
    );
  });

  test("isOpeningOf refuses a commitment of another context: contexts are independent", async () => {
    const ours = ageCheckContext();
    const theirs = BlindingContext.fromEncoded(abc().h, abc().message);
    const blinded = await theirs.blind(Days.from(20000n));
    expect(await theirs.isOpeningOf(blinded)).toBe(true);
    expect(await ours.isOpeningOf(blinded)).toBe(false);
  });
});

describe("BlindingContext: the queue of blindings", () => {
  test("after a first blind, the queue fills up to 10 pairs, and no more", async () => {
    expect(typeof seams.queuedBlindings).toBe("function");
    const context = seamContext();
    const queued = () => seams.queuedBlindings?.(context);
    await context.blind(Days.from(1n));
    await vi.waitFor(() => {
      expect(queued()).toBe(10);
    }, 5000);
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(queued()).toBe(10);
  });

  test("20 concurrent commitments are correct and distinct", async () => {
    const context = ageCheckContext();
    const h = await context.h();
    const values = Array.from({ length: 20 }, (_, i) => BigInt(i));
    const blinded = await Promise.all(values.map((m) => context.blind(Days.from(m))));
    blinded.forEach(({ commitment, blinding }, i) => {
      const m = values[i] ?? 0n;
      expect(commitment.equals(pedersen(m, blinding.value, h))).toBe(true);
    });
    const commitments = new Set(blinded.map(({ commitment }) => hex(commitment.encode())));
    expect(commitments.size).toBe(20);
  });
});

describe("BlindingContext over another group", () => {
  /**
   * A group of its own: the elements of ristretto255, under another suite name and
   * another tag, with 2·g as its canonical generator, and a count of the scalars it
   * draws. A context that names RistrettoElement anywhere fails here.
   */
  function otherGroup(): TestGroup & { readonly drawn: () => number } {
    let drawn = 0;
    const g2 = g().add(g());
    return {
      SUITE_NAME: "Test-group",
      GENERATOR_DST: "vc-proofs-test-other-group",
      ORDER: L,
      decode: (bytes) => RistrettoElement.decode(bytes),
      hashToGroup: (message, dst) => RistrettoElement.hashToGroup(message, dst),
      canonicalGenerator: () => g2,
      randomScalar: () => {
        drawn++;
        // The draws of RistrettoElement, reduced mod ℓ as randomScalar() documents.
        const bytes = crypto.getRandomValues(new Uint8Array(64));
        return littleEndian(bytes) % L;
      },
      drawn: () => drawn,
    };
  }

  const message = () => new TextEncoder().encode("vc-proofs/test/other-group");
  /** The h of `message()` under the tag of `group`. */
  async function hOf(group: TestGroup): Promise<RistrettoElement> {
    return RistrettoElement.hashToGroup(message(), new TextEncoder().encode(group.GENERATOR_DST));
  }

  test("fromEncoded with a group checks h under the GENERATOR_DST of that group", async () => {
    const group = otherGroup();
    const h = await hOf(group);
    const context = BlindingContext.fromEncoded(h.encode(), message(), group);
    expect((await context.h()).equals(h)).toBe(true);
    // The same h is not the generator of ristretto255 for that message.
    await expect(BlindingContext.fromEncoded(h.encode(), message()).h()).rejects.toThrow(
      RangeError,
    );
  });

  test("group is the group given to fromEncoded", async () => {
    const group = otherGroup();
    const context = BlindingContext.fromEncoded((await hOf(group)).encode(), message(), group);
    expect(context.group).toBe(group);
  });

  test("serialize() is the SUITE_NAME of the group, then the encoding of h", async () => {
    const group = otherGroup();
    const h = await hOf(group);
    const serialized = await BlindingContext.fromEncoded(h.encode(), message(), group).serialize();
    expect(new TextDecoder().decode(serialized.subarray(0, 10))).toBe("Test-group");
    expect(serialized.length).toBe(10 + 32);
    expect(hex(serialized.subarray(10))).toBe(hex(h.encode()));
  });

  test("blind commits with the generator of the group, and draws r from its randomScalar", async () => {
    const group = otherGroup();
    const h = await hOf(group);
    const context = BlindingContext.fromEncoded(h.encode(), message(), group);
    const m = 20000n;
    const blinded = await context.blind(Days.from(m));
    const r = blinded.blinding.value;
    const expected = group.canonicalGenerator().multiplyScalar(m).add(h.multiplyScalar(r));
    expect(blinded.commitment.equals(expected)).toBe(true);
    expect(blinded.commitment.equals(pedersen(m, r, h))).toBe(false);
    expect(group.drawn()).toBeGreaterThan(0);
    expect(await context.isOpeningOf(blinded)).toBe(true);
  });

  test("the class of another group is its own: Test-groupScalar, the integers 0 … ORDER − 1, shared by its contexts, and its blinding factors", async () => {
    const group = otherGroup();
    const h = (await hOf(group)).encode();
    const context = BlindingContext.fromEncoded(h, message(), group);
    expect(typeof context.boundedInt).toBe("function");
    const Z = context.boundedInt();
    expect(Z).not.toBe(BlindingContext.boundedInt?.());
    expect(Z.name).toBe("Test-groupScalar");
    expect([Z.scale, Z.low, Z.high]).toEqual([0, 0n, L - 1n]);
    expect(Object.isFrozen(Z)).toBe(true);
    expect(BlindingContext.fromEncoded(h, message(), group).boundedInt()).toBe(Z);
    const { blinding } = await context.blind(Days.from(5n));
    expect(blinding.constructor).toBe(Z);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #40    | new: the preliminary tests of BlindingContext, its group, bigint scalars, a BoundedInt's value (#39) |
// | #51    | the blinding factor through BoundedInt itself, the integer of Z_ℓ (#49) |
