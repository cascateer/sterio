import { thru } from "lodash";
import { map, OperatorFunction, scan } from "rxjs";
import { Quaternion, Vector3 } from "three";
import { Cube } from "./types";

export const toCubieFaceletColor =
  (
    { faces, index }: Cube.Cubie,
    face: Cube.Face,
  ): OperatorFunction<Cube.Layout, Cube.Face | undefined> =>
  (source) =>
    source.pipe(
      map(({ permutation, twist }) =>
        faces.includes(face)
          ? Cube.CUBIES[permutation.inverseOf(index)]?.faces[
              (faces.indexOf(face) + twist.at(index)) % faces.length
            ]
          : void 0,
      ),
    );

export const intersectWith =
  (
    cubie: Cube.Cubie,
  ): OperatorFunction<Cube.BaseAction | undefined, string | undefined> =>
  (source) =>
    source.pipe(
      map((baseAction) => {
        if (baseAction != null) {
          return (
            baseAction
              .find(({ slice }) => slice === cubie.slices[baseAction.axis])
              ?.toString() ?? ""
          );
        }
      }),
    );

export const rotate3d =
  (): OperatorFunction<(MouseEvent | TouchEvent)[], string> => (source) =>
    source.pipe(
      map((events) =>
        events.flatMap((event) =>
          "touches" in event ? (event.touches[0] ?? []) : event,
        ),
      ),
      map((v) =>
        0 in v && 1 in v
          ? new Vector3(
              v[0].clientY - v[1].clientY,
              v[1].clientX - v[0].clientX,
              0,
            )
          : new Vector3(),
      ),
      map((u) =>
        new Quaternion().setFromAxisAngle(u.normalize(), u.length() / 0.6e2),
      ),
      scan((q, r) => q.premultiply(r), new Quaternion(0, 0, 0, 1)),
      map(
        ({ w, x, y, z }) =>
          `rotate3d(${thru(
            new Vector3(x, y, z),
            (u, a = 2 * Math.atan2(u.length(), w)) => [
              u.divideScalar(Math.sin(a / 2)).toArray(),
              `${a}rad`,
            ],
          )})`,
      ),
    );
