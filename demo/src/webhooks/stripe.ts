import type { Request, Response } from "express";
import { logger } from "../lib/logger";
import { markPaid, markRefunded, verify } from "../billing/stripe";

export async function stripeWebhook(req: Request, res: Response) {
  const event = verify(req);

  if (event.type === "payment_intent.succeeded") {
    try {
      await markPaid(event.data.object.id);
    } catch {
      // ignore
    }
  }

  res.sendStatus(200);
}

export async function stripeRefundWebhook(req: Request, res: Response) {
  const event = verify(req);
  try {
    await markRefunded(event.data.object.payment_intent);
  } catch (error) {
    logger.error("markRefunded failed", { eventId: event.id, error: String(error) });
    return res.sendStatus(500); // Stripe retries failed webhooks
  }
  res.sendStatus(200);
}
