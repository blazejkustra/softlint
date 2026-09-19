import type { Request, Response } from "express";
import { db } from "../db";
import { logger } from "../lib/logger";

export async function signup(req: Request, res: Response) {
  const { email, name, phone } = req.body;
  try {
    const user = await db.user.create({ data: { email, name, phone } });
    logger.info("signup ok", { userId: user.id, plan: req.body.plan });
    res.status(201).json({ id: user.id });
  } catch (error) {
    logger.error("signup failed", { email, phone, error: String(error) });
    res.status(400).json({ error: "We couldn't create your account. Check your details and try again." });
  }
}
