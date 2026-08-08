import { map } from "rxjs";
import { rubiksSlice } from "../slice";
import { Cube } from "../types";

export const CubeControlsComponent = rubiksSlice
  .createComponent("cubeControls")
  .withStyles(import("./styles.module.scss"))
  .withTemplate((ctx, classNames) => () => {
    const CubeControl = ({ move: { key, action } }: { move: Cube.Move }) => (
      <button
        type="button"
        className={classNames.cubeControl}
        onClick={() => ctx.store.actions.queueAction(new Cube.Action(action))}
      >
        {key}
      </button>
    );

    return (
      <>
        <button
          className={classNames.cubeControl}
          type="button"
          onClick={() => ctx.api.actions.spotifyAuth()}
        >
          Spotify Auth
        </button>
        <button
          className={classNames.cubeControl}
          type="button"
          onClick={() => ctx.api.actions.youtubeAuth()}
        >
          YouTube Auth
        </button>
        <button
          className={classNames.cubeControl}
          type="button"
          onClick={() => ctx.api.actions.youtubeTest().then(console.log)}
        >
          YouTube Test
        </button>
        <div
          className={classNames.cubeControls}
          data-loading={ctx.terminal.effects.baseMoves().pending}
        >
          {ctx.terminal.effects.baseMoves().pipe(
            map((baseMoves) =>
              Object.values(baseMoves)
                .flat()
                .map((baseMove) => <CubeControl move={baseMove} />),
            ),
          )}
        </div>
        <div
          className={classNames.cubeControls}
          data-loading={ctx.terminal.effects.customMoves().pending}
        >
          {ctx.terminal.effects
            .customMoves()
            .pipe(
              map((customMoves) =>
                customMoves.map((customMove) => (
                  <CubeControl move={customMove} />
                )),
              ),
            )}
        </div>
      </>
    );
  });
