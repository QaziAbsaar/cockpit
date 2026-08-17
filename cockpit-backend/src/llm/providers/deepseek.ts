import type { ChatMessage, LLMProvider } from "../types.js";

export function createDeepSeekProvider(apiKey: string): LLMProvider {
  return {
    name: "deepseek",
    async reply(history: ChatMessage[], systemPrompt: string): Promise<string> {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "system", content: systemPrompt }, ...history]
        })
      });
      if (!res.ok) {
        throw new Error(`deepseek request failed with status ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      return data.choices[0].message.content;
    }
  };
}
