import { readFile } from "node:fs/promises";

const manifestUrl = new URL("./qstash-deep-recovery.schedule.json", import.meta.url);

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function qstashApiBase(raw) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("QSTASH_URL must be an HTTPS origin without credentials");
  }
  return url.toString().replace(/\/$/, "").replace(/\/v2$/, "");
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function verify() {
  const token = requiredEnvironment("QSTASH_TOKEN");
  const baseUrl = qstashApiBase(requiredEnvironment("QSTASH_URL"));
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const scheduleResponse = await fetch(
    `${baseUrl}/v2/schedules/${encodeURIComponent(manifest.scheduleId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!scheduleResponse.ok) {
    throw new Error(`QStash schedule verification failed with HTTP ${scheduleResponse.status}`);
  }
  const schedule = await scheduleResponse.json();
  let scheduleBody = null;
  try {
    scheduleBody = JSON.parse(schedule.body);
  } catch {
    // Keep the mismatch generic; the response body is never printed.
  }
  const scheduleMatches =
    schedule.scheduleId === manifest.scheduleId &&
    schedule.destination === manifest.destination &&
    schedule.cron === manifest.cron &&
    schedule.method === manifest.method &&
    schedule.retries === manifest.retries &&
    schedule.isPaused === false &&
    (schedule.labels ?? []).includes(manifest.label) &&
    sameJson(scheduleBody, manifest.body);

  const capabilityUrl = new URL("/api/research/capabilities", manifest.destination);
  const capabilityResponse = await fetch(capabilityUrl, {
    headers: { Accept: "application/json" },
  });
  if (!capabilityResponse.ok) {
    throw new Error(`Production capability verification failed with HTTP ${capabilityResponse.status}`);
  }
  const capability = await capabilityResponse.json();
  const deep = capability?.modes?.deep;
  const requirements = Array.isArray(deep?.requirements) ? deep.requirements : [];
  const output = {
    schedule: {
      matchesContract: scheduleMatches,
      scheduleId: schedule.scheduleId,
      destination: schedule.destination,
      cron: schedule.cron,
      method: schedule.method,
      retries: schedule.retries,
      isPaused: schedule.isPaused,
      lastScheduleTime: schedule.lastScheduleTime ?? null,
      nextScheduleTime: schedule.nextScheduleTime ?? null,
    },
    deepResearch: {
      availability: deep?.availability ?? "unknown",
      recoveryState: deep?.recoveryState ?? "unknown",
      readyRequirements: requirements.filter((item) => item?.ready === true).length,
      totalRequirements: requirements.length,
      lastRecoveryAt: deep?.lastRecoveryAt ?? null,
      consecutiveOk: deep?.recoveryObservation?.consecutiveOk ?? 0,
    },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!scheduleMatches) process.exitCode = 2;
}

verify().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "QStash verification failed"}\n`);
  process.exitCode = 1;
});
