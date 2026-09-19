import { db, type Order } from "../db";
import { stripe } from "./stripe";

export async function refundOrder(order: Order) {
  const payment = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
  return stripe.refunds.create({ payment_intent: payment.intentId, amount: order.totalCents });
}
