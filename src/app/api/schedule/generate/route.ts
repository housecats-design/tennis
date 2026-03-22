import { generateSchedule } from "@/lib/scheduler";
import { generateScheduleSchema } from "@/lib/validator";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = generateScheduleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Invalid request.",
        errors: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const normalizedInput = {
    ...parsed.data,
    players: parsed.data.players.map((player) => ({
      ...player,
      name: player.name.trim(),
    })),
  };

  const schedule = generateSchedule(normalizedInput);
  return NextResponse.json(schedule);
}
