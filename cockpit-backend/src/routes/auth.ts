// src/routes/auth.ts
import { Router } from "express";
import { prisma } from "../db/client.js";
import { verifyPassword } from "../auth/password.js";
import { signAgentToken } from "../auth/jwt.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const agent = await prisma.agent.findUnique({ where: { email } });
  if (!agent || !(await verifyPassword(password, agent.passwordHash))) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  const token = signAgentToken({ agentId: agent.id, role: agent.role });
  res.json({ token });
});
