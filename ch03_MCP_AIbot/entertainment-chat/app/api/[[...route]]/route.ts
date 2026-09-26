import { Hono } from "hono";
import { handle } from "hono/vercel";
import type { CoreMessage } from "@mastra/core/llm";
import { chatAgent } from "@/lib/mastra/agent";
import { appendMessage, getHistory } from "@/lib/messages";

export const runtime = "nodejs";

const app = new Hono().basePath("/api");

app.post("/chat", async (c) => {
  const body = await c.req.json<{ sessionId?: string; message?: string }>().catch(() => null);
  const sessionId = body?.sessionId?.trim();
  const message = body?.message?.trim();

  if (!sessionId || !message) {
    return c.json({ error: "sessionId and message are required" }, 400);
  }

  try {
    const history = await getHistory(sessionId);
    const conversation: CoreMessage[] = [
      ...history.map(
        (m): CoreMessage => ({ role: m.role, content: m.content })
      ),
      { role: "user", content: message },
    ];

    await appendMessage(sessionId, "user", message);

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
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message : "不明なエラーが発生しました";
    return c.json({ error: detail }, 500);
  }
});

export const GET = handle(app);
export const POST = handle(app);
