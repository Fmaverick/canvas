import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/infrastructure/db/client";

export async function GET() {
  try {
    const result = await db.execute<{
      database_name: string;
      checked_at: string;
    }>(sql`
      select current_database() as database_name, now()::text as checked_at
    `);

    const row = result[0];

    return NextResponse.json({
      success: true,
      data: {
        status: "ok",
        database: row?.database_name ?? null,
        checked_at: row?.checked_at ?? null,
      },
      error: null,
      request_id: crypto.randomUUID(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";

    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message,
        },
        request_id: crypto.randomUUID(),
      },
      { status: 500 },
    );
  }
}
