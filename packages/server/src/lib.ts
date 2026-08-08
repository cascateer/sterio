import { AsyncEndoFunction, keys, property } from "@cascateer/lib";
import { reduce } from "@cascateer/lib/observable";
import { MaybePromise } from "@cascateer/lib/promise";
import {
  Dictionary,
  maxBy,
  pad,
  padEnd,
  padStart,
  truncate,
  TruncateOptions,
} from "lodash";
import {
  identity,
  mergeAll,
  OperatorFunction,
  startWith,
  UnaryFunction,
} from "rxjs";

interface TableColumnOptions<U> extends TruncateOptions {
  stringify?: UnaryFunction<U, string>;
  align?: "start" | "end" | "center";
  fill?: string;
}

type TableTemplate<T extends Dictionary<unknown>> = {
  [K in keyof T]: TableColumnOptions<T[K]>;
};

export class Table<T extends Dictionary<unknown>> {
  constructor(
    public rows: T[],
    public template: TableTemplate<T>,
  ) {}

  toString(): string {
    return this.rows
      .map((row) =>
        [
          "",
          ...keys(this.template).map((key) => {
            const {
              stringify = String,
              align = "start",
              fill,
              length = maxBy(
                this.rows.map(property(key)).map(stringify),
                property("length"),
              )?.length,
              omission,
              separator,
            } = this.template[key];

            return { start: padEnd, end: padStart, center: pad }[align](
              truncate(stringify(row[key]), { length, omission, separator }),
              length,
              fill,
            );
          }),
          "",
        ].join("│"),
      )
      .join("\n");
  }

  filter(predicate: (row: T, index: number) => boolean) {
    return new Table(this.rows.filter(predicate), this.template);
  }
}

export const pageIndex = (x: number, y: number) =>
  `${new Intl.NumberFormat("en-US", {
    minimumIntegerDigits: `${y}`.length,
  }).format(x)}/` + y;

export const secondsToHms = (seconds: number) =>
  new Date(seconds * 1e3).toISOString().slice(11, 19).replace(/^00:/, "");

export const tapPromise = <T>(
  input: Promise<T>,
  on?: Partial<{
    start: UnaryFunction<void, void>;
    finish: UnaryFunction<T, void>;
    error: UnaryFunction<any, void>;
  }>,
) =>
  Promise.resolve(on?.start?.call(null)).then(() =>
    input
      .catch((error) => {
        on?.error?.call(null, error);

        throw error;
      })
      .then((value) => (on?.finish?.call(null, value), value)),
  );

export const chainFunctions =
  <T>(seed: () => MaybePromise<T>): OperatorFunction<AsyncEndoFunction<T>, T> =>
  (source) =>
    source.pipe(
      startWith(identity),
      reduce<(() => MaybePromise<T>) | AsyncEndoFunction<T>, Promise<T>>(
        (state, predicate) => state.then(predicate),
        async () => seed(),
      ),
      mergeAll(),
    );
