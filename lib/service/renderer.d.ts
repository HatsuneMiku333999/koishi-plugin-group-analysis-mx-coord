import { Context, Service } from 'koishi';
import { GroupAnalysisResult, UserPersonaProfile } from '../types';
import { Config } from '../config';
export declare class RendererService extends Service {
    config: Config;
    static inject: string[];
    templateDir: string;
    constructor(ctx: Context, config: Config);
    private getSkinPath;
    private imageToBase64;
    init(): Promise<void>;
    renderGroupAnalysisToPdf(data: GroupAnalysisResult): Promise<Buffer>;
    renderGroupAnalysis(data: GroupAnalysisResult, config: Config): Promise<Buffer | string>;
    private _renderGroupAnalysis;
    renderUserPersona(data: UserPersonaProfile, username: string, avatar: string, config: Config): Promise<Buffer | string>;
    private _renderUserPersona;
}
declare module 'koishi' {
    interface Context {
        group_analysis_renderer: RendererService;
    }
}
//# sourceMappingURL=renderer.d.ts.map