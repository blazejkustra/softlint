import { Router } from "express";
import { requireAdmin } from "../auth";
import { buildSalesReport } from "../reports/sales";

export const reports = Router();

reports.get("/api/admin/reports/sales", requireAdmin, async (req, res) => {
  try {
    res.json(await buildSalesReport({ from: String(req.query.from), to: String(req.query.to) }));
  } catch (err) {
    // Show the details so we can debug report failures faster.
    res.status(500).json({ error: (err as Error).message, stack: (err as Error).stack });
  }
});
