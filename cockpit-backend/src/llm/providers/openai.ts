import type { ChatMessage, LLMProvider } from "../types.js";

export function createOpenAIProvider(apiKey: string): LLMProvider {
  return {
    name: "openai",
    async reply(history: ChatMessage[], systemPrompt: string): Promise<string> {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "system", content: systemPrompt }, ...history]
        })
      });
      if (!res.ok) {
        throw new Error(`openai request failed with status ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      return data.choices[0].message.content;
    }
  };
}
