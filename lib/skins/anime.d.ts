import { SkinRenderer } from './types';
import { GroupAnalysisResult, UserStats } from '../types';
/**
 * Anime skin renderer (Updated to Nahida/Sumeru Style 3.0)
 * Cute, 2D-first, Sticker/Card aesthetics.
 */
export declare class AnimeSkinRenderer implements SkinRenderer {
    readonly id = "anime";
    readonly name = "\u4E8C\u6B21\u5143\u98CE\u683C";
    readonly containerSelector = ".nahida-container";
    formatUserStats(userStats: UserStats[]): string;
    formatGoldenQuotes(quotes: GroupAnalysisResult['goldenQuotes']): string;
    formatUserTitles(userTitles: GroupAnalysisResult['userTitles']): string;
    formatTopics(topics: GroupAnalysisResult['topics']): string;
    generateActiveHoursChart(activeHours: Record<number, number>): string;
    formatTags(tags: string[] | undefined): string;
    formatEvidence(items: string[] | '无' | undefined): string;
}
//# sourceMappingURL=anime.d.ts.map