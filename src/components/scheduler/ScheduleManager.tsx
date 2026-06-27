"use client";
import { fetchWithCsrf, formatApiError } from "@/lib/api/csrf-client";
import { useConfirm } from "@/components/ui/useConfirm";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/toast/ToastContext";
import { useLocale } from "@/lib/i18n/LocaleProvider";

type ScheduleInterval = "hourly" | "daily" | "weekly" | "interval";
type ScheduleStatus = "active" | "paused";

interface ResearchSchedule {
  id: string;
  name: string;
  query: string;
  keywords: string[];
  agent?: string;
  status: ScheduleStatus;
  interval: ScheduleInterval;
  intervalMinutes?: number;
  hourOfDay?: number;
  dayOfWeek?: number;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  lastRunId?: string;
  nextRunAt: number;
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
}

interface SchedulerStats {
  total: number;
  active: number;
  paused: number;
  nextRunAt?: number;
  totalRuns: number;
}

const statusClass = (s: ScheduleStatus): string =>
  s === "active" ? "sch-status-active" : "sch-status-paused";

export function ScheduleManager() {
  const { showToast } = useToast();
  const { askConfirm, dialog: confirmDialog } = useConfirm();
  const { t, locale } = useLocale();
  const [schedules, setSchedules] = useState<ResearchSchedule[]>([]);
  const [stats, setStats] = useState<SchedulerStats | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setSchError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [keywords, setKeywords] = useState("");
  const [interval, setInterval] = useState<ScheduleInterval>("daily");
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [hourOfDay, setHourOfDay] = useState(9);
  const [dayOfWeek, setDayOfWeek] = useState(1);

  const dayKeys = [
    "schedule.daySun", "schedule.dayMon", "schedule.dayTue",
    "schedule.dayWed", "schedule.dayThu", "schedule.dayFri", "schedule.daySat",
  ];

  const formatInterval = (s: ResearchSchedule): string => {
    const hh = String(s.hourOfDay ?? 9).padStart(2, "0");
    switch (s.interval) {
      case "hourly": return t("schedule.intervalHourlyShort", "Hourly");
      case "daily": return t("schedule.intervalDailyShort", "Daily at {hh}:00", { hh });
      case "weekly": {
        const day = t(dayKeys[s.dayOfWeek ?? 1], dayKeys[s.dayOfWeek ?? 1]);
        return t("schedule.intervalWeeklyShort", "{day} {hh}:00", { day, hh });
      }
      case "interval": return t("schedule.intervalMinutesShort", "Every {minutes} min", { minutes: String(s.intervalMinutes ?? 60) });
      default: return t("schedule.intervalUnknown", "Unknown");
    }
  };

  const formatTime = (ts?: number): string => {
    if (!ts) return "—";
    return new Date(ts).toLocaleString(locale, {
      month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const statusLabel = (s: ScheduleStatus): string =>
    s === "active" ? t("schedule.statusActive", "Active") : t("schedule.statusPaused", "Paused");

  const loadSchedules = useCallback(async () => {
    try {
      const res = await fetch("/api/research/schedules");
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules || []);
        setStats(data.stats || null);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadSchedules);
  }, [loadSchedules]);

  // Refresh every 30s
  useEffect(() => {
    const t = window.setInterval(loadSchedules, 30000);
    return () => window.clearInterval(t);
  }, [loadSchedules]);

  const resetForm = () => {
    setName("");
    setQuery("");
    setKeywords("");
    setInterval("daily");
    setIntervalMinutes(60);
    setHourOfDay(9);
    setDayOfWeek(1);
    setShowForm(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    try {
      const kwList = keywords
        .split(/[,，]/)
        .map((k) => k.trim())
        .filter(Boolean);

      const res = await fetch("/api/research/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || t("schedule.untitled", "Untitled schedule"),
          query: query.trim(),
          keywords: kwList,
          interval,
          intervalMinutes: interval === "interval" ? intervalMinutes : undefined,
          hourOfDay: (interval === "daily" || interval === "weekly") ? hourOfDay : undefined,
          dayOfWeek: interval === "weekly" ? dayOfWeek : undefined,
        }),
      });

      if (res.ok) {
        resetForm();
        await loadSchedules();
      } else {
        const err = await res.json();
        showToast(err.error || "Create failed", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      const s = schedules.find((s) => s.id === id);
      if (!s) return;

      const toggleRes = await fetchWithCsrf(`/api/research/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: s.status === "active" ? "paused" : "active" }),
      });

      if (toggleRes.ok) {
        await loadSchedules();
      }
    } catch (e) {
      setSchError(formatApiError(e, { prefix: "Toggle failed:" }));
    }
  };

  const handleDelete = (id: string) => {
    askConfirm(
      t("schedule.deleteConfirmTitle", "Delete scheduled research?"),
      t("schedule.deleteConfirmBody", "This schedule will stop running permanently."),
      () => handleDeleteConfirm(id),
    );
  };
  const handleDeleteConfirm = async (id: string) => {
    try {
      const res = await fetchWithCsrf(`/api/research/schedules/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await loadSchedules();
      }
    } catch (e) {
      setSchError(formatApiError(e, { prefix: "Delete failed:" }));
    }
  };

  const handleTrigger = async (id: string) => {
    try {
      const res = await fetchWithCsrf(`/api/research/schedules/${id}/trigger`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`Triggered, batch ID: ${data.batchId}`, "success");
        await loadSchedules();
      }
    } catch (e) {
      setSchError(formatApiError(e, { prefix: "Trigger failed:" }));
    }
  };

  // Dismiss error banner
  const dismissError = () => setSchError(null);

  return (
    <div className="schedule-manager">
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2 mb-3 flex items-center justify-between" role="alert">
          <span>{error}</span>
          <button onClick={dismissError} className="text-rose-600 hover:text-rose-900 ml-2" aria-label="Dismiss">x</button>
        </div>
      )}
      <div className="sch-header">
        <div className="sch-header-left">
          <h2 className="sch-title">{t("schedule.title", "Scheduled research")}</h2>
          <p className="sch-subtitle">{t("schedule.subtitle", "Set up recurring automatic research to track changes over time.")}</p>
        </div>
        {stats && (
          <div className="sch-stats">
            <span className="sch-stat">
              <strong>{stats.total}</strong> {t("schedule.statTotal", "Total")}
            </span>
            <span className="sch-stat sch-stat-active">
              <strong>{stats.active}</strong> {t("schedule.statActive", "Active")}
            </span>
            <span className="sch-stat sch-stat-paused">
              <strong>{stats.paused}</strong> {t("schedule.statPaused", "Paused")}
            </span>
            <span className="sch-stat sch-stat-runs">
              <strong>{stats.totalRuns}</strong> {t("schedule.statRuns", "Total runs")}
            </span>
          </div>
        )}
      </div>

      {!showForm ? (
        <button
          className="btn btn-secondary sch-new-btn"
          onClick={() => setShowForm(true)}
        >
          {t("schedule.new", "+ New schedule")}
        </button>
      ) : (
        <form className="sch-form" onSubmit={handleCreate}>
          <div className="sch-form-row">
            <div className="form-group">
              <label>{t("schedule.nameLabel", "Name")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("schedule.namePlaceholder", "Daily market scan")}
                className="form-input"
                maxLength={120}
              />
            </div>
          </div>

          <div className="form-group">
            <label>{t("schedule.queryLabel", "Research query")}</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("schedule.queryPlaceholder", "Latest AI industry trends")}
              className="form-input"
              maxLength={500}
              required
            />
          </div>

          <div className="form-group">
            <label>{t("schedule.keywordsLabel", "Keywords (comma-separated, optional)")}</label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder={t("schedule.keywordsPlaceholder", "market trends, competitive landscape")}
              className="form-input"
            />
          </div>

          <div className="sch-form-row">
            <div className="form-group">
              <label>{t("schedule.frequencyLabel", "Frequency")}</label>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value as ScheduleInterval)}
                className="form-select"
              >
                <option value="hourly">{t("schedule.intervalHourly", "Hourly")}</option>
                <option value="daily">{t("schedule.intervalDaily", "Daily")}</option>
                <option value="weekly">{t("schedule.intervalWeekly", "Weekly")}</option>
                <option value="interval">{t("schedule.intervalCustom", "Custom (minutes)")}</option>
              </select>
            </div>

            {interval === "interval" && (
              <div className="form-group">
                <label>{t("schedule.intervalMinutesLabel", "Interval (minutes)")}</label>
                <input
                  type="number"
                  min={1}
                  max={10080}
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(parseInt(e.target.value) || 60)}
                  className="form-input"
                />
              </div>
            )}

            {(interval === "daily" || interval === "weekly") && (
              <div className="form-group">
                <label>{t("schedule.hourLabel", "Time (hour)")}</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hourOfDay}
                  onChange={(e) => setHourOfDay(parseInt(e.target.value) || 0)}
                  className="form-input"
                />
              </div>
            )}

            {interval === "weekly" && (
              <div className="form-group">
                <label>{t("schedule.dayOfWeekLabel", "Day of week")}</label>
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
                  className="form-select"
                >
                  <option value={0}>{t("schedule.daySun", "Sun")}</option>
                  <option value={1}>{t("schedule.dayMon", "Mon")}</option>
                  <option value={2}>{t("schedule.dayTue", "Tue")}</option>
                  <option value={3}>{t("schedule.dayWed", "Wed")}</option>
                  <option value={4}>{t("schedule.dayThu", "Thu")}</option>
                  <option value={5}>{t("schedule.dayFri", "Fri")}</option>
                  <option value={6}>{t("schedule.daySat", "Sat")}</option>
                </select>
              </div>
            )}
          </div>

          <div className="sch-form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={resetForm}
              disabled={loading}
            >
              {t("schedule.cancel", "Cancel")}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !query.trim()}
            >
              {loading ? t("schedule.creating", "Creating...") : t("schedule.create", "Create schedule")}
            </button>
          </div>
        </form>
      )}

      {/* Schedule list */}
      <div className="sch-list">
        {schedules.length === 0 ? (
          <div className="sch-empty">
            <p>{t("schedule.empty", "No scheduled research yet")}</p>
            <p className="sch-empty-hint">{t("schedule.emptyHint", "Create one and let research run automatically.")}</p>
          </div>
        ) : (
          schedules.map((s) => (
            <div key={s.id} className="sch-card">
              <div className="sch-card-header">
                <div className="sch-card-title-wrap">
                  <h3 className="sch-card-title">{s.name}</h3>
                  <span className={`sch-status ${statusClass(s.status)}`}>
                    {statusLabel(s.status)}
                  </span>
                </div>
                <p className="sch-card-query">{s.query}</p>
              </div>

              <div className="sch-card-meta">
                <div className="sch-meta-item">
                  <span className="sch-meta-label">{t("schedule.metaFrequency", "Frequency")}</span>
                  <span className="sch-meta-value">{formatInterval(s)}</span>
                </div>
                <div className="sch-meta-item">
                  <span className="sch-meta-label">{t("schedule.metaNextRun", "Next run")}</span>
                  <span className="sch-meta-value">{formatTime(s.nextRunAt)}</span>
                </div>
                <div className="sch-meta-item">
                  <span className="sch-meta-label">{t("schedule.metaLastRun", "Last run")}</span>
                  <span className="sch-meta-value">{formatTime(s.lastRunAt)}</span>
                </div>
                <div className="sch-meta-item">
                  <span className="sch-meta-label">{t("schedule.metaTotal", "Total")}</span>
                  <span className="sch-meta-value">
                    {s.totalRuns} {t("schedule.runsUnit", "runs")}
                    {s.successRuns > 0 && (
                      <span className="sch-success"> · {s.successRuns} {t("schedule.successSuffix", "succeeded")}</span>
                    )}
                    {s.failedRuns > 0 && (
                      <span className="sch-fail"> · {s.failedRuns} {t("schedule.failedSuffix", "failed")}</span>
                    )}
                  </span>
                </div>
              </div>

              <div className="sch-card-actions">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleTrigger(s.id)}
                  title={t("schedule.triggerTitle", "Run once immediately")}
                >
                  {t("schedule.trigger", "▶ Run now")}
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => handleToggle(s.id)}
                >
                  {s.status === "active" ? t("schedule.pause", "⏸ Pause") : t("schedule.resume", "▶ Resume")}
                </button>
                <button
                  className="btn btn-sm btn-danger-ghost"
                  onClick={() => handleDelete(s.id)}
                >
                  {t("schedule.delete", "Delete")}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      {confirmDialog}
    </div>
  );
}