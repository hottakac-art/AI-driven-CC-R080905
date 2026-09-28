import { Hono } from "hono";
import { handle } from "hono/vercel";
import type { CoreMessage } from "@mastra/core/llm";
import { chatAgent } from "@/lib/mastra/agent";
import {
  appendMessage,
  getHistory,
  type ImageAttachmentInput,
} from "@/lib/messages";

export const runtime = "nodejs";

const MAX_IMAGES_PER_MESSAGE = 3;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB(base64化前のサイズ換算)
const MAX_MESSAGE_LENGTH = 4000;
const ALLOWED_IMAGE_MEDIA_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

type MessageContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string; mimeType: string };

const app = new Hono().basePath("/api");

type ChatRequestImage = { mediaType?: string; data?: string };
type ChatRequestBody = {
  sessionId?: string;
  message?: string;
  images?: ChatRequestImage[];
};

function estimateDecodedBytes(base64: string) {
  const cleaned = base64.replace(/=+$/, "");
  return Math.floor((cleaned.length * 3) / 4);
}

function validateImages(
  images: ChatRequestImage[] | undefined
): ImageAttachmentInput[] | string {
  if (!images || images.length === 0) return [];
  if (images.length > MAX_IMAGES_PER_MESSAGE) {
    return `画像は1メッセージにつき最大${MAX_IMAGES_PER_MESSAGE}枚までです`;
  }

  const validated: ImageAttachmentInput[] = [];
  for (const img of images) {
    const mediaType = img.mediaType?.trim();
    const data = img.data?.trim();
    if (!mediaType || !data) {
      return "画像データが不正です";
    }
    if (!ALLOWED_IMAGE_MEDIA_TYPES.has(mediaType)) {
      return `対応していない画像形式です(${mediaType})。png/jpeg/webp/gifのみ利用できます`;
    }
    if (estimateDecodedBytes(data) > MAX_IMAGE_BYTES) {
      return `画像サイズが大きすぎます(1枚あたり${MAX_IMAGE_BYTES / (1024 * 1024)}MBまで)`;
    }
    validated.push({ mediaType, data });
  }
  return validated;
}

function toMessageContent(
  text: string,
  images: readonly ImageAttachmentInput[]
): string | MessageContentPart[] {
  if (images.length === 0) return text;
  const parts: MessageContentPart[] = [];
  if (text) parts.push({ type: "text", text });
  for (const img of images) {
    parts.push({ type: "image", image: img.data, mimeType: img.mediaType });
  }
  return parts;
}

app.post("/chat", async (c) => {
  const body = await c.req.json<ChatRequestBody>().catch(() => null);
  const sessionId = body?.sessionId?.trim();
  const message = body?.message?.trim() ?? "";

  if (!sessionId) {
    return c.json({ error: "sessionId is required" }, 400);
  }

  const imagesResult = validateImages(body?.images);
  if (typeof imagesResult === "string") {
    return c.json({ error: imagesResult }, 400);
  }
  const images = imagesResult;

  if (!message && images.length === 0) {
    return c.json({ error: "message or images are required" }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return c.json(
      { error: `メッセージは${MAX_MESSAGE_LENGTH}文字以内で入力してください` },
      400
    );
  }

  try {
    const history = await getHistory(sessionId);
    const conversation: CoreMessage[] = [
      ...history.map((m): CoreMessage =>
        m.role === "assistant"
          ? { role: "assistant", content: m.content }
          : { role: "user", content: toMessageContent(m.content, m.images) }
      ),
      { role: "user", content: toMessageContent(message, images) },
    ];

    await appendMessage(sessionId, "user", message, images);

    const result = await chatAgent.generate(conversation);
    const reply = result.text;

    await appendMessage(sessionId, "assistant", reply);

    return c.json({ reply });
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message : "不明なエラーが発生しました";
    return c.json({ error: detail }, 500);
  }
});

app.get("/messages", async (c) => {
  const sessionId = c.req.query("sessionId");
  if (!sessionId) {
    return c.json({ error: "sessionId is required" }, 400);
  }

  try {
    const history = await getHistory(sessionId);
    return c.json({
      messages: history.map((m) => ({
        role: m.role,
        content: m.content,
        images: m.images.map((img) => ({
          mediaType: img.mediaType,
          data: img.data,
        })),
      })),
    });
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message : "不明なエラーが発生しました";
    return c.json({ error: detail }, 500);
  }
});

export const GET = handle(app);
export const POST = handle(app);
