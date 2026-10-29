import { Context } from 'koishi';
export declare function cron(ctx: Context, pattern: string, callback: () => void | Promise<void>, options?: CronOptions): () => void;
interface CronOptions {
    cooldown?: number;
    name?: string;
}
export {};
//# sourceMappingURL=cron.d.ts.map