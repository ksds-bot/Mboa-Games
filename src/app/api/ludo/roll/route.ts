import { randomInt, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  const roll = randomInt(1, 7);
  return NextResponse.json(
    { roll, rollId: randomUUID() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
