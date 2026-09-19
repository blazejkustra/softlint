import { Router } from "express";
import { db } from "../db";
import { requireLogin } from "../auth";
import { serializeOrder } from "./serializers";

export const orders = Router();

orders.use(requireLogin);

// The signed-in customer's orders, newest first.
orders.get("/api/orders", async (req, res) => {
  const rows = await db.order.findMany({
    where: { customerId: req.user.customerId },
    orderBy: { createdAt: "desc" },
  });
  res.json(rows.map(serializeOrder));
});

export default orders;
