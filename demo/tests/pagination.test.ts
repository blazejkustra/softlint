import { expect, test } from "vitest";
import { readPage } from "../src/lib/pagination";

test("defaults to 20 and clamps the limit to 1–100", () => {
  expect(readPage({})).toEqual({ limit: 20, cursor: undefined });
  expect(readPage({ limit: "500" }).limit).toBe(100);
  expect(readPage({ limit: "0" }).limit).toBe(20);
});

test("passes a non-empty cursor through", () => {
  expect(readPage({ cursor: "ord_123" }).cursor).toBe("ord_123");
  expect(readPage({ cursor: "" }).cursor).toBeUndefined();
});
