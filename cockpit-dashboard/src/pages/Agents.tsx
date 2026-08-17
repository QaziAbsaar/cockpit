import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";

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

  if (error) return <p role="alert">{error}</p>;

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
    <div>
      <ul>
        {agents.map((a) => (
          <li key={a.id}>
            <span>{a.email}</span> ({a.role}) <button onClick={() => removeAgent(a.id)}>Remove</button>
          </li>
        ))}
      </ul>

      <label htmlFor="name">Name</label>
      <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      <label htmlFor="email">Email</label>
      <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="password">Password</label>
      <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <label htmlFor="role">Role</label>
      <select id="role" value={role} onChange={(e) => setRole(e.target.value as "admin" | "agent")}>
        <option value="agent">Agent</option>
        <option value="admin">Admin</option>
      </select>
      <button onClick={addAgent}>Add agent</button>
    </div>
  );
}
