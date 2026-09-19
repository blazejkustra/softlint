import { db, type Order } from "../db";
import { stripe } from "./stripe";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function refundOrder(order: Order) {
  const payment = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
  // Stripe times out under load; try a few times before giving up.
  for (let attempt = 1; ; attempt++) {
    try {
      return await stripe.refunds.create({ payment_intent: payment.intentId, amount: order.totalCents });
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(500 * attempt);
    }
  }
}

/** Refunds part of an order. Safe to call again: Stripe treats repeats with the same key as one refund. */
export async function partialRefund(order: Order, amountCents: number, reason: string) {
  const payment = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
  return stripe.refunds.create(
    { payment_intent: payment.intentId, amount: amountCents, metadata: { reason } },
    { idempotencyKey: `partial-refund-${order.id}-${amountCents}-${reason}` },
  );
}
