import type { ErrorRequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger";

/** Last-resort error handler: logs the full error and gives the customer a reference code for support. */
export const handleErrors: ErrorRequestHandler = (err, _req, res, _next) => {
  const ref = randomUUID().slice(0, 8);
  logger.error("unhandled error", { ref, error: String(err?.stack ?? err) });
  res.status(500).json({ error: `Something went wrong on our side. Please try again, or contact support with code ${ref}.` });
};
