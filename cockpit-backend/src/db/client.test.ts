// src/db/client.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "./client.js";

describe("prisma client", () => {
  it("creates and reads a Settings row", async () => {
    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {}
    });
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(settings?.activeProvider).toBe("deepseek");
  });

  afterAll(async () => {
    await prisma.settings.deleteMany();
    await prisma.$disconnect();
  });
});
