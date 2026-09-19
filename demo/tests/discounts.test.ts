import { expect, test } from "vitest";
import { applyDiscount } from "../src/billing/discounts";
import { order } from "./factories";

test("no discount for small orders", () => {
  expect(applyDiscount(order({ totalCents: 2000 })).totalCents).toBe(2000);
});
