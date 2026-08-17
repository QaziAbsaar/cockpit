import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";
import { useConversationSocket } from "../ws/useConversationSocket.js";
import { Badge, Button, Textarea } from "../components/ui/primitives.js";

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

function bubbleTone(sender: string): string {
  if (sender === "customer") return "self-start bg-black/5 text-ink";
  if (sender === "ai") return "self-end bg-ai text-white";
  return "self-end bg-brand text-white";
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

  if (!conversation) return <p className="p-8 text-sm text-ink-soft">Loading…</p>;

  const isHuman = conversation.mode === "human";

  return (
    <div className="mx-auto flex h-screen max-w-3xl flex-col px-6 py-6">
      <div className="mb-4 flex items-center justify-between border-b border-border pb-4">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">{conversation.waChatId}</h2>
          {conversation.needsAttention && (
            <div className="mt-1">
              <Badge tone="alert">needs attention</Badge>
            </div>
          )}
        </div>

        <button
          onClick={toggleMode}
          aria-label={`Mode: ${conversation.mode} (click to toggle)`}
          className={
            "relative flex h-9 w-40 items-center rounded-full border p-1 text-xs font-semibold transition-colors " +
            (isHuman ? "border-brand/30 bg-brand-soft" : "border-ai/30 bg-ai-soft")
          }
        >
          <span
            className={
              "absolute h-7 w-[4.5rem] rounded-full bg-white shadow transition-transform " +
              (isHuman ? "translate-x-[4.7rem]" : "translate-x-0")
            }
          />
          <span className={"relative z-10 flex-1 text-center " + (!isHuman ? "text-ai" : "text-ink-soft")}>AI</span>
          <span className={"relative z-10 flex-1 text-center " + (isHuman ? "text-brand" : "text-ink-soft")}>Human</span>
        </button>
      </div>

      <ul className="flex flex-1 flex-col gap-3 overflow-y-auto py-2">
        {conversation.messages.map((m) => (
          <li key={m.id} className={"flex max-w-[75%] flex-col rounded-2xl px-4 py-2 text-sm " + bubbleTone(m.sender)}>
            <span className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">{m.sender}</span>
            {m.body}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-end gap-2 border-t border-border pt-4">
        <Textarea
          aria-label="reply"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!isHuman}
          rows={2}
          placeholder={isHuman ? "Type a reply…" : "Switch to Human mode to reply"}
          className="flex-1 resize-none"
        />
        <Button onClick={sendReply} disabled={!isHuman}>
          Send
        </Button>
      </div>
    </div>
  );
}
