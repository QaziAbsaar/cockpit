import type { ChatMessage, LLMProvider } from "../types.js";

export function createGoogleProvider(apiKey: string): LLMProvider {
  return {
    name: "google",
    async reply(history: ChatMessage[], systemPrompt: string): Promise<string> {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: history.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          }))
        })
      });
      if (!res.ok) {
        throw new Error(`google request failed with status ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as {
        candidates: { content: { parts: { text: string }[] } }[];
      };
      return data.candidates[0].content.parts[0].text;
    }
  };
}
