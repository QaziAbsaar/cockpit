// src/routes/agents.ts
import { Router } from "express";
import { prisma } from "../db/client.js";
import { hashPassword } from "../auth/password.js";

export const agentsRouter = Router();

agentsRouter.get("/", async (_req, res) => {
  const agents = await prisma.agent.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true }
  });
  res.json(agents);
});

agentsRouter.post("/", async (req, res) => {
  const { name, email, password, role } = req.body as {
    name?: string; email?: string; password?: string; role?: "admin" | "agent";
  };
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password, role are required" });
  }
  const agent = await prisma.agent.create({
    data: { name, email, role, passwordHash: await hashPassword(password) },
    select: { id: true, name: true, email: true, role: true, createdAt: true }
  });
  res.status(201).json(agent);
});

agentsRouter.delete("/:id", async (req, res) => {
  await prisma.agent.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
