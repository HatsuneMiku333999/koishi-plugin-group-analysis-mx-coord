import { SkinRenderer } from './types';
import { GroupAnalysisResult, UserStats } from '../types';
/**
 * Material Design 3 (MD3) skin renderer
 * This is the default skin with a clean, modern Material Design aesthetic
 */
export declare class Md3SkinRenderer implements SkinRenderer {
    readonly id = "md3";
    readonly name = "Material Design 3";
    readonly containerSelector = ".container";
    formatUserStats(userStats: UserStats[]): string;
    formatGoldenQuotes(quotes: GroupAnalysisResult['goldenQuotes']): string;
    formatUserTitles(userTitles: GroupAnalysisResult['userTitles']): string;
    formatTopics(topics: GroupAnalysisResult['topics']): string;
    generateActiveHoursChart(activeHours: Record<number, number>): string;
    formatTags(tags: string[] | undefined): string;
    formatEvidence(items: string[] | '无' | undefined): string;
}
//# sourceMappingURL=md3.d.ts.map