"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrawingService = void 0;
const koishi_1 = require("koishi");
class DrawingService extends koishi_1.Service {
    config;
    constructor(ctx, config) {
        super(ctx, 'group_analysis_drawing', true);
        this.config = config;
    }
    /**
     * 调用 OpenAI 兼容的图片生成 API（/images/generations）生成一张图片。
     * @param prompt 生图提示词
     * @returns 图片字节（PNG/JPEG）；失败时抛出异常
     */
    async generateImage(prompt) {
        const endpoint = (this.config.drawingEndpoint || '').replace(/\/$/, '');
        if (!endpoint || !this.config.drawingApiKey) {
            throw new Error('未配置生图 API（drawingEndpoint / drawingApiKey）。请在插件配置中填写。');
        }
        const url = `${endpoint}/images/generations`;
        this.ctx.logger.info('正在调用生图 API 生成漫画...');
        let response;
        try {
            response = await this.ctx.http.post(url, {
                model: this.config.drawingModel || 'gpt-image-1',
                prompt,
                n: 1,
                size: this.config.drawingSize || '1024x1024'
            }, {
                headers: {
                    'Authorization': `Bearer ${this.config.drawingApiKey}`,
                    'Content-Type': 'application/json'
                }
            });
        }
        catch (error) {
            this.ctx.logger.error('生图 API 调用失败:', error);
            throw new Error(`生图 API 调用失败: ${error instanceof Error ? error.message : error}`);
        }
        const item = response?.data?.[0];
        if (!item) {
            this.ctx.logger.error(`生图 API 返回空响应: ${JSON.stringify(response)}`);
            throw new Error('生图 API 返回空响应。');
        }
        if (item.b64_json) {
            this.ctx.logger.info('生图 API 返回 base64 图片。');
            return Buffer.from(item.b64_json, 'base64');
        }
        if (item.url) {
            this.ctx.logger.info(`生图 API 返回图片 URL，开始下载: ${item.url}`);
            const imageResponse = await fetch(item.url);
            if (!imageResponse.ok) {
                throw new Error(`下载生图结果失败: ${imageResponse.status} ${imageResponse.statusText}`);
            }
            const arrayBuffer = await imageResponse.arrayBuffer();
            return Buffer.from(arrayBuffer);
        }
        throw new Error('生图 API 响应中既无 b64_json 也无 url。');
    }
}
exports.DrawingService = DrawingService;
