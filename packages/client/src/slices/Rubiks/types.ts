import { chunkWith, Serializable, Serializer } from "@cascateer/lib";
import { at, isNumber } from "lodash";
import { mod, Permutation, Twist } from "./math";

export namespace Cube {
  export type Axis = "X" | "Y" | "Z";

  export type Coord = -1 | 0 | 1;

  export type Coords = [Coord, Coord, Coord];

  export type Face = "L" | "R" | "U" | "D" | "B" | "F";

  export type Slice = Face | "M" | "E" | "S";

  export interface DisjointSlices extends Record<Axis, Slice> {
    X: "L" | "M" | "R";
    Y: "U" | "E" | "D";
    Z: "B" | "S" | "F";
  }

  export const AXES: Axis[] = ["X", "Y", "Z"];
  export const COORDS: Coord[] = [-1, 0, 1];
  export const FACES: Face[] = ["L", "R", "U", "D", "B", "F"];
  export const SLICES: Slice[] = [...FACES, "M", "E", "S"];
  export const DISJOINT_SLICES: { [A in Axis]: DisjointSlices[A][] } = {
    X: ["L", "M", "R"],
    Y: ["U", "E", "D"],
    Z: ["B", "S", "F"],
  };

  export class Cubie {
    constructor(public coords: Coords) {}

    get index() {
      const [x, y, z] = this.coords;

      return 3 * (3 * (x + 1) + (y + 1)) + (z + 1);
    }

    get slices(): DisjointSlices {
      return {
        X: { "-1": "L" as const, 0: "M" as const, "1": "R" as const }[
          this.coords[0]
        ],
        Y: { "-1": "U" as const, 0: "E" as const, "1": "D" as const }[
          this.coords[1]
        ],
        Z: { "-1": "B" as const, 0: "S" as const, "1": "F" as const }[
          this.coords[2]
        ],
      };
    }

    get faces(): Face[] {
      return Object.values(
        at(
          this.slices,
          this.coords[0] * this.coords[1] * this.coords[2] >= 0
            ? ["X", "Y", "Z"]
            : ["X", "Z", "Y"],
        ),
      ).flatMap((slice) => FACES.find((face) => face === slice) ?? []);
    }
  }

  export const CUBIES = [
    ...(function* (range: Coord[]) {
      for (const x of range) {
        for (const y of range) {
          for (const z of range) {
            yield new Cubie([x, y, z]);
          }
        }
      }
    })(COORDS),
  ];

  export interface SliceActionObject<S extends Slice> {
    slice: S;
    degree?: number;
  }

  export class SliceAction<S extends Slice = Slice> implements Serializable<
    SliceActionObject<Slice>
  > {
    slice: S;
    degree: number;

    constructor({ slice, degree = 1 }: SliceActionObject<S>) {
      this.slice = slice;
      this.degree = degree;
    }

    normalize(): SliceAction<S> {
      return SliceAction.fromObject({
        ...this,
        degree: mod(this.degree, 4),
      });
    }

    static fromObject<S extends Slice>(
      obj: SliceActionObject<S>,
    ): SliceAction<S> {
      return new SliceAction(obj);
    }

    toObject(): SliceActionObject<Slice> {
      return {
        slice: this.slice,
        degree: this.degree,
      };
    }

    toJSON: Serializer<SliceActionObject<Slice>> = Serializable.toJSON(
      SliceAction,
      this,
    );

    toString(): string {
      return [this.slice, this.degree].join("");
    }
  }

  export type BaseActionObject<A extends Axis> = SliceActionObject<
    DisjointSlices[A]
  >[];

  export class BaseAction<A extends Axis = Axis>
    extends Array<SliceAction<DisjointSlices[A]>>
    implements Serializable<BaseActionObject<Axis>>
  {
    constructor(obj: BaseActionObject<A>) {
      super(...Array.from(obj, SliceAction.fromObject));
    }

    get axis(): Axis {
      for (const axis of AXES) {
        if (
          this.every((sliceAction) =>
            DISJOINT_SLICES[axis].some((slice) => slice === sliceAction.slice),
          )
        ) {
          return axis;
        }
      }

      throw new Error();
    }

    static fromObject<A extends Axis>(obj: BaseActionObject<A>): BaseAction<A> {
      return new BaseAction(obj);
    }

    toObject(): BaseActionObject<Axis> {
      return Array.from(this, (sliceAction) => sliceAction.toObject());
    }

    toJSON: Serializer<BaseActionObject<Axis>> = Serializable.toJSON(
      BaseAction,
      this,
    );
  }

