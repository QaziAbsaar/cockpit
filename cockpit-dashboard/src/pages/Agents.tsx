import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";
import { Badge, Button, Card, Field, Input, Label, Select } from "../components/ui/primitives.js";

interface AgentRecord {
  id: string;
  name: string;
  email: string;
  role: "admin" | "agent";
}

export function Agents() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "agent">("agent");

  function load() {
    apiFetch("/agents").then(async (res) => {
      if (!res.ok) {
        setError("Failed to load agents.");
        return;
      }
      setError(null);
      setAgents(await res.json());
    });
  }

  useEffect(load, []);

  if (error) return <p role="alert" className="p-8 text-sm text-alert">{error}</p>;

  async function addAgent() {
    await apiFetch("/agents", { method: "POST", body: JSON.stringify({ name, email, password, role }) });
    setName("");
    setEmail("");
    setPassword("");
    load();
  }

  async function removeAgent(id: string) {
    await apiFetch(`/agents/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="font-display mb-6 text-2xl font-bold text-ink">Agents</h1>

      <ul className="mb-8 space-y-2">
        {agents.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm"
          >
            <span className="flex-1 truncate text-sm font-medium text-ink">{a.email}</span>
            <Badge tone={a.role === "admin" ? "human" : "neutral"}>{a.role}</Badge>
            <button
              onClick={() => removeAgent(a.id)}
              className="text-sm font-medium text-alert hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <Card className="p-6">
        <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">Add an agent</div>
        <Field>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field>
          <Label htmlFor="role">Role</Label>
          <Select id="role" value={role} onChange={(e) => setRole(e.target.value as "admin" | "agent")}>
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <Button onClick={addAgent}>Add agent</Button>
      </Card>
    </div>
  );
}
