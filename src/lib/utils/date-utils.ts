/**
 * Date utility functions.
 */

/**
 * Format a timestamp as a relative time string (e.g. "2 hours ago").
 */
export function formatDistanceToNow(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 0) return "in the future";

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return "just now";
  if (minutes < 60) return minutes + " min ago";
  if (hours < 24) return hours + " hr ago";
  if (days < 7) return days + " days ago";
  if (weeks < 5) return weeks + " wk ago";
  if (months < 12) return months + " mo ago";
  return years + " yr ago";
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
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return ms + "ms";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return seconds + "s";
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) return minutes + "m";
  return minutes + "m " + secs + "s";
}
