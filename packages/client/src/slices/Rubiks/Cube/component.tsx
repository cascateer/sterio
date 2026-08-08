import {
  animationFrameScheduler,
  auditTime,
  bufferCount,
  combineLatest,
  map,
  merge,
  pairwise,
  Subject,
  switchAll,
  windowToggle,
} from "rxjs";
import { intersectWith, rotate3d, toCubieFaceletColor } from "../operators";
import { rubiksSlice } from "../slice";
import { Cube } from "../types";

export const CubeComponent = rubiksSlice
  .createComponent("cube")
  .withStyles(import("./styles.module.scss"), import("./styles.scss?inline"))
  .withTemplate((ctx, classNames) => () => {
    const mouseDownOrTouchStart = new Subject<MouseEvent | TouchEvent>();
    const mouseUpOrTouchEnd = new Subject<MouseEvent | TouchEvent>();
    const mouseMoveOrTouchMove = new Subject<MouseEvent | TouchEvent>();
    const mouseLeaveOrTouchCancel = new Subject<MouseEvent | TouchEvent>();
    const animationEnd = new Subject<void>();

    animationEnd.pipe(bufferCount(27)).subscribe({
      next: () => ctx.store.actions.incrementCurrentBaseActionIndex(),
    });

    return (
      <div
        className={classNames.cubeSpace}
        onMouseDown={mouseDownOrTouchStart}
        onTouchStart={mouseDownOrTouchStart}
        onMouseUp={mouseUpOrTouchEnd}
        onTouchEnd={mouseUpOrTouchEnd}
        onMouseMove={mouseMoveOrTouchMove}
        onTouchMove={mouseMoveOrTouchMove}
        onMouseLeave={mouseLeaveOrTouchCancel}
        onTouchCancel={mouseLeaveOrTouchCancel}
      >
        <div
          className={classNames.cube}
          style={{
            transform: mouseMoveOrTouchMove.pipe(
              windowToggle(mouseDownOrTouchStart, () =>
                merge(mouseUpOrTouchEnd, mouseLeaveOrTouchCancel),
              ),
              switchAll(),
              pairwise(),
              rotate3d(),
              auditTime(0, animationFrameScheduler),
            ),
          }}
        >
          {Cube.CUBIES.map((cubie) => (
            <div
              className={classNames.cubieSpace}
              data-cubie-slice-action={combineLatest([
                ctx.terminal.effects
                  .currentBaseAction()
                  .pipe(intersectWith(cubie)),
                ctx.terminal.effects.currentBaseActionParity(),
              ]).pipe(
                map(([action, parity]) => {
                  if (action != null) {
                    return [action || "empty", parity].join("_");
                  }
                }),
              )}
              onAnimationEnd={() => animationEnd.next()}
            >
              <div
                className={classNames.cubie}
                style={{
                  "--cubie-coord-0": cubie.coords[0].toString(),
                  "--cubie-coord-1": cubie.coords[1].toString(),
                  "--cubie-coord-2": cubie.coords[2].toString(),
                }}
              >
                {Cube.FACES.map((face) => (
                  <div
                    className={[
                      classNames.cubieFace,
                      classNames[`cubieFace${face}`],
                    ]}
                  >
                    <div
                      className={classNames.cubieFacelet}
                      data-color={ctx.terminal.effects
                        .layout()
                        .pipe(toCubieFaceletColor(cubie, face))}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  });
