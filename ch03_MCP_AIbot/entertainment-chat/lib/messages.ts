import { db } from "@/src/prisma/db";

export type ChatRole = "user" | "assistant";

export type ImageAttachmentInput = {
  mediaType: string;
  data: string;
};

export async function getHistory(sessionId: string) {
  return db.orm.messages
    .where({ sessionId })
    .orderBy({ createdAt: 1 })
    .all();
}

export async function appendMessage(
  sessionId: string,
  role: ChatRole,
  content: string,
  images: ImageAttachmentInput[] = []
) {
  return db.orm.messages.create({
    sessionId,
    role,
    content,
    images,
    createdAt: new Date(),
  });
}
