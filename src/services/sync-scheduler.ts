import { logger } from "../lib/logger";
import type { InventorySyncService } from "./inventory-sync";

/**
 * Runs the inventory sync on a fixed interval. The timer is unref'd so it never
 * keeps the process alive on its own, and ticks are skipped (not queued) while
 * a previous sync is still in flight.
 */
export class SyncScheduler {
  private timer: NodeJS.Timeout | undefined;
  private lastTickAt: Date | undefined;
  private readonly log = logger.child({ component: "sync-scheduler" });

  constructor(
    private readonly sync: InventorySyncService,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      this.tick();
    }, this.intervalMs);
    this.timer.unref();
    this.log.info("scheduler started", { intervalMs: this.intervalMs });
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
    this.log.info("scheduler stopped");
  }

  isStarted(): boolean {
    return this.timer !== undefined;
  }

  getLastTickAt(): Date | undefined {
    return this.lastTickAt;
  }

  private async tick(): Promise<void> {
    if (this.sync.isRunning()) {
      this.log.warn("previous sync still in progress, skipping this tick");
      return;
    }
    try {
      const summary = await this.sync.run("schedule");
      this.log.info("scheduled sync finished", { ...summary });
    } finally {
      this.lastTickAt = new Date();
    }
  }
}
