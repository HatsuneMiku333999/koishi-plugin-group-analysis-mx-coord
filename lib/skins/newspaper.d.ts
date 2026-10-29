import { SkinRenderer } from './types';
import { GroupAnalysisResult, UserStats } from '../types';
/**
 * Newspaper skin renderer
 * Traditional Chinese Newspaper Style (Minguo/Vintage)
 */
export declare class NewspaperSkinRenderer implements SkinRenderer {
    readonly id = "newspaper";
    readonly name = "\u62A5\u7EB8\u98CE\u683C";
    readonly containerSelector = ".paper-container";
    formatUserStats(userStats: UserStats[]): string;
    formatGoldenQuotes(quotes: GroupAnalysisResult['goldenQuotes']): string;
    formatUserTitles(userTitles: GroupAnalysisResult['userTitles']): string;
    formatTopics(topics: GroupAnalysisResult['topics']): string;
    generateActiveHoursChart(activeHours: Record<number, number>): string;
    formatTags(tags: string[] | undefined): string;
    formatEvidence(items: string[] | '无' | undefined): string;
}
//# sourceMappingURL=newspaper.d.ts.map