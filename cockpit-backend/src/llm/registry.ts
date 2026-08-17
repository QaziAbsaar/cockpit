import type { LLMProvider, LLMProviderName, SettingsLike } from "./types.js";

const KEY_FIELD: Record<LLMProviderName, keyof SettingsLike> = {
  deepseek: "deepseekApiKey",
  claude: "claudeApiKey",
  openai: "openaiApiKey",
  google: "googleApiKey"
};

export function resolveProvider(
  settings: SettingsLike,
  providers: Record<LLMProviderName, (apiKey: string) => LLMProvider>
): LLMProvider {
  const apiKey = settings[KEY_FIELD[settings.activeProvider]] as string | null;
  if (!apiKey) {
    throw new Error(`No API key configured for active provider "${settings.activeProvider}"`);
  }
  return providers[settings.activeProvider](apiKey);
}
