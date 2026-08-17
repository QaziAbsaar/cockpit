import jwt from "jsonwebtoken";

function requireSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

const SECRET = requireSecret();

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
