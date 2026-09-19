import { db } from "../db";

export async function findUserById(id: string) {
  return db.user.findUniqueOrThrow({ where: { id } });
}

/** Looks up a user by email. Returns `null` when there's no account for it, so callers can offer sign-up. */
export async function findUserByEmail(email: string) {
  return db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
}

/**
 * Loads a user's saved addresses. Results are cached for five minutes, so repeated calls during one
 * checkout don't hit the database.
 */
export async function savedAddresses(userId: string) {
  return db.address.findMany({ where: { userId }, orderBy: { lastUsedAt: "desc" } });
}
