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

async function readManifest() {
  return JSON.parse(await readFile(manifestUrl, "utf8"));
}

async function configure() {
  const token = requiredEnvironment("QSTASH_TOKEN");
  const baseUrl = qstashApiBase(requiredEnvironment("QSTASH_URL"));
  const manifest = await readManifest();
  const endpoint = `${baseUrl}/v2/schedules/${encodeURIComponent(manifest.destination)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": manifest.contentType,
      "Upstash-Cron": manifest.cron,
      "Upstash-Schedule-Id": manifest.scheduleId,
      "Upstash-Method": manifest.method,
      "Upstash-Timeout": manifest.timeout,
      "Upstash-Retries": String(manifest.retries),
      "Upstash-Label": manifest.label,
    },
    body: JSON.stringify(manifest.body),
  });
  if (!response.ok) {
    throw new Error(`QStash schedule configuration failed with HTTP ${response.status}`);
  }
  const result = await response.json();
  if (result.scheduleId !== manifest.scheduleId) {
    throw new Error("QStash returned an unexpected schedule identifier");
  }
  process.stdout.write(`${JSON.stringify({
    configured: true,
    scheduleId: result.scheduleId,
    destination: manifest.destination,
    cron: manifest.cron,
  })}\n`);
}

configure().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "QStash configuration failed"}\n`);
  process.exitCode = 1;
});
