import { Router } from "express";
import { db } from "../db";
import { requireLogin } from "../auth";
import { readPage } from "../lib/pagination";
import { carrier } from "../shipping/carrier";
import { serializeOrder } from "./serializers";

export const orders = Router();

orders.use(requireLogin);

// The signed-in customer's orders, newest first, one page at a time.
orders.get("/api/orders", async (req, res) => {
  const { limit, cursor } = readPage(req.query);
  const rows = await db.order.findMany({
    where: { customerId: req.user.customerId },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });
  res.json({ orders: rows.map(serializeOrder), nextCursor: rows.at(-1)?.id ?? null });
});

// Order detail page.
orders.get("/api/orders/:id", async (req, res) => {
  const order = await db.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
  if (!order) return res.status(404).json({ error: "We couldn't find that order." });
  res.json(serializeOrder(order));
});

// Live tracking for one of the customer's orders.
orders.get("/api/orders/:id/tracking", async (req, res) => {
  const order = await db.order.findFirst({ where: { id: req.params.id, customerId: req.user.customerId } });
  if (!order?.trackingNumber) return res.status(404).json({ error: "No tracking yet. We'll email you when it ships." });
  res.json(await carrier.track(order.trackingNumber));
});

export default orders;
