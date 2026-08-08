import {
  ApiProvider,
  createSlice,
  registerCustomProperties,
} from "@cascateer/core";
import { property } from "@cascateer/lib";
import axios from "axios";
import { combineLatest, delay, from, map, tap } from "rxjs";
import { mod } from "./math";
import { Cube } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

registerCustomProperties({
  "--cubie-coord-0": {
    inherits: true,
    initialValue: "0",
    syntax: "<integer>",
  },
  "--cubie-coord-1": {
    inherits: true,
    initialValue: "0",
    syntax: "<integer>",
  },
  "--cubie-coord-2": {
    inherits: true,
    initialValue: "0",
    syntax: "<integer>",
  },
});

declare global {
  namespace JSX {
    interface CSSCustomPropertyDefinitions {
      "--cubie-coord-0": JSX.CSSCustomIntegerPropertyDefinition;
      "--cubie-coord-1": JSX.CSSCustomIntegerPropertyDefinition;
      "--cubie-coord-2": JSX.CSSCustomIntegerPropertyDefinition;
    }
  }
}

export const rubiksSlice = createSlice("rubiks")
  .withData({
    baseActionQueue: new Array<Cube.BaseAction>(),
    currentBaseActionIndex: 0,
  })
  .withStore(({ StoreProvider }) =>
    new StoreProvider()
      .provideEffects(({ effect }) => ({
        baseActionQueue: effect(({ data }) => data.property("baseActionQueue")),
        currentBaseActionIndex: effect(({ data }) =>
          data.property("currentBaseActionIndex"),
        ),
      }))
      .provideActions(({ action }) => ({
        queueAction: action<Cube.Action>(({ baseActionQueue }) =>
          baseActionQueue.update(
            (action) => (baseActionQueue) =>
              baseActionQueue.concat(action.split()),
          ),
        ),
        incrementCurrentBaseActionIndex: action<void>(
          ({ currentBaseActionIndex }) =>
            currentBaseActionIndex.update(
              () => (currentBaseActionIndex) => currentBaseActionIndex + 1,
              { sameOrigin: true },
            ),
        ),
      }))
      .complete(),
  )
  .withApi(
    new ApiProvider(axios)
      .provideEffects(({ effect }) => ({
        baseMoves: effect<void, Cube.BaseMoves>((axios) => ({
          predicate: () =>
            from(axios.get(`${API_BASE_URL}/rubiks/baseMoves`)).pipe(
              map(property("data")),
              delay(1e3),
            ),
          tags: "baseMoves",
        })),
        customMoves: effect<void, Cube.Move[]>((axios) => ({
          predicate: () =>
            from(axios.get(`${API_BASE_URL}/rubiks/customMoves`)).pipe(
              map(property("data")),
              delay(0e3),
            ),
          tags: "customMoves",
        })),
      }))
      .provideActions(({ action }) => ({
        spotifyAuth: action<void, string>((axios) => ({
          predicate: () =>
            from(
              axios
                .get(`${API_BASE_URL}/spotify/auth`, {
                  withCredentials: true,
                })
                .then(property("data")),
            ).pipe(tap((url) => window.open(url, "_blank")?.focus())),
        })),
        youtubeAuth: action<void, string>((axios) => ({
          predicate: () =>
            from(
              axios
                .get(`${API_BASE_URL}/youtube/auth`, {
                  withCredentials: true,
                })
                .then(property("data")),
            ).pipe(tap((url) => window.open(url, "_blank")?.focus())),
        })),
        youtubeTest: action<void, void>((axios) => ({
          predicate: () =>
            from(
              axios
                .get(
                  `${API_BASE_URL}/youtube/query?q=intro ${encodeURIComponent("Rey&Kjavik")}&playlistId=UCuGdq56L4viJ_U7UiNnhb2A`,
                )
                .then(property("data")),
            ),
        })),
      }))
      .complete(),
  )
  .withTerminal(({ TerminalProvider }) =>
    new TerminalProvider()
      .provideEffects(({ effect }) => ({
        baseMoves: effect<void, Cube.BaseMoves>(
          ({ api }) => api.effects.baseMoves,
        ),
        customMoves: effect<void, Cube.Move[]>(
          ({ api }) => api.effects.customMoves,
        ),
        currentBaseActionParity: effect<void, Cube.BaseActionParity>(
          ({ store }) =>
            () =>
              store.effects
                .currentBaseActionIndex()
                .pipe(map((index) => (mod(index, 2) === 1 ? "odd" : "even"))),
        ),
        currentBaseAction: effect<void, Cube.BaseAction | undefined>(
          ({ store }) =>
            () =>
              combineLatest([
                store.effects.baseActionQueue(),
                store.effects.currentBaseActionIndex(),
              ]).pipe(
                map(
                  ([baseActionQueue, currentBaseActionIndex]) =>
                    baseActionQueue[currentBaseActionIndex],
                ),
              ),
        ),
        currentSliceActions: effect<void, Cube.SliceAction[]>(
          ({ store }) =>
            () =>
              combineLatest([
                store.effects.baseActionQueue(),
                store.effects.currentBaseActionIndex(),
              ]).pipe(
                map(([baseActionQueue, currentBaseActionIndex]) =>
                  baseActionQueue.slice(0, currentBaseActionIndex).flat(),
                ),
              ),
        ),
      }))
      .provideEffects(({ effect }) => ({
        layout: effect<void, Cube.Layout>(
          ({ terminal }) =>
            () =>
              terminal.effects
                .currentSliceActions()
                .pipe(
                  map((currentSliceActions) =>
                    new Cube.Layout().apply(...currentSliceActions),
                  ),
                ),
        ),
      }))
      .complete(),
  );
