/**
 * Date utility functions.
 */
import { translate, type Locale, DEFAULT_LOCALE } from "@/lib/i18n/dictionaries";

/**
 * Format a timestamp as a relative time string (e.g. "2 hours ago").
 *
 * Localized: accepts an optional `locale` argument and routes unit copy
 * through the i18n dictionary (`date.*` keys). Falls back to the English
 * strings when the dictionary does not have a `date.*` entry for the
 * requested locale (the dictionary key-parity test guarantees every locale
 * has every key, so this is purely defensive).
 */
export function formatDistanceToNow(
  timestamp: number,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 0) return translate(locale, "date.inFuture", "in the future");

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return translate(locale, "date.justNow", "just now");
  if (minutes < 60) {
    return translate(
      locale,
      "date.minutesShort",
      minutes + " min ago",
      { n: minutes },
    );
  }
  if (hours < 24) {
    return translate(
      locale,
      "date.hoursShort",
      hours + " hr ago",
      { n: hours },
    );
  }
  if (days < 7) {
    return translate(
      locale,
      "date.daysShort",
      days + " days ago",
      { n: days },
    );
  }
  if (weeks < 5) {
    return translate(
      locale,
      "date.weeksShort",
      weeks + " wk ago",
      { n: weeks },
    );
  }
  if (months < 12) {
    return translate(
      locale,
      "date.monthsShort",
      months + " mo ago",
      { n: months },
    );
  }
  return translate(
    locale,
    "date.yearsShort",
    years + " yr ago",
    { n: years },
  );
}

/**
 * Format a date as a locale string.
 */
export function formatDate(timestamp: number, locale = "en-US"): string {
  return new Date(timestamp).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a datetime as a locale string.
 */
export function formatDateTime(timestamp: number, locale = "en-US"): string {
  return new Date(timestamp).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format duration in milliseconds to a human-readable string.
 *
 * Caps the result at hours+minutes to avoid unbounded output (e.g. a
 * stuck 99-day session would otherwise render as "142560m"). Anything
 * beyond 24 hours is rendered in hours, e.g. "25h" or "25h 5m".
 */
export function formatDuration(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return "0ms";
  if (ms < 1000) return Math.round(ms) + "ms";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return totalSeconds + "s";
  const totalMinutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  // Past 24h, switch to hours and stop showing leftover seconds to
  // keep the output bounded.
  if (totalMinutes >= 60 * 24) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) return hours + "h";
    return hours + "h " + minutes + "m";
  }
  if (secs === 0) return totalMinutes + "m";
  return totalMinutes + "m " + secs + "s";
}
