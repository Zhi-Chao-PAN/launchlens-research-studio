import { NextResponse } from "next/server";
import { verifyCsrf } from "@/lib/api/csrf-guard";
import { rotateCsrf } from "@/lib/api/csrf-rotate";
import { checkRateLimitForIp } from "@/lib/api/rate-limit";
import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  createSchedule,
  listSchedules,
  getSchedulerStats,
  ensurePollerRunning,
  type ScheduleInterval,
} from "@/lib/research/scheduler";

const CreateScheduleSchema = z.object({
  name: z.string().min(1).max(120),
  query: z.string().min(1).max(500),
  keywords: z.array(z.string()).optional().default([]),
  agent: z.string().optional(),
  interval: z.enum(["hourly", "daily", "weekly", "interval"]),
  intervalMinutes: z.number().int().min(1).max(10080).optional(),
  hourOfDay: z.number().int().min(0).max(23).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
});

// GET /api/research/schedules - list all schedules + stats
export async function GET() {
  const schedules = listSchedules();
  const stats = getSchedulerStats();
  return NextResponse.json({ schedules, stats });
}

// POST /api/research/schedules - create a new schedule
export async function POST(request: NextRequest) {
  const csrfRejection = verifyCsrf(request);
  if (csrfRejection) return csrfRejection;

  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const rl = checkRateLimitForIp(ip, { capacity: 20, refillIntervalMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.resetMs }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } });
  }

  try {
    const body = await request.json();
    const parsed = CreateScheduleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.message },
        { status: 400 },
      );
    }

    const schedule = createSchedule(parsed.data);
    ensurePollerRunning();

    return NextResponse.json(
      {
        id: schedule.id,
        name: schedule.name,
        query: schedule.query,
        status: schedule.status,
        interval: schedule.interval,
        nextRunAt: schedule.nextRunAt,
        totalRuns: schedule.totalRuns,
      },
      { status: 201 },
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}