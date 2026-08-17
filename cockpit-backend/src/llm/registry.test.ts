import { describe, it, expect } from "vitest";
import { resolveProvider } from "./registry.js";
import type { LLMProvider } from "./types.js";

function fakeProvider(name: string): (key: string) => LLMProvider {
  return (apiKey: string) => ({
    name,
    reply: async () => `${name}:${apiKey}`
  });
}

describe("resolveProvider", () => {
  it("picks the provider factory matching activeProvider and injects its key", async () => {
    const provider = resolveProvider(
      {
        id: 1,
        activeProvider: "claude",
        deepseekApiKey: "dk",
        claudeApiKey: "ck",
        openaiApiKey: "ok",
        googleApiKey: "gk",
        personaPrompt: "persona"
      },
      {
        deepseek: fakeProvider("deepseek"),
        claude: fakeProvider("claude"),
        openai: fakeProvider("openai"),
        google: fakeProvider("google")
      }
    );
    expect(provider.name).toBe("claude");
    expect(await provider.reply([], "sys")).toBe("claude:ck");
  });

  it("throws if the active provider has no API key configured", () => {
    expect(() =>
      resolveProvider(
        {
          id: 1,
          activeProvider: "openai",
          deepseekApiKey: null,
          claudeApiKey: null,
          openaiApiKey: null,
          googleApiKey: null,
          personaPrompt: "persona"
        },
        {
          deepseek: fakeProvider("deepseek"),
          claude: fakeProvider("claude"),
          openai: fakeProvider("openai"),
          google: fakeProvider("google")
        }
      )
    ).toThrow(/no API key/i);
  });
});
