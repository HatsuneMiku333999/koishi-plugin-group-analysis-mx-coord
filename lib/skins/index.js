"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScrapbookSkinRenderer = exports.ArtSkinRenderer = exports.NewspaperSkinRenderer = exports.AnimeSkinRenderer = exports.Md3SkinRenderer = exports.getAvatarUrl = exports.skinRegistry = void 0;
const md3_1 = require("./md3");
const anime_1 = require("./anime");
const newspaper_1 = require("./newspaper");
const art_1 = require("./art");
const scrapbook_1 = require("./scrapbook");
/**
 * Skin registry
 * Manages all available skin renderers
 */
class SkinRegistry {
    skins = new Map();
    constructor() {
        // Register built-in skins
        this.register(new md3_1.Md3SkinRenderer());
        this.register(new anime_1.AnimeSkinRenderer());
        this.register(new newspaper_1.NewspaperSkinRenderer());
        this.register(new art_1.ArtSkinRenderer());
        this.register(new scrapbook_1.ScrapbookSkinRenderer());
    }
    /**
     * Register a skin renderer
     * @param skin Skin renderer instance
     */
    register(skin) {
        this.skins.set(skin.id, skin);
    }
    /**
     * Get a skin renderer by ID
     * @param id Skin ID
     * @returns Skin renderer or undefined if not found
     */
    get(id) {
        return this.skins.get(id);
    }
    /**
     * Get a skin renderer by ID, falling back to default if not found
     * @param id Skin ID
     * @returns Skin renderer (never undefined, falls back to md3)
     */
    getSafe(id) {
        return this.skins.get(id) || this.skins.get('md3');
    }
    /**
     * Check if a skin exists
     * @param id Skin ID
     * @returns True if skin exists
     */
    has(id) {
        return this.skins.has(id);
    }
    /**
     * Get all registered skin IDs
     * @returns Array of skin IDs
     */
    getAllIds() {
        return Array.from(this.skins.keys());
    }
    /**
     * Get all registered skin renderers
     * @returns Array of skin renderers
     */
    getAll() {
        return Array.from(this.skins.values());
    }
}
// Export singleton instance
exports.skinRegistry = new SkinRegistry();
// Re-export types and individual skins
var types_1 = require("./types");
Object.defineProperty(exports, "getAvatarUrl", { enumerable: true, get: function () { return types_1.getAvatarUrl; } });
var md3_2 = require("./md3");
Object.defineProperty(exports, "Md3SkinRenderer", { enumerable: true, get: function () { return md3_2.Md3SkinRenderer; } });
var anime_2 = require("./anime");
Object.defineProperty(exports, "AnimeSkinRenderer", { enumerable: true, get: function () { return anime_2.AnimeSkinRenderer; } });
var newspaper_2 = require("./newspaper");
Object.defineProperty(exports, "NewspaperSkinRenderer", { enumerable: true, get: function () { return newspaper_2.NewspaperSkinRenderer; } });
var art_2 = require("./art");
Object.defineProperty(exports, "ArtSkinRenderer", { enumerable: true, get: function () { return art_2.ArtSkinRenderer; } });
var scrapbook_2 = require("./scrapbook");
Object.defineProperty(exports, "ScrapbookSkinRenderer", { enumerable: true, get: function () { return scrapbook_2.ScrapbookSkinRenderer; } });
//# sourceMappingURL=index.js.map