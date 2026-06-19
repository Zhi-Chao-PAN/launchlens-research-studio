"use client";
import { fetchWithCsrf, formatApiError } from "@/lib/api/csrf-client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/toast/ToastContext";

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

const formatInterval = (s: ResearchSchedule): string => {
  switch (s.interval) {
    case "hourly": return "每小时";
    case "daily": return `每天 ${String(s.hourOfDay ?? 9).padStart(2, "0")}:00`;
    case "weekly": {
      const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      return `${days[s.dayOfWeek ?? 1]} ${String(s.hourOfDay ?? 9).padStart(2, "0")}:00`;
    }
    case "interval": return `每 ${s.intervalMinutes ?? 60} 分钟`;
    default: return "未知";
  }
};

const formatTime = (ts?: number): string => {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

const statusLabel = (s: ScheduleStatus): string =>
  s === "active" ? "运行中" : "已暂停";

const statusClass = (s: ScheduleStatus): string =>
  s === "active" ? "sch-status-active" : "sch-status-paused";

export function ScheduleManager() {
  const { showToast } = useToast();
  const [schedules, setSchedules] = useState<ResearchSchedule[]>([]);
  const [stats, setStats] = useState<SchedulerStats | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setSchError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{open: boolean; title: string; message?: string; onConfirm: () => void} | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [keywords, setKeywords] = useState("");
  const [interval, setInterval] = useState<ScheduleInterval>("daily");
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [hourOfDay, setHourOfDay] = useState(9);
  const [dayOfWeek, setDayOfWeek] = useState(1);

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
          name: name.trim() || "未命名定时研究",
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
      const res = await fetchWithCsrf(`/api/research/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      // We need to send status. Let's do a proper PATCH with the toggle.
      // Actually let's fetch first, then toggle.
      // Simpler: use the toggle via status field.
      // Wait, I didn't build a toggle endpoint. Let me use PATCH with status toggle.
      // But we don't know current status from the UI state? We do - from schedules state.
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
    setConfirm({ open: true, title: "Delete scheduled research?", message: "This schedule will stop running permanently.", onConfirm: () => handleDeleteConfirm(id) });
  };
  const handleDeleteConfirm = async (id: string) => {
    setConfirm({ open: true, title: "Delete scheduled research?", message: "This schedule will stop running permanently.", onConfirm: () => handleDeleteConfirm(id) });
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
          <h2 className="sch-title">定时研究</h2>
          <p className="sch-subtitle">设置周期性自动研究，持续跟踪变化</p>
        </div>
        {stats && (
          <div className="sch-stats">
            <span className="sch-stat">
              <strong>{stats.total}</strong> 总计
            </span>
            <span className="sch-stat sch-stat-active">
              <strong>{stats.active}</strong> 运行中
            </span>
            <span className="sch-stat sch-stat-paused">
              <strong>{stats.paused}</strong> 已暂停
            </span>
            <span className="sch-stat sch-stat-runs">
              <strong>{stats.totalRuns}</strong> 累计运行
            </span>
          </div>
        )}
      </div>

      {!showForm ? (
        <button
          className="btn btn-secondary sch-new-btn"
          onClick={() => setShowForm(true)}
        >
          + 新建定时研究
        </button>
      ) : (
        <form className="sch-form" onSubmit={handleCreate}>
          <div className="sch-form-row">
            <div className="form-group">
              <label>名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="每日市场扫描"
                className="form-input"
                maxLength={120}
              />
            </div>
          </div>

          <div className="form-group">
            <label>研究问题</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="AI 行业最新动态"
              className="form-input"
              maxLength={500}
              required
            />
          </div>

          <div className="form-group">
            <label>关键词（逗号分隔，可选）</label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="市场趋势, 竞争格局"
              className="form-input"
            />
          </div>

          <div className="sch-form-row">
            <div className="form-group">
              <label>频率</label>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value as ScheduleInterval)}
                className="form-select"
              >
                <option value="hourly">每小时</option>
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="interval">自定义（分钟）</option>
              </select>
            </div>

            {interval === "interval" && (
              <div className="form-group">
                <label>间隔（分钟）</label>
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
                <label>时间（时）</label>
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
                <label>星期</label>
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
                  className="form-select"
                >
                  <option value={0}>周日</option>
                  <option value={1}>周一</option>
                  <option value={2}>周二</option>
                  <option value={3}>周三</option>
                  <option value={4}>周四</option>
                  <option value={5}>周五</option>
                  <option value={6}>周六</option>
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
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !query.trim()}
            >
              {loading ? "创建中..." : "创建定时研究"}
            </button>
          </div>
        </form>
      )}

      {/* Schedule list */}
      <div className="sch-list">
        {schedules.length === 0 ? (
          <div className="sch-empty">
            <p>还没有定时研究</p>
            <p className="sch-empty-hint">创建一个，让研究自动跑起来</p>
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
                  <span className="sch-meta-label">频率</span>
                  <span className="sch-meta-value">{formatInterval(s)}</span>
                </div>
                <div className="sch-meta-item">
                  <span className="sch-meta-label">下次运行</span>
                  <span className="sch-meta-value">{formatTime(s.nextRunAt)}</span>
                </div>
                <div className="sch-meta-item">
                  <span className="sch-meta-label">上次运行</span>
                  <span className="sch-meta-value">{formatTime(s.lastRunAt)}</span>
                </div>
                <div className="sch-meta-item">
                  <span className="sch-meta-label">累计</span>
                  <span className="sch-meta-value">
                    {s.totalRuns} 次
                    {s.successRuns > 0 && (
                      <span className="sch-success"> · {s.successRuns}成功</span>
                    )}
                    {s.failedRuns > 0 && (
                      <span className="sch-fail"> · {s.failedRuns}失败</span>
                    )}
                  </span>
                </div>
              </div>

              <div className="sch-card-actions">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleTrigger(s.id)}
                  title="立即运行一次"
                >
                  ▶ 立即运行
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => handleToggle(s.id)}
                >
                  {s.status === "active" ? "⏸ 暂停" : "▶ 启用"}
                </button>
                <button
                  className="btn btn-sm btn-danger-ghost"
                  onClick={() => handleDelete(s.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}