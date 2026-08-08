import { createStandaloneComponent } from "@cascateer/core";
import { noop, over } from "lodash";
import { BehaviorSubject, switchMap } from "rxjs";
import { Input } from "../Input/component";
import { Select } from "../Select/component";
import { QuerySelectProps } from "./types";

export function QuerySelect<T>(props: QuerySelectProps<T>) {
  return createStandaloneComponent("query-select")
    .withStyles(import("./styles.module.scss"), import("../styles.module.scss"))
    .withTemplate<QuerySelectProps<T>>(
      (classNames) =>
        ({ options, ...props }) => {
          const query = new BehaviorSubject<string | undefined>(void 0);
          const { onQueryChange = noop, onQueryInput = noop } = props;

          return (
            <div className={classNames.querySelect}>
              <Input
                name={props.name}
                placeholder={props.placeholder}
                value={query}
                onChange={over(onQueryChange, (value) => query.next(value))}
                onInput={onQueryInput}
              />
              <Select
                options={query.pipe(switchMap((query) => options(query)))}
                {...props}
              />
            </div>
          );
        },
    )(props);
}
