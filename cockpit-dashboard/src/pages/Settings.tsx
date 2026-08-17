import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";

interface SettingsView {
  activeProvider: "deepseek" | "claude" | "openai" | "google";
  personaPrompt: string;
  hasDeepseekKey: boolean;
  hasClaudeKey: boolean;
  hasOpenaiKey: boolean;
  hasGoogleKey: boolean;
}

export function Settings() {
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});

  useEffect(() => {
    apiFetch("/settings").then((res) => res.json()).then(setSettings);
  }, []);

  if (!settings) return <p>Loading…</p>;

  async function save() {
    const res = await apiFetch("/settings", {
      method: "PUT",
      body: JSON.stringify({
        activeProvider: settings!.activeProvider,
        personaPrompt: settings!.personaPrompt,
        deepseekApiKey: keys.deepseek || undefined,
        claudeApiKey: keys.claude || undefined,
        openaiApiKey: keys.openai || undefined,
        googleApiKey: keys.google || undefined
      })
    });
    setSettings(await res.json());
  }

  return (
    <div>
      <label htmlFor="activeProvider">Active provider</label>
      <select
        id="activeProvider"
        value={settings.activeProvider}
        onChange={(e) => setSettings({ ...settings, activeProvider: e.target.value as SettingsView["activeProvider"] })}
      >
        <option value="deepseek">DeepSeek</option>
        <option value="claude">Claude</option>
        <option value="openai">OpenAI</option>
        <option value="google">Google</option>
      </select>

      {(["deepseek", "claude", "openai", "google"] as const).map((p) => (
        <div key={p}>
          <label htmlFor={`key-${p}`}>{p} API key</label>
          <input
            id={`key-${p}`}
            type="password"
            placeholder={settings[`has${p[0].toUpperCase()}${p.slice(1)}Key` as keyof SettingsView] ? "configured" : "not set"}
            value={keys[p] ?? ""}
            onChange={(e) => setKeys({ ...keys, [p]: e.target.value })}
          />
        </div>
      ))}

      <label htmlFor="personaPrompt">Persona prompt</label>
      <textarea
        id="personaPrompt"
        value={settings.personaPrompt}
        onChange={(e) => setSettings({ ...settings, personaPrompt: e.target.value })}
      />

      <button onClick={save}>Save</button>
    </div>
  );
}
