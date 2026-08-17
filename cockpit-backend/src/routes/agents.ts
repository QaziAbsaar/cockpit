// src/routes/agents.ts
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { hashPassword } from "../auth/password.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const agentsRouter = Router();

agentsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const agents = await prisma.agent.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true }
    });
    res.json(agents);
  })
);

agentsRouter.post("/", async (req, res) => {
  const { name, email, password, role } = req.body as {
    name?: string; email?: string; password?: string; role?: "admin" | "agent";
  };
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password, role are required" });
  }
  if (role !== "admin" && role !== "agent") {
    return res.status(400).json({ error: "role must be 'admin' or 'agent'" });
  }
  try {
    const agent = await prisma.agent.create({
      data: { name, email, role, passwordHash: await hashPassword(password) },
      select: { id: true, name: true, email: true, role: true, createdAt: true }
    });
    res.status(201).json(agent);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "an agent with this email already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  }
});

agentsRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.agent.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return res.status(404).json({ error: "agent not found" });
    }
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  }
});
