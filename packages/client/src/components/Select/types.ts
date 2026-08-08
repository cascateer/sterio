import { EnumerableItem, Enumerator } from "@cascateer/lib";
import { Observable, UnaryFunction } from "rxjs";

export type SelectProps<T> = {
  options: Observable<T>;
  selectedValue: Observable<string | undefined>;
  name: string;
  enumerator?: Enumerator<T>;
  text?: Enumerator<T>;
  onChange?: UnaryFunction<EnumerableItem<T>, void>;
};
