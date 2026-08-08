import { nonNullable } from "@cascateer/lib";
import {
  at,
  constant,
  identity,
  isNumber,
  NumericDictionary,
  orderBy,
  range,
  times,
} from "lodash";
import { UnaryFunction } from "rxjs";

export const mod = (a: number, m: number) => ((a % m) + m) % m;

export class MapArray<T> extends Array<T> {
  constructor(arg: T[] | number, iteratee: UnaryFunction<number, T>) {
    if (isNumber(arg)) {
      arg = times(arg, iteratee);
    }

    super(...arg);
  }

  at(x: number): T {
    return nonNullable(super.at(x));
  }
}

export class Twist extends MapArray<number> {
  constructor(arg: number[] | number) {
    super(arg, constant(0));
  }
}

export class Permutation extends MapArray<number> {
  constructor(arg: number[] | number) {
    super(arg, identity);
  }

  multiply(permutation: Permutation): Permutation {
    return new Permutation(this.applyTo(permutation));
  }

  inverse(): Permutation {
    return new Permutation(this.map((_, x) => this.indexOf(x)));
  }

  inverseOf(x: number) {
    return this.inverse().at(x);
  }

  applyTo<U>(object: NumericDictionary<U>) {
    return at(object, this);
  }

  toCyclesString(): string {
    const cycles = new Array<number[]>(),
      domain = [...this];
    let x;

    while ((x = domain.shift()) != null) {
      const cycle = [x];

      while (domain.includes((x = this.at(x)))) {
        cycle.push(...domain.splice(domain.indexOf(x), 1));
      }

      if (cycle.length > 1) {
        cycles.push(cycle);
      }
    }

    return cycles.length > 0
      ? `(${cycles
          .map((cycle) => orderBy(cycle))
          .map((cycle) => cycle.join(" "))
          .join(")(")})`
      : "";
  }

  static fromCyclesString(n: number, cyclesString: string): Permutation {
    const map = range(n);
    const cycles = `)${cyclesString}(`
      .split(")(")
      .slice(1, -1)
      .map((cycle) => cycle.split(/\s+/).map(Number));

    for (const cycle of cycles) {
      for (let j = 0; j < cycle.length; j++) {
        map[nonNullable(cycle[j])] = nonNullable(cycle[(j + 1) % cycle.length]);
      }
    }

    return new Permutation(map);
  }
}
