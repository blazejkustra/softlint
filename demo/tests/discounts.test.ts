import { expect, test } from "vitest";
import { applyDiscount } from "../src/billing/discounts";
import { order } from "./factories";

test("no discount for small orders", () => {
  expect(applyDiscount(order({ totalCents: 2000 })).totalCents).toBe(2000);
});

test("loyalty discount", async () => {
  const rules = vi.spyOn(discountRepo, "loadRules");
  applyDiscount(order({ totalCents: 20000, customer: loyalCustomer() }));
  expect(rules).toHaveBeenCalledOnce();
});
