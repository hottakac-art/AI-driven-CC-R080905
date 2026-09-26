import { db } from "@/src/prisma/db";

export type ChatRole = "user" | "assistant";

export async function getHistory(sessionId: string) {
  return db.orm.messages
    .where({ sessionId })
    .orderBy({ createdAt: 1 })
    .all();
}

export async function appendMessage(
  sessionId: string,
  role: ChatRole,
  content: string
) {
  return db.orm.messages.create({
    sessionId,
    role,
    content,
    createdAt: new Date(),
  });
}
