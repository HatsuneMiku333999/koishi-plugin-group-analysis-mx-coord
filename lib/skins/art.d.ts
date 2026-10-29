import { SkinRenderer } from './types';
import { GroupAnalysisResult, UserStats } from '../types';
/**
 * Art Style Skin Renderer
 * A minimal, high-end, artistic line style skin
 */
export declare class ArtSkinRenderer implements SkinRenderer {
    readonly id = "art";
    readonly name = "Art Style";
    readonly containerSelector = ".container";
    formatUserStats(userStats: UserStats[]): string;
    formatGoldenQuotes(quotes: GroupAnalysisResult['goldenQuotes']): string;
    formatUserTitles(userTitles: GroupAnalysisResult['userTitles']): string;
    formatTopics(topics: GroupAnalysisResult['topics']): string;
    generateActiveHoursChart(activeHours: Record<number, number>): string;
    formatTags(tags: string[] | undefined): string;
    formatEvidence(items: string[] | '无' | undefined): string;
}
//# sourceMappingURL=art.d.ts.map