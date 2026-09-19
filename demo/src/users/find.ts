import { db } from "../db";

export async function findUserById(id: string) {
  return db.user.findUniqueOrThrow({ where: { id } });
}
