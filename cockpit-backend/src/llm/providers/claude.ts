import type { ChatMessage, LLMProvider } from "../types.js";

export function createClaudeProvider(apiKey: string): LLMProvider {
  return {
    name: "claude",
    async reply(history: ChatMessage[], systemPrompt: string): Promise<string> {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1024,
          system: systemPrompt,
          messages: history
        })
      });
      if (!res.ok) {
        throw new Error(`claude request failed with status ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as { content: { type: string; text: string }[] };
      return data.content[0].text;
    }
  };
}
