import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

export interface AgentTokenPayload {
  agentId: string;
  role: "admin" | "agent";
}

export function signAgentToken(payload: AgentTokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "12h" });
}

export function verifyAgentToken(token: string): AgentTokenPayload {
  return jwt.verify(token, SECRET) as AgentTokenPayload;
}
