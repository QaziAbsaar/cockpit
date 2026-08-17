// src/routes/conversations.ts
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const conversationsRouter = Router();

conversationsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const conversations = await prisma.conversation.findMany({ orderBy: { updatedAt: "desc" } });
    res.json(conversations);
  })
);

conversationsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
    if (!conversation) return res.status(404).json({ error: "conversation not found" });
    res.json(conversation);
  })
);

conversationsRouter.patch("/:id/mode", async (req, res) => {
  const { mode, needsAttention } = req.body as { mode?: "ai" | "human"; needsAttention?: boolean };

  if (!mode || !["ai", "human"].includes(mode)) {
    return res.status(400).json({ error: "mode must be 'ai' or 'human'" });
  }
  if (needsAttention !== undefined && typeof needsAttention !== "boolean") {
    return res.status(400).json({ error: "needsAttention must be a boolean" });
  }

  try {
    const updated = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { mode, ...(needsAttention !== undefined ? { needsAttention } : {}) }
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return res.status(404).json({ error: "conversation not found" });
    }
    res.status(500).json({ error: "internal server error" });
  }
});
