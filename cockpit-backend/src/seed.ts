// src/seed.ts
import { prisma } from "./db/client.js";
import { hashPassword } from "./auth/password.js";

function requireSeedPassword(): string {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) {
    throw new Error("SEED_ADMIN_PASSWORD environment variable is required");
  }
  return password;
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const password = requireSeedPassword();

  const existing = await prisma.agent.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists, skipping.`);
    return;
  }

  await prisma.agent.create({
    data: { name: "Admin", email, passwordHash: await hashPassword(password), role: "admin" }
  });
  await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  console.log(`Seeded admin ${email}. Change the password after first login.`);
}

main().finally(() => prisma.$disconnect());
