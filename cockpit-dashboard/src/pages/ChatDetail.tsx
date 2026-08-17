import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useConversationSocket } from "../ws/useConversationSocket.js";

interface MessageRecord {
  id: string;
  direction: "in" | "out";
  sender: string;
  body: string;
  createdAt: string;
}

interface ConversationDetail {
  id: string;
  waChatId: string;
  mode: "ai" | "human";
  needsAttention: boolean;
  messages: MessageRecord[];
}

export function ChatDetail() {
  const { id } = useParams<{ id: string }>();
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [draft, setDraft] = useState("");

  async function load() {
    const res = await apiFetch(`/conversations/${id}`);
    setConversation(await res.json());
  }

  useEffect(() => {
    load();
  }, [id]);

  useConversationSocket((event) => {
    if (event.payload.conversationId === id) load();
  });

  async function toggleMode() {
    if (!conversation) return;
    const nextMode = conversation.mode === "ai" ? "human" : "ai";
    await apiFetch(`/conversations/${id}/mode`, {
      method: "PATCH",
      body: JSON.stringify({ mode: nextMode, needsAttention: false })
    });
    load();
  }

  async function sendReply() {
    if (!draft.trim()) return;
    await apiFetch(`/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ body: draft }) });
    setDraft("");
    load();
  }

  if (!conversation) return <p>Loading…</p>;

  return (
    <div>
      <h2>{conversation.waChatId}</h2>
      <button onClick={toggleMode}>Mode: {conversation.mode} (click to toggle)</button>
      <ul>
        {conversation.messages.map((m) => (
          <li key={m.id}>
            <strong>{m.sender}:</strong> {m.body}
          </li>
        ))}
      </ul>
      <textarea
        aria-label="reply"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={conversation.mode !== "human"}
      />
      <button onClick={sendReply} disabled={conversation.mode !== "human"}>
        Send
      </button>
    </div>
  );
}
