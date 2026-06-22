/**
 * scheduler.js
 * Automated scheduler for regenerating sitemap on schedule
 * Uses cron expressions for flexibility
 */

const config = require('./sitemap-config');
let cron = null;
try {
  cron = require('node-cron');
} catch (e) {
  console.warn('[sitemap-scheduler] node-cron not installed. Run: npm install node-cron');
}

class Scheduler {
  constructor() {
    this.task = null;
    this.isRunning = false;
    this.lastRun = null;
    this.nextRun = null;
    this.generateFunc = null;
  }

  /**
   * Initialize scheduler with the sitemap generation function
   */
  init(generateSitemapFunc) {
    if (!config.scheduler.enabled || !cron) {
      console.log('[sitemap-scheduler] Scheduler disabled or node-cron not available');
      return;
    }

    this.generateFunc = generateSitemapFunc;
    console.log(`[sitemap-scheduler] Initialized with cron: ${config.scheduler.cronExpression}`);

    // Auto-run on startup
    if (config.scheduler.autoRun) {
      console.log('[sitemap-scheduler] Running auto-generation on startup...');
      this._run();
    }

    // Schedule recurring task
    this._schedule();
  }

  /**
   * Schedule the cron task
   */
  _schedule() {
    if (!cron || !this.generateFunc) return;

    try {
      this.task = cron.schedule(config.scheduler.cronExpression, () => {
        console.log('[sitemap-scheduler] Running scheduled generation...');
        this._run();
      });

      console.log('[sitemap-scheduler] Cron task scheduled successfully');
    } catch (e) {
      console.error('[sitemap-scheduler] Failed to schedule task:', e.message);
    }
  }

  /**
   * Run generation
   */
  async _run() {
    if (!this.generateFunc) {
      console.error('[sitemap-scheduler] Generate function not set');
      return;
    }

    try {
      this.isRunning = true;
      this.lastRun = new Date();
      console.log(`[sitemap-scheduler] Starting generation at ${this.lastRun.toISOString()}`);

      const result = await this.generateFunc();

      console.log(`[sitemap-scheduler] Generation complete: ${result.urls.length} URLs in ${result.generationTime}ms`);
    } catch (e) {
      console.error('[sitemap-scheduler] Generation failed:', e.message);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.task) {
      this.task.stop();
      console.log('[sitemap-scheduler] Scheduler stopped');
    }
  }

  /**
   * Manually trigger immediate generation
   */
  async runNow() {
    if (this.isRunning) {
      console.warn('[sitemap-scheduler] Generation already in progress');
      return { status: 'already_running' };
    }

    await this._run();
    return { status: 'completed', lastRun: this.lastRun };
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      enabled: config.scheduler.enabled,
      cronExpression: config.scheduler.cronExpression,
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      isScheduled: this.task !== null
    };
  }
}

module.exports = new Scheduler();
