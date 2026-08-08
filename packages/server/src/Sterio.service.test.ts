import { expect, test } from "vitest";
import { SterioKeyGenerator } from "./Sterio.service";

test("KeyGenerator", () => {
  type T = {
    id: string;
    name: string;
    index: number;
  };

  const items: T[] = [
    {
      id: "1",
      name: "First item",
      index: 0,
    },
    {
      id: "2",
      name: "Second item",
      index: 1,
    },
  ];

  const keyGenerator = new SterioKeyGenerator(
    {
      url: "",
      items,
    },
    {
      uid: "${$.id}",
      name: "${$.name}",
    },
  );

  expect(keyGenerator.keys("name")).toEqual(["First item", "Second item"]);
  expect(keyGenerator.keys("uid")).toEqual(["1", "2"]);
  expect(keyGenerator.keys()).toEqual(["1", "2"]);
});
