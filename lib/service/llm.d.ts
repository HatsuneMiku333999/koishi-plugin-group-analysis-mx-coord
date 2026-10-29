import { Context, Service } from 'koishi';
import { Config } from '../config';
import { AnalysisPromptContext, GoldenQuote, QueryIntent, SummaryTopic, UserPersonaProfile, UserStats, UserTitle } from '../types';
export declare class LLMService extends Service {
    config: Config;
    constructor(ctx: Context, config: Config);
    private _callOpenAI;
    private _callLLM;
    private _callText;
    private formatTimeRange;
    private fillAnalysisPrompt;
    summarizeTopics(messagesText: string, context?: AnalysisPromptContext): Promise<SummaryTopic[]>;
    analyzeUserTitles(users: UserStats[], context?: AnalysisPromptContext): Promise<UserTitle[]>;
    analyzeGoldenQuotes(messagesText: string, maxQuotes: number, context?: AnalysisPromptContext): Promise<GoldenQuote[]>;
    analyzeUserPersona(userId: string, username: string, roles: string[], recentMessages: string, previousAnalysis?: string): Promise<UserPersonaProfile | null>;
    parseGroupQuery(promptContext: {
        query: string;
        currentTime: string;
        timeZone: string;
        platform: string;
        groupName: string;
        guildId?: string;
        channelId?: string;
        currentUserId?: string;
        currentUserName?: string;
    }): Promise<QueryIntent | null>;
    replyGroupQuery(promptContext: {
        query: string;
        analysisResult: string;
        currentTime: string;
        groupName: string;
        guildId?: string;
        channelId?: string;
        currentUserId?: string;
        currentUserName?: string;
    }): Promise<string | null>;
    runCustomAnalysis(userPrompt: string, messagesText: string): Promise<string>;
}
declare module 'koishi' {
    interface Context {
        group_analysis_llm: LLMService;
    }
}
//# sourceMappingURL=llm.d.ts.map
