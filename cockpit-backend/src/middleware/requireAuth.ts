// src/middleware/requireAuth.ts
import type { Request, Response, NextFunction } from "express";
import { verifyAgentToken, type AgentTokenPayload } from "../auth/jwt.js";

declare global {
  namespace Express {
    interface Request {
      agent?: AgentTokenPayload;
    }
  }
}

export function requireAuth(roles?: ("admin" | "agent")[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "missing bearer token" });
    }
    try {
      const payload = verifyAgentToken(header.slice("Bearer ".length));
      if (roles && !roles.includes(payload.role)) {
        return res.status(403).json({ error: "insufficient role" });
      }
      req.agent = payload;
      next();
    } catch {
      res.status(401).json({ error: "invalid token" });
    }
  };
}