  export type ActionObject<S extends Slice> = SliceActionObject<S>[];

  export class Action<S extends Slice = Slice>
    extends Array<SliceAction<S>>
    implements Serializable<ActionObject<Slice>>
  {
    constructor(obj: ActionObject<S>) {
      super(...Array.from(obj, SliceAction.fromObject));
    }

    split(): BaseAction<Axis>[] {
      return chunkWith(this, (a, b) => {
        try {
          return Boolean(new BaseAction([a, b]).axis);
        } catch {
          return false;
        }
      }).map(BaseAction.fromObject);
    }

    static fromObject<S extends Slice>(obj: ActionObject<S>): Action<S> {
      return new Action(obj);
    }

    toObject(): ActionObject<Slice> {
      return Array.from(this, (sliceAction) => sliceAction.toObject());
    }

    toJSON: Serializer<ActionObject<Slice>> = Serializable.toJSON(Action, this);
  }

  export type BaseActionParity = "odd" | "even";

  export interface BaseMove<A extends Axis> {
    key: string;
    action: BaseActionObject<A>;
  }

  export type BaseMoves = { [A in Axis]: BaseMove<A>[] };

  export interface Move<S extends Slice = Slice> {
    key: string;
    action: ActionObject<S>;
  }

  export class Layout {
    permutation: Permutation;
    twist: Twist;

    constructor(
      layout: { permutation: Permutation; twist: Twist } | number = 27,
    ) {
      if (isNumber(layout)) {
        layout = {
          permutation: new Permutation(layout),
          twist: new Twist(layout),
        };
      }

      this.permutation = layout.permutation;
      this.twist = layout.twist;
    }

    multiply({ permutation, twist }: Layout): Layout {
      return new Layout({
        permutation: this.permutation.multiply(permutation),
        twist: new Twist(
          twist.map((y, x) => this.twist.at(permutation.inverseOf(x)) + y),
        ),
      });
    }

    apply(...[sliceAction, ...sliceActions]: SliceAction[]): Layout {
      if (sliceAction == null) {
        return this;
      }

      if (sliceActions.length > 0) {
        return this.apply(sliceAction).apply(...sliceActions);
      }

      const { slice, degree } = sliceAction.normalize();

      return degree > 0
        ? this.multiply(
            SLICE_LAYOUTS[slice].apply(
              SliceAction.fromObject({
                slice,
                degree: degree - 1,
              }),
            ),
          )
        : this;
    }
  }

  export const SLICE_LAYOUTS: Record<Slice, Layout> = {
    L: new Layout({
      permutation: Permutation.fromCyclesString(27, "(0 2 8 6)(1 5 7 3)"),
      twist: new Twist([
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0,
      ]),
    }),
    R: new Layout({
      permutation: Permutation.fromCyclesString(
        27,
        "(18 24 26 20)(19 21 25 23)",
      ),
      twist: new Twist([
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0,
      ]),
    }),
    U: new Layout({
      permutation: Permutation.fromCyclesString(27, "(0 18 20 2)(1 9 19 11)"),
      twist: new Twist([
        2, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 2, 0, 0, 0,
        0, 0, 0,
      ]),
    }),
    D: new Layout({
      permutation: Permutation.fromCyclesString(27, "(6 8 26 24)(7 17 25 15)"),
      twist: new Twist([
        0, 0, 0, 0, 0, 0, 1, 1, 2, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0,
        2, 1, 1,
      ]),
    }),
    B: new Layout({
      permutation: Permutation.fromCyclesString(27, "(0 6 24 18)(3 15 21 9)"),
      twist: new Twist([
        1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0,
        1, 0, 0,
      ]),
    }),
    F: new Layout({
      permutation: Permutation.fromCyclesString(27, "(2 20 26 8)(5 11 23 17)"),
      twist: new Twist([
        0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0,
        0, 0, 2,
      ]),
    }),
    M: new Layout({
      permutation: Permutation.fromCyclesString(
        27,
        "(11 17 15 9)(14 16 12 10)",
      ),
      twist: new Twist([
        0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0,
        0, 0, 0,
      ]),
    }),
    E: new Layout({
      permutation: Permutation.fromCyclesString(27, "(3 5 23 21)(4 14 22 12)"),
      twist: new Twist([
        0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1,
        0, 0, 0,
      ]),
    }),
    S: new Layout({
      permutation: Permutation.fromCyclesString(27, "(1 19 25 7)(4 10 22 16)"),
      twist: new Twist([
        0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0,
        0, 1, 0,
      ]),
    }),
  };
}
