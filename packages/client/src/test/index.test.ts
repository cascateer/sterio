import { evaluate } from "@cascateer/core/test";
import { expect, test } from "vitest";

test("sample1", async () => {
  expect(
    await evaluate("sample1", (root) =>
      root.evaluate((root) => root.textContent),
    ),
  ).toEqual("sample1");
});

test("sample2", async () => {
  expect(
    await evaluate("sample2", (root) =>
      root.evaluate((root) => root.innerHTML),
    ),
  ).toEqual('<input type="text"><!--anchor-->');
});

test("sample3", async () => {
  expect(
    await evaluate("sample3", (root) =>
      root
        .$("button")
        .then((button) => button?.click())
        .then(() => root.$("input[type=checkbox]"))
        .then((checkbox) => checkbox?.evaluate((checkbox) => checkbox.checked)),
    ),
  ).toBeTruthy();
});
