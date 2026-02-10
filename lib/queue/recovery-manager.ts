// lib/queue/recovery-manager.ts
// Orphaned job detection and recovery orchestration
import { findOrphanedGenerations, resetGenerationToPending } from '@/lib/db/job-queries';

/**
 * Configuration for the recovery manager
 */
export interface RecoveryConfig {
  /** How long a job can be in 'processing' before considered orphaned (default 15 minutes) */
  timeoutMinutes: number;
  /** How often to run the recovery check (default 60000ms = 1 minute) */
  checkIntervalMs: number;
}

/**
 * Default recovery configuration
 */
const DEFAULT_CONFIG: RecoveryConfig = {
  timeoutMinutes: 15,
  checkIntervalMs: 60000,
};

/**
 * Recovery manager for detecting and recovering orphaned jobs
 *
 * Jobs can get stuck in 'processing' state if:
 * - The process crashes mid-generation
 * - Network connection is lost to kie.ai
 * - kie.ai never responds (timeout beyond retry limits)
 *
 * This manager periodically scans for jobs stuck too long and resets
 * them to 'pending' so they can be retried.
 *
 * Usage:
 * ```ts
 * const manager = getRecoveryManager();
 * manager.start();  // Start periodic recovery checks
 * // ... later
 * manager.stop();   // Stop recovery checks
 * ```
 */
export class RecoveryManager {
  private config: RecoveryConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(config?: Partial<RecoveryConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Run a single recovery check - find and reset orphaned generations
   * @returns Number of generations recovered
   */
  async runRecoveryCheck(): Promise<number> {
    const orphaned = await findOrphanedGenerations(this.config.timeoutMinutes);

    if (orphaned.length === 0) {
      return 0;
    }

    let recoveredCount = 0;

    for (const generation of orphaned) {
      const success = await resetGenerationToPending(generation.id);

      if (success) {
        recoveredCount++;
      }
    }

    return recoveredCount;
  }

  /**
   * Start the recovery manager - runs initial check and schedules periodic checks
   */
  start(): void {
    if (this.isRunning) {
      console.warn('[Recovery] Recovery manager already running');
      return;
    }

    this.isRunning = true;

    // Run initial check immediately (don't await to avoid blocking)
    this.runRecoveryCheck().catch((err) => {
      console.error('[Recovery] Initial check failed:', err);
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.runRecoveryCheck().catch((err) => {
        console.error('[Recovery] Periodic check failed:', err);
      });
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop the recovery manager - clears the interval timer
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
  }

  /**
   * Check if the recovery manager is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get current configuration
   */
  getConfig(): RecoveryConfig {
    return { ...this.config };
  }
}

// Singleton instance
let instance: RecoveryManager | null = null;

/**
 * Get the singleton recovery manager instance
 * Creates a new instance if one doesn't exist
 */
export function getRecoveryManager(): RecoveryManager {
  if (!instance) {
    instance = new RecoveryManager();
  }
  return instance;
}
