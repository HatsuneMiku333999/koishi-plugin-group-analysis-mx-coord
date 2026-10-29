import { Context, Service, Session } from 'koishi';
import { AnalysisPromptContext, GroupAnalysisResult, PersonaRecord, StoredMessage, UserPersonaProfile } from '../types';
import { Config } from '..';
type AnalysisTarget = {
    guildId?: string;
    channelId?: string;
};
export declare class AnalysisService extends Service {
    config: Config;
    static readonly inject: string[];
    private personaCache;
    private personaProcessing;
    private groupAnalysisCache;
    constructor(ctx: Context, config: Config);
    private setupPersonaDatabase;
    private setupPersonaMessageListener;
    private handleIncomingMessageForPersona;
    private ensurePersonaCache;
    private runPersonaAnalysis;
    private collectUserMessagesForPersona;
    private attachEvidenceMessageIds;
    private persistPersona;
    private _getGroupHistoryFromMessageService;
    private _getGroupHistoryFromMessageServiceByTimeRange;
    private resolveGroupName;
    private normalizeQueryAction;
    private resolveQueryTimeRange;
    executeGroupAnalysis(selfId: string, target: AnalysisTarget, days: number, outputFormat?: 'image' | 'pdf' | 'text', force?: boolean, replySession?: Session, deliveryTarget?: AnalysisTarget, hours?: number, minutes?: number): Promise<void>;
    executeGroupQuery(session: Session, target: AnalysisTarget, query: string, outputFormat?: 'image' | 'pdf' | 'text'): Promise<void>;
    executeCustomAnalysis(session: Session, target: AnalysisTarget, prompt: string, days: number, hours?: number, minutes?: number): Promise<void>;
    executeAutoAnalysisForEnabledGroups(): Promise<void>;
    getUserPersona(platform: string, selfId: string, userId: string): Promise<{
        profile: UserPersonaProfile;
        username: string;
    } | null>;
    executeUserPersonaAnalysis(session: Session, userId: string, force?: boolean): Promise<void>;
    analyzeGroupMessages(messages: StoredMessage[], selfId: string, target: AnalysisTarget, context?: AnalysisPromptContext): Promise<GroupAnalysisResult>;
    private _getBot;
}
declare module 'koishi' {
    interface Context {
        group_analysis: AnalysisService;
    }
    interface Tables {
        group_analysis_user_personas: PersonaRecord;
    }
}
export {};
//# sourceMappingURL=analysis.d.ts.map
