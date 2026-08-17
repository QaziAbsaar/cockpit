import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client.js";

interface ConversationSummary {
  id: string;
  waChatId: string;
  mode: "ai" | "human";
  needsAttention: boolean;
  updatedAt: string;
}

export function ChatList() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  useEffect(() => {
    apiFetch("/conversations")
      .then((res) => res.json())
      .then(setConversations);
  }, []);

  return (
    <ul>
      {conversations.map((c) => (
        <li key={c.id}>
          <Link to={`/chats/${c.id}`}>{c.waChatId}</Link>
          <span> [{c.mode}]</span>
          {c.needsAttention && <strong> needs attention</strong>}
        </li>
      ))}
    </ul>
  );
}
