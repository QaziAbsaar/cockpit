// src/routes/auth.ts
import { Router } from "express";
import { prisma } from "../db/client.js";
import { verifyPassword } from "../auth/password.js";
import { signAgentToken } from "../auth/jwt.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const authRouter = Router();

// A fixed, valid bcrypt hash with no corresponding real account. Used to run a dummy
// verifyPassword comparison when the agent doesn't exist, so that a nonexistent-email
// request takes the same time as a wrong-password request (avoids a user-enumeration
// timing side-channel).
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8vRqYS9M9L1z6Xj.9J0aBqYqQq1qYy";

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const agent = await prisma.agent.findUnique({ where: { email } });
    const passwordOk = agent
      ? await verifyPassword(password, agent.passwordHash)
      : await verifyPassword(password, DUMMY_HASH);
    if (!agent || !passwordOk) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const token = signAgentToken({ agentId: agent.id, role: agent.role });
    res.json({ token });
  })
);
