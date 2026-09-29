import { PrismaClient } from "@/generated/prisma";

// Next.js hot-reloads modules in development, which would otherwise open a new
// connection pool on every edit. Cache the client on globalThis instead.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
