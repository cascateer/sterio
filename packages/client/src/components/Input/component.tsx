import { createStandaloneComponent } from "@cascateer/core";
import { createElement, property } from "@cascateer/lib";
import { eventListener } from "@cascateer/lib/observable";
import cn from "classnames";
import { compact } from "lodash";
import { BehaviorSubject, map, merge, tap } from "rxjs";
import { InputProps } from "./types";

export function Input(props: InputProps) {
  // @ts-ignore
  return createStandaloneComponent("input")
    .withStyles(import("../styles.module.scss"), import("./styles.module.scss"))
    .withTemplate<InputProps>((globalClassNames) => ({ value, ...props }) => {
      const valueSubject = new BehaviorSubject<string | undefined>(void 0);

      const input = createElement("input", {
        className: cn(globalClassNames.input),
        name: props.name,
        placeholder: props.placeholder,
        type: "text",
      });

      eventListener(input, "input")
        .pipe(
          map(property("target")),
          map(property("value")),
          tap(props.onInput),
        )
        .subscribe(valueSubject);

      eventListener(input, "change")
        .pipe(
          map(property("target")),
          map(property("value")),
          tap(props.onChange),
        )
        .subscribe();

      merge(...compact([valueSubject, value])).subscribe({
        next: (value) => (input.value = value ?? ""),
      });

      return input;
    })(props);
}
