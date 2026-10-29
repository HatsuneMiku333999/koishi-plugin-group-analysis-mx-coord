import { SkinRenderer } from './types';
/**
 * Skin registry
 * Manages all available skin renderers
 */
declare class SkinRegistry {
    private skins;
    constructor();
    /**
     * Register a skin renderer
     * @param skin Skin renderer instance
     */
    register(skin: SkinRenderer): void;
    /**
     * Get a skin renderer by ID
     * @param id Skin ID
     * @returns Skin renderer or undefined if not found
     */
    get(id: string): SkinRenderer | undefined;
    /**
     * Get a skin renderer by ID, falling back to default if not found
     * @param id Skin ID
     * @returns Skin renderer (never undefined, falls back to md3)
     */
    getSafe(id: string): SkinRenderer;
    /**
     * Check if a skin exists
     * @param id Skin ID
     * @returns True if skin exists
     */
    has(id: string): boolean;
    /**
     * Get all registered skin IDs
     * @returns Array of skin IDs
     */
    getAllIds(): string[];
    /**
     * Get all registered skin renderers
     * @returns Array of skin renderers
     */
    getAll(): SkinRenderer[];
}
export declare const skinRegistry: SkinRegistry;
export { SkinRenderer, getAvatarUrl } from './types';
export { Md3SkinRenderer } from './md3';
export { AnimeSkinRenderer } from './anime';
export { NewspaperSkinRenderer } from './newspaper';
export { ArtSkinRenderer } from './art';
export { ScrapbookSkinRenderer } from './scrapbook';
//# sourceMappingURL=index.d.ts.map