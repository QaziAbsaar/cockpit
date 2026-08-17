// src/routes/settings.ts
import { Router } from "express";
import { prisma } from "../db/client.js";
import type { LLMProviderName } from "../llm/types.js";

export const settingsRouter = Router();

function redact(settings: {
  activeProvider: LLMProviderName;
  personaPrompt: string;
  deepseekApiKey: string | null;
  claudeApiKey: string | null;
  openaiApiKey: string | null;
  googleApiKey: string | null;
}) {
  return {
    activeProvider: settings.activeProvider,
    personaPrompt: settings.personaPrompt,
    hasDeepseekKey: Boolean(settings.deepseekApiKey),
    hasClaudeKey: Boolean(settings.claudeApiKey),
    hasOpenaiKey: Boolean(settings.openaiApiKey),
    hasGoogleKey: Boolean(settings.googleApiKey)
  };
}

settingsRouter.get("/", async (_req, res) => {
  const settings = await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  res.json(redact(settings));
});

settingsRouter.put("/", async (req, res) => {
  const { activeProvider, deepseekApiKey, claudeApiKey, openaiApiKey, googleApiKey, personaPrompt } =
    req.body as Partial<{
      activeProvider: LLMProviderName;
      deepseekApiKey: string;
      claudeApiKey: string;
      openaiApiKey: string;
      googleApiKey: string;
      personaPrompt: string;
    }>;

  if (activeProvider !== undefined && !["deepseek", "claude", "openai", "google"].includes(activeProvider)) {
    return res.status(400).json({ error: "activeProvider must be one of: deepseek, claude, openai, google" });
  }

  try {
    const updated = await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, activeProvider, deepseekApiKey, claudeApiKey, openaiApiKey, googleApiKey, personaPrompt },
      update: { activeProvider, deepseekApiKey, claudeApiKey, openaiApiKey, googleApiKey, personaPrompt }
    });
    res.json(redact(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  }
});
