import { SkinRenderer } from './types';
import { GroupAnalysisResult, UserStats } from '../types';
/**
 * Scrapbook Skin Renderer
 * Ported from AstrBot's scrapbook template.
 * Features a hand-drawn, colorful, and playful aesthetic.
 */
export declare class ScrapbookSkinRenderer implements SkinRenderer {
    readonly id = "scrapbook";
    readonly name = "Scrapbook";
    readonly containerSelector = ".container";
    formatUserStats(userStats: UserStats[]): string;
    formatGoldenQuotes(quotes: GroupAnalysisResult['goldenQuotes']): string;
    formatUserTitles(userTitles: GroupAnalysisResult['userTitles']): string;
    formatTopics(topics: GroupAnalysisResult['topics']): string;
    formatTags(tags: string[]): string;
    formatEvidence(evidence: string[]): string;
    generateActiveHoursChart(activeHours: Record<number, number>): string;
}
//# sourceMappingURL=scrapbook.d.ts.map