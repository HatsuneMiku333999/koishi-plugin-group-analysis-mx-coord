"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = apply;
const analysis_1 = require("./service/analysis");
const llm_1 = require("./service/llm");
const renderer_1 = require("./service/renderer");
const drawing_1 = require("./service/drawing");
const message_1 = require("./service/message");
const plugin_1 = require("./plugin");
const cron_1 = require("./cron");
__exportStar(require("./config"), exports);
__exportStar(require("./service/message"), exports);
function apply(ctx, config) {
    ctx.plugin(message_1.MessageService, config);
    ctx.plugin(llm_1.LLMService, config);
    ctx.plugin(analysis_1.AnalysisService, config);
    ctx.plugin(renderer_1.RendererService, config);
    ctx.plugin(drawing_1.DrawingService, config);
    ctx.inject([
        'group_analysis_message',
        'group_analysis_llm',
        'group_analysis_renderer',
        'group_analysis_drawing'
    ], (ctx) => {
        (0, plugin_1.plugin)(ctx, config);
    });
    ctx.inject(['group_analysis'], (ctx) => {
        ctx.effect(() => scheduleAutoAnalysis(ctx, config));
        ctx.effect(() => scheduleAutoComic(ctx, config));
    });
}
function scheduleAutoAnalysis(ctx, config) {
    if (!config.cronSchedule?.trim()) {
        return () => { };
    }
    return (0, cron_1.cron)(ctx, config.cronSchedule, () => ctx.group_analysis.executeAutoAnalysisForEnabledGroups(), {
        cooldown: config.autoAnalysisCooldown,
        name: 'group-analysis'
    });
}
function scheduleAutoComic(ctx, config) {
    if (!config.enableDailyComic || !config.comicSchedule?.trim()) {
        return () => { };
    }
    return (0, cron_1.cron)(ctx, config.comicSchedule, () => ctx.group_analysis.executeDailyComicForEnabledGroups(), {
        cooldown: 30,
        name: 'group-comic'
    });
}
//# sourceMappingURL=index.js.map