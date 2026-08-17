export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMProvider {
  name: string;
  reply(history: ChatMessage[], systemPrompt: string): Promise<string>;
}

export type LLMProviderName = "deepseek" | "claude" | "openai" | "google";

export interface SettingsLike {
  id: number;
  activeProvider: LLMProviderName;
  deepseekApiKey: string | null;
  claudeApiKey: string | null;
  openaiApiKey: string | null;
  googleApiKey: string | null;
  personaPrompt: string;
}
