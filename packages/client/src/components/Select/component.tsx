import { createStandaloneComponent } from "@cascateer/core";
import {
  asEnumerable,
  createElement,
  EnumerableItem,
  Enumerator,
  nonNullable,
} from "@cascateer/lib";
import { eventListener } from "@cascateer/lib/observable";
import cn from "classnames";
import { noop } from "lodash";
import { combineLatest, map, startWith, withLatestFrom } from "rxjs";
import { SelectProps } from "./types";

export function Select<T>(props: SelectProps<T>) {
  // @ts-ignore
  return createStandaloneComponent("select")
    .withStyles(import("../styles.module.scss"), import("./styles.module.scss"))
    .withTemplate<SelectProps<T>>(
      (globalClassNames, classNames) =>
        ({
          enumerator = new Enumerator(),
          text = enumerator,
          onChange = noop,
          ...props
        }) => {
          const options = props.options.pipe(
            map(asEnumerable),
            startWith(new Array<EnumerableItem<T>>()),
          );

          const select = createElement("select", {
            className: cn(globalClassNames.input, classNames.select),
            name: props.name,
          });

          const selectedValue = eventListener(select, "change").pipe(
            map(({ target }) => target.value),
          );

          selectedValue
            .pipe(
              withLatestFrom(options),
              map(([selectedValue, options]) =>
                nonNullable(
                  options.find(
                    (option, index) =>
                      enumerator.predicate(option, index) === selectedValue,
                  ),
                ),
              ),
            )
            .subscribe(onChange);

          combineLatest([props.selectedValue, options]).subscribe({
            next: ([selectedValue, options]) => {
              select.replaceChildren(
                createElement("option", {
                  innerText: selectedValue?.toString() ?? "",
                  disabled: true,
                }),
                ...options.map((option, index) =>
                  createElement("option", {
                    value: enumerator.predicate(option, index).toString(),
                    innerText: text.predicate(option, index).toString(),
                    disabled:
                      enumerator.predicate(option, index) === selectedValue,
                  }),
                ),
              );

              select.selectedIndex =
                (selectedValue != null
                  ? options.map(enumerator.predicate).indexOf(selectedValue)
                  : -1) + 1;
            },
          });

          return select;
        },
    )(props);
}
