import { randomInt, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const diceCount = Number(body?.diceCount);
    if (!Number.isInteger(diceCount) || diceCount < 2 || diceCount > 4) {
      return NextResponse.json({ error: "Le nombre de dés doit être compris entre 2 et 4." }, { status: 400 });
    }
    const dice = Array.from({ length: diceCount }, () => randomInt(1, 7));
    const total = dice.reduce((sum, face) => sum + face, 0);
    const rollId = randomUUID();
    console.info("[le-2-des] server roll", { rollId, diceCount, dice, total, createdAt: new Date().toISOString() });
    return NextResponse.json({ dice, total, rollId }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Impossible de lancer les dés." }, { status: 400 });
  }
}
