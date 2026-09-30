import { db } from "./client";

export type SyncTrigger = "schedule" | "manual";
export type SyncStatus = "running" | "succeeded" | "failed";

export interface SyncRun {
  id: number;
  triggeredBy: SyncTrigger;
  status: SyncStatus;
  startedAt: string;
  finishedAt: string | null;
  itemsSeen: number;
  itemsUpdated: number;
  itemsFailed: number;
  error: string | null;
}

export interface SyncCounts {
  seen: number;
  updated: number;
  failed: number;
}

interface SyncRunRow {
  id: number;
  triggered_by: SyncTrigger;
  status: SyncStatus;
  started_at: string;
  finished_at: string | null;
  items_seen: number;
  items_updated: number;
  items_failed: number;
  error: string | null;
}

function toSyncRun(row: SyncRunRow): SyncRun {
  return {
    id: row.id,
    triggeredBy: row.triggered_by,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    itemsSeen: row.items_seen,
    itemsUpdated: row.items_updated,
    itemsFailed: row.items_failed,
    error: row.error,
  };
}

export function findById(id: number): SyncRun | undefined {
  const row = db.prepare("SELECT * FROM sync_runs WHERE id = ?").get(id) as SyncRunRow | undefined;
  return row ? toSyncRun(row) : undefined;
}

export function latest(): SyncRun | undefined {
  const row = db
    .prepare("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1")
    .get() as SyncRunRow | undefined;
  return row ? toSyncRun(row) : undefined;
}

export function listRecent(limit: number): SyncRun[] {
  const rows = db
    .prepare("SELECT * FROM sync_runs ORDER BY id DESC LIMIT ?")
    .all(limit) as SyncRunRow[];
  return rows.map(toSyncRun);
}

export function start(triggeredBy: SyncTrigger): SyncRun {
  const info = db.prepare("INSERT INTO sync_runs (triggered_by) VALUES (?)").run(triggeredBy);
  const created = findById(Number(info.lastInsertRowid));
  if (!created) {
    throw new Error(`sync run ${info.lastInsertRowid} missing right after insert`);
  }
  return created;
}

export function finish(id: number, counts: SyncCounts): void {
  db.prepare(
    `UPDATE sync_runs
     SET status = 'succeeded', finished_at = datetime('now'),
         items_seen = @seen, items_updated = @updated, items_failed = @failed
     WHERE id = @id`,
  ).run({ id, ...counts });
}

export function fail(id: number, error: string, counts: SyncCounts): void {
  db.prepare(
    `UPDATE sync_runs
     SET status = 'failed', finished_at = datetime('now'), error = @error,
         items_seen = @seen, items_updated = @updated, items_failed = @failed
     WHERE id = @id`,
  ).run({ id, error: error.slice(0, 1000), ...counts });
}
