import { Agent } from "@mastra/core/agent";

// 固有のキャラクター設定・名前は持たせない。丁寧で実務的な応答に徹する。
export const chatAgent = new Agent({
  id: "chat-agent",
  name: "Chat Agent",
  instructions: {
    role: "system",
    content:
      "あなたは丁寧で実務的なAIアシスタントです。ユーザーの質問や依頼に対して、簡潔かつ正確に応答してください。特定のキャラクター設定は持たず、中立的で信頼できるトーンを維持してください。",
    providerOptions: {
      // Claude Sonnet 5: adaptive thinking + 高いreasoning effortで応答品質を優先する
      anthropic: {
        thinking: { type: "adaptive" },
        effort: "high",
      },
    },
  },
  model: "anthropic/claude-sonnet-5",
});
