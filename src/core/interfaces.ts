/**
 * The interfaces of the core: the types that several modules of `src/core/` share, with no
 * code at run time. `./core` does not export them.
 */

/**
 * What a context needs of the elements of its group. Written with `this`, so that a class
 * whose methods take and return its own instances, such as `RistrettoElement`, satisfies
 * it. The scalars of every group are `bigint`s (docs/core/ristretto255.md, *Scalars*).
 */
export interface GroupElement {
  encode(): Uint8Array;
  equals(other: this): boolean;
  add(other: this): this;
  subtract(other: this): this;
  multiplyScalar(n: bigint): this;
}

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
