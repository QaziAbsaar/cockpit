import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";
import { Button, Card, Field, Input, Label, Select, Textarea } from "../components/ui/primitives.js";

interface SettingsView {
  activeProvider: "deepseek" | "claude" | "openai" | "google";
  personaPrompt: string;
  hasDeepseekKey: boolean;
  hasClaudeKey: boolean;
  hasOpenaiKey: boolean;
  hasGoogleKey: boolean;
}

const PROVIDER_LABELS: Record<string, string> = {
  deepseek: "DeepSeek",
  claude: "Claude",
  openai: "OpenAI",
  google: "Google"
};

export function Settings() {
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/settings").then(async (res) => {
      if (!res.ok) {
        setError("Failed to load settings.");
        return;
      }
      setSettings(await res.json());
    });
  }, []);

  if (error) return <p role="alert" className="p-8 text-sm text-alert">{error}</p>;
  if (!settings) return <p className="p-8 text-sm text-ink-soft">Loading…</p>;

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
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="font-display mb-6 text-2xl font-bold text-ink">Settings</h1>

      <Card className="p-6">
        <Field>
          <Label htmlFor="activeProvider">Active provider</Label>
          <Select
            id="activeProvider"
            value={settings.activeProvider}
            onChange={(e) => setSettings({ ...settings, activeProvider: e.target.value as SettingsView["activeProvider"] })}
          >
            <option value="deepseek">DeepSeek</option>
            <option value="claude">Claude</option>
            <option value="openai">OpenAI</option>
            <option value="google">Google</option>
          </Select>
        </Field>

        <div className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-ink-soft">API keys</div>
        {(["deepseek", "claude", "openai", "google"] as const).map((p) => {
          const hasKey = settings[`has${p[0].toUpperCase()}${p.slice(1)}Key` as keyof SettingsView] as boolean;
          return (
            <Field key={p}>
              <Label htmlFor={`key-${p}`} className="flex items-center justify-between">
                <span>{PROVIDER_LABELS[p]} API key</span>
                <span className={"text-xs font-normal " + (hasKey ? "text-brand" : "text-ink-soft")}>
                  {hasKey ? "configured" : "not set"}
                </span>
              </Label>
              <Input
                id={`key-${p}`}
                type="password"
                placeholder={hasKey ? "configured" : "not set"}
                value={keys[p] ?? ""}
                onChange={(e) => setKeys({ ...keys, [p]: e.target.value })}
              />
            </Field>
          );
        })}

        <Field>
          <Label htmlFor="personaPrompt">Persona prompt</Label>
          <Textarea
            id="personaPrompt"
            rows={4}
            value={settings.personaPrompt}
            onChange={(e) => setSettings({ ...settings, personaPrompt: e.target.value })}
          />
        </Field>

        <Button onClick={save}>Save</Button>
      </Card>
    </div>
  );
}
