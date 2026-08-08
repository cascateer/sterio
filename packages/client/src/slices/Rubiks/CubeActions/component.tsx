import { combineLatest, map } from "rxjs";
import { rubiksSlice } from "../slice";

export const CubeActionsComponent = rubiksSlice
  .createComponent("cubeActions")
  .withStyles(import("./styles.module.scss"))
  .withTemplate((ctx, { cubeBaseAction }) => () => (
    <>
      {ctx.store.effects.baseActionQueue().list((baseAction, index) => (
        <div>
          {combineLatest([
            baseAction,
            ctx.store.effects.currentBaseActionIndex(),
          ]).pipe(
            map(([baseAction, currentIndex]) => (
              <div
                className={cubeBaseAction}
                data-playing={index === currentIndex}
              >
                {baseAction.map(({ slice, degree }) => (
                  <>
                    <sub>{slice}</sub>
                    <sup data-value={degree === 1 ? void 0 : degree} />
                  </>
                ))}
              </div>
            )),
          )}
        </div>
      ))}
    </>
  ));
