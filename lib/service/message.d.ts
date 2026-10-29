import { Context, Service, Session } from 'koishi';
import { Config } from '../config';
import { MessageFilter, StoredMessage } from '../types';
export declare class MessageService extends Service {
    config: Config;
    private messageCache;
    private readonly cacheSize;
    private readonly cacheExpiration;
    private messageHandlers;
    private activityStats;
    private persistenceBuffers;
    private readonly activityWindowMs;
    private readonly highActivityThreshold;
    private readonly bufferFlushSize;
    private readonly bufferIdleFlushMs;
    private readonly bufferSweepIntervalMs;
    constructor(ctx: Context, config: Config);
    onUserMessage(handler: (session: Session) => void | Promise<void>): void;
    private setupDatabase;
    private setupMessageListener;
    private shouldListenToMessage;
    private handleMessage;
    private addToCache;
    private setupCacheCleanup;
    private setupPersistenceTasks;
    private getBotAPIHistoricalMessages;
    getHistoricalMessages(filter: MessageFilter): Promise<StoredMessage[]>;
    private getOneBotHistoricalMessages;
    private getDatabaseHistoricalMessages;
    private getActivityStats;
    private persistIncomingMessage;
    private enqueueMessageForPersistence;
    private flushPendingBuffer;
    private flushIdleBuffers;
    private flushAllBuffers;
    private persistMessages;
    getRecentMessages(guildId?: string, channelId?: string, limit?: number): StoredMessage[];
    getMessageStats(filter: MessageFilter): Promise<{
        totalCount: number;
        userCount: number;
        timeRange: {
            start: Date;
            end: Date;
        } | null;
    }>;
}
declare module 'koishi' {
    interface Context {
        group_analysis_message: MessageService;
    }
    interface Tables {
        group_analysis_messages: StoredMessage;
    }
}
//# sourceMappingURL=message.d.ts.map