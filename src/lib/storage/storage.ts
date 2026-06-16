// Pluggable key-value storage layer for runtime state that benefits from
// surviving a restart. Default backend is in-memory; an optional file
// backend (JSONL) is selected when LAUNCHLENS_STORAGE_DIR is set.

import fs from "node:fs";
import path from "node:path";

export interface StorageBackend {
  readonly id: string;
  read<T = unknown>(key: string): T | null;
  write<T = unknown>(key: string, value: T): void;
  list(prefix?: string): string[];
  remove(key: string): void;
}

class MemoryBackend implements StorageBackend {
  readonly id = "memory";
  private store = new Map<string, unknown>();
  read<T = unknown>(key: string): T | null {
    return (this.store.has(key) ? (this.store.get(key) as T) : null);
  }
  write<T = unknown>(key: string, value: T): void {
    this.store.set(key, value);
  }
  list(prefix?: string): string[] {
    const keys = Array.from(this.store.keys());
    return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
  }
  remove(key: string): void {
    this.store.delete(key);
  }
}

class FileBackend implements StorageBackend {
  readonly id: string;
  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.id = "file:" + dir;
  }
  private filePath(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
    return path.join(this.dir, safe + ".json");
  }
  read<T = unknown>(key: string): T | null {
    try {
      const raw = fs.readFileSync(this.filePath(key), "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  write<T = unknown>(key: string, value: T): void {
    const tmp = this.filePath(key) + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, this.filePath(key));
  }
  list(prefix?: string): string[] {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(this.dir);
    } catch {
      return [];
    }
    const keys = entries
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length));
    return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
  }
  remove(key: string): void {
    try {
      fs.unlinkSync(this.filePath(key));
    } catch {
      // ignore
    }
  }
}

let backend: StorageBackend | null = null;

export function getBackend(env: NodeJS.ProcessEnv = process.env): StorageBackend {
  if (backend) return backend;
  const dir = env.LAUNCHLENS_STORAGE_DIR;
  backend = dir ? new FileBackend(dir) : new MemoryBackend();
  return backend;
}

export function setBackendForTests(b: StorageBackend | null): void {
  backend = b;
}

// Convenience: load JSON value or return default.
export function loadOrDefault<T>(key: string, fallback: T): T {
  const v = getBackend().read<T>(key);
  return v === null ? fallback : v;
}
