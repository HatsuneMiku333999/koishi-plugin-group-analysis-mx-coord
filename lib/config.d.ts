import { Schema } from 'koishi';
export interface GroupListener {
    selfId: string;
    channelId: string;
    platform: string;
    guildId?: string;
    reportChannelId?: string;
    enabled: boolean;
}
export interface Config {
    enableAllGroupsByDefault: boolean;
    listenerGroups: GroupListener[];
    wordsFilter: string[];
    userFilter: string[];
    personaUserFilter: string[];
    openaiEndpoint: string;
    openaiApiKey: string;
    openaiModel: string;
    alwaysPersistMessages: boolean;
    retentionDays: number;
    promptTopic: string;
    promptUserTitles: string;
    promptGoldenQuotes: string;
    promptUserPersona: string;
    promptQueryParser: string;
    promptQueryChat: string;
    outputFormat: 'image' | 'pdf' | 'text';
    maxMessages: number;
    temperature: number;
    minMessages: number;
    maxTopics: number;
    maxUserTitles: number;
    maxGoldenQuotes: number;
    maxUsersInReport: number;
    userTitleAnalysis: boolean;
    groupAnalysisCacheMinutes: number;
    cronSchedule: string;
    autoAnalysisCooldown: number;
    cronAnalysisDays: number;
    cronAnalysisHours: number;
    cronAnalysisMinutes: number;
    personaAnalysisMessageInterval: number;
    personaCacheLifetimeDays: number;
    personaLookbackDays: number;
    personaMaxMessages: number;
    personaMinMessages: number;
    personaViewAuthority: number;
    personaWhitelist: string[];
    personaBlacklist: string[];
    personaOnlyCurrentGroup: boolean;
    customPromptEnabled: boolean;
    customPrompt: string;
    customPromptDays: number;
    customPromptHours: number;
    customPromptMinutes: number;
    theme: 'light' | 'dark' | 'auto';
    skin: string;
    debug?: boolean;
}
export declare const Config: Schema<Config>;
export declare const name = "group-analysis";
export declare const inject: {
    required: string[];
};
//# sourceMappingURL=config.d.ts.map
