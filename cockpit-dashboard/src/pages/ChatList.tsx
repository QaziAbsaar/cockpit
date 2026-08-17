import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useConversationSocket } from "../ws/useConversationSocket.js";
import { Badge } from "../components/ui/primitives.js";

interface ConversationSummary {
  id: string;
  waChatId: string;
  mode: "ai" | "human";
  needsAttention: boolean;
  updatedAt: string;
}

function initials(waChatId: string): string {
  const digits = waChatId.replace(/\D/g, "");
  return digits.slice(-2) || "?";
}

export function ChatList() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  useEffect(() => {
    apiFetch("/conversations")
      .then((res) => res.json())
      .then(setConversations);
  }, []);

  useConversationSocket(() => {
    apiFetch("/conversations").then((res) => res.json()).then(setConversations);
  });

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="font-display mb-6 text-2xl font-bold text-ink">Inbox</h1>

      {conversations.length === 0 ? (
        <p className="text-sm text-ink-soft">No conversations yet — they'll show up here once a customer messages in.</p>
      ) : (
        <ul className="space-y-2">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                to={`/chats/${c.id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-sm font-semibold text-ink-soft">
                  {initials(c.waChatId)}
                </span>
                <span className="flex-1 truncate text-sm font-medium text-ink">{c.waChatId}</span>
                <Badge tone={c.mode === "ai" ? "ai" : "human"}>{c.mode}</Badge>
                {c.needsAttention && <Badge tone="alert">needs attention</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
