import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Liveness probe for the container orchestrator.
 *
 * It touches the database on purpose: a server that is listening but cannot
 * reach Postgres serves nothing but errors, and should fail the check so the
 * deployment rolls back rather than replacing a working version.
 */
export const GET = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "database unreachable" }, { status: 503 });
  }
};
