/**
 * Date utility functions.
 */

/**
 * Format a timestamp as a relative time string (e.g. "2 hours ago").
 */
export function formatDistanceToNow(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 0) return "�ո�";
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return "�ո�";
  if (minutes < 60) return minutes + " ����ǰ";
  if (hours < 24) return hours + " Сʱǰ";
  if (days < 7) return days + " ��ǰ";
  if (weeks < 5) return weeks + " ��ǰ";
  if (months < 12) return months + " ����ǰ";
  return years + " ��ǰ";
}

/**
 * Format a date as a locale string.
 */
export function formatDate(timestamp: number, locale = "zh-CN"): string {
  return new Date(timestamp).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a datetime as a locale string.
 */
export function formatDateTime(timestamp: number, locale = "zh-CN"): string {
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