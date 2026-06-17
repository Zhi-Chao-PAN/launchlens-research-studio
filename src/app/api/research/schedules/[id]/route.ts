import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  getSchedule,
  updateSchedule,
  deleteSchedule,
  toggleSchedule,
  type ScheduleInterval,
} from "@/lib/research/scheduler";

const UpdateScheduleSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  query: z.string().min(1).max(500).optional(),
  keywords: z.array(z.string()).optional(),
  agent: z.string().optional(),
  interval: z.enum(["hourly", "daily", "weekly", "interval"]).optional(),
  intervalMinutes: z.number().int().min(1).max(10080).optional(),
  hourOfDay: z.number().int().min(0).max(23).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  status: z.enum(["active", "paused"]).optional(),
});

// GET /api/research/schedules/[id] - get a single schedule
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const schedule = getSchedule(id);

  if (!schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  return NextResponse.json({ schedule });
}

// PATCH /api/research/schedules/[id] - update a schedule
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateScheduleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.message },
        { status: 400 },
      );
    }

    const updated = updateSchedule(id, parsed.data);

    if (!updated) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    return NextResponse.json({ schedule: updated });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}

// DELETE /api/research/schedules/[id] - delete a schedule
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = deleteSchedule(id);

  if (!deleted) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}