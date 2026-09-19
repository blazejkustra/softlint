import type { Request, Response } from "express";
import { markPaid, verify } from "../billing/stripe";

export async function stripeWebhook(req: Request, res: Response) {
  const event = verify(req);

  if (event.type === "payment_intent.succeeded") {
    await markPaid(event.data.object.id);
  }

  res.sendStatus(200);
}
