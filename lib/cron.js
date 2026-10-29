"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cron = cron;
const cron_parser_1 = require("cron-parser");
const MINUTE_MS = 60 * 1000;
function cron(ctx, pattern, callback, options = {}) {
    const expr = cron_parser_1.CronExpressionParser.parse(pattern);
    const logger = ctx.logger(options.name ?? 'cron');
    const cooldownMs = Math.max(0, options.cooldown ?? 0) * MINUTE_MS;
    const pollIntervalMs = Math.max(1, options.cooldown ?? 1) * MINUTE_MS;
    let disposed = false;
    let running = false;
    let disposeTimer;
    let lastTriggeredAt;
    let nextRunAt = getNextRunAt(expr);
    const schedule = () => {
        if (disposed)
            return;
        const delay = Math.max(0, Math.min(nextRunAt - Date.now(), pollIntervalMs));
        disposeTimer = ctx.setTimeout(async () => {
            disposeTimer = undefined;
            if (disposed)
                return;
            if (Date.now() >= nextRunAt) {
                await trigger();
                nextRunAt = getNextRunAt(expr);
            }
            schedule();
        }, delay);
    };
    schedule();
    return () => {
        disposed = true;
        disposeTimer?.();
    };
    async function trigger() {
        const now = Date.now();
        if (running)
            return;
        if (cooldownMs > 0 &&
            lastTriggeredAt !== undefined &&
            now - lastTriggeredAt < cooldownMs) {
            return;
        }
        lastTriggeredAt = now;
        running = true;
        try {
            await callback();
        }
        catch (error) {
            logger.warn(error);
        }
        finally {
            running = false;
        }
    }
}
function getNextRunAt(expr) {
    expr.reset(new Date());
    return expr.next().getTime();
}
//# sourceMappingURL=cron.js.map