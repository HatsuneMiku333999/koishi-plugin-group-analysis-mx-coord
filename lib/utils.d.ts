import { Context } from 'koishi';
import { BasicStatsResult, GroupAnalysisResult, StoredMessage, UserPersonaProfile, UserStats } from './types';
import { Config } from './config';
import type { OneBotBot } from 'koishi-plugin-adapter-onebot';
export declare function calculateBasicStats(messages: StoredMessage[]): BasicStatsResult;
export declare function buildPersonaRecordId(platform: string, selfId: string, userId: string | number): string;
export declare function generateTextReport(result: GroupAnalysisResult): string;
export declare function getAvatarUrl(userId: number | string): string;
export declare function formatUserStats(userStats: UserStats[], skin?: string): string;
export declare function formatGoldenQuotes(quotes: GroupAnalysisResult['goldenQuotes'], skin?: string): string;
export declare function formatUserTitles(userTitles: GroupAnalysisResult['userTitles'], skin?: string): string;
export declare function formatTopics(topics: GroupAnalysisResult['topics'], skin?: string): string;
export declare function generateActiveHoursChart(activeHours: Record<number, number>, skin?: string): string;
export declare function renderTemplate(template: string, data: Record<string, string>): string;
export declare function shouldListenToMessage(session: {
    guildId?: string;
    channelId?: string;
    platform: string;
    selfId: string;
}, listenerGroups: {
    enabled: boolean;
    platform: string;
    selfId: string;
    channelId: string;
    guildId?: string;
}[], enableAllGroupsByDefault?: boolean): boolean;
export declare function inferPlatformInfo(filter: {
    guildId?: string;
    channelId?: string;
}, listenerGroups: Config['listenerGroups']): {
    platform?: string;
    guildId?: string;
    channelId?: string;
    selfId?: string;
};
export declare function getStartTimeByDays(days: number): Date;
export declare function normalizeArray(value: string[] | string | '无' | undefined): string[];
export declare function preferArray(primary?: string[] | null, fallback?: string[] | null): string[];
export declare function finalizePersonaList(list: string[]): string[] | '无';
export declare function normalizePersonaText(text: string | undefined): string;
export declare function formatMessagesForPersona(messages: StoredMessage[]): string;
export declare function formatPersonaForPrompt(persona?: UserPersonaProfile | null): string;
export declare function mergePersona(previous: UserPersonaProfile | null | undefined, current: UserPersonaProfile): UserPersonaProfile;
export declare function isCacheExpiredByDays(lastAnalysisAt: Date | undefined, ttlDays: number): boolean;
export declare function isCacheExpiredByMinutes(lastAnalysisAt: Date | undefined, ttlMinutes: number): boolean;
export declare function buildGroupAnalysisCacheKey(selfId: string, target: {
    guildId?: string;
    channelId?: string;
}, days: number): string;
export declare function buildMessagePersistenceKey(message: StoredMessage): string;
export declare function isNapCatBot(bot: OneBotBot<Context>): Promise<{
    isRunningNapCat: boolean;
    botAppName: string;
}>;
//# sourceMappingURL=utils.d.ts.map