"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RendererService = void 0;
const koishi_1 = require("koishi");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const nunjucks = require("nunjucks");
const utils_1 = require("../utils");
const skins_1 = require("../skins");
/** 来自原项目 astrbot_plugin_qq_group_daily_analysis 的皮肤（Jinja2 模板，用 nunjucks 渲染） */
const ORIGINAL_SKINS = ['atri', 'bluearchive', 'format', 'hack', 'hatsunemiku', 'retrofuturism', 'simple', 'springfestival'];
/**
 * Noto Color Emoji 字体分片的 unicode-range（与 resources/fonts/00.woff2..09.woff2 顺序对应）。
 * 让 Puppeteer 在 Docker/Alpine 等缺 emoji 字体的环境也能渲染彩色 emoji。
 */
const EMOJI_RANGES = [
    'U+1f1e6-1f1ff',
    'U+200d, U+2620, U+26a7, U+fe0f, U+1f308, U+1f38c, U+1f3c1, U+1f3f3-1f3f4, U+1f6a9, U+e0062-e0063, U+e0065, U+e0067, U+e006c, U+e006e, U+e0073-e0074, U+e0077, U+e007f',
    'U+23, U+2a, U+30-39, U+a9, U+ae, U+200d, U+203c, U+2049, U+20e3, U+2122, U+2139, U+2194-2199, U+21a9-21aa, U+23cf, U+23e9-23ef, U+23f8-23fa, U+24c2, U+25aa-25ab, U+25b6, U+25c0, U+25fb-25fe, U+2611, U+2622-2623, U+2626, U+262a, U+262e-262f, U+2638, U+2640, U+2642, U+2648-2653, U+2660, U+2663, U+2665-2666, U+2668, U+267b, U+267e-267f, U+2695, U+269b-269c, U+26a0, U+26a7, U+26aa-26ab, U+26ce, U+26d4, U+2705, U+2714, U+2716, U+271d, U+2721, U+2733-2734, U+2747, U+274c, U+274e, U+2753-2755, U+2757, U+2764, U+2795-2797, U+27a1, U+27b0, U+27bf, U+2934-2935, U+2b05-2b07, U+2b1b-2b1c, U+2b55, U+3030, U+303d, U+3297, U+3299, U+fe0f, U+1f170-1f171, U+1f17e-1f17f, U+1f18e, U+1f191-1f19a, U+1f201-1f202, U+1f21a, U+1f22f, U+1f232-1f23a, U+1f250-1f251, U+1f310, U+1f3a6, U+1f3b5-1f3b6, U+1f3bc, U+1f3e7, U+1f441, U+1f499-1f49c, U+1f49f-1f4a0, U+1f4ac-1f4ad, U+1f4b1-1f4b2, U+1f4b9, U+1f4db, U+1f4f2-1f4f6, U+1f500-1f507, U+1f515, U+1f518-1f524, U+1f52f-1f53d, U+1f549, U+1f54e, U+1f5a4, U+1f5e8, U+1f5ef, U+1f6ab, U+1f6ad-1f6b1, U+1f6b3, U+1f6b7-1f6bc, U+1f6be, U+1f6c2-1f6c5, U+1f6d0-1f6d1, U+1f6d7, U+1f6dc, U+1f7e0-1f7eb, U+1f7f0, U+1f90d-1f90e, U+1f9d1-1f9d2, U+1f9e1, U+1fa75-1fa77, U+1faaf',
    'U+200d, U+231a-231b, U+2328, U+23f0-23f3, U+2602, U+260e, U+2692, U+2694, U+2696-2697, U+2699, U+26b0-26b1, U+26cf, U+26d1, U+26d3, U+2702, U+2709, U+270f, U+2712, U+fe0f, U+1f302, U+1f321, U+1f392-1f393, U+1f3a9, U+1f3bd, U+1f3ee, U+1f3f7, U+1f3fa, U+1f451-1f462, U+1f484, U+1f489-1f48a, U+1f48c-1f48e, U+1f4a1, U+1f4a3, U+1f4a5, U+1f4b0, U+1f4b3-1f4b8, U+1f4bb-1f4da, U+1f4dc-1f4f1, U+1f4ff, U+1f508-1f514, U+1f516-1f517, U+1f526-1f529, U+1f52c-1f52e, U+1f550-1f567, U+1f56f-1f570, U+1f576, U+1f587, U+1f58a-1f58d, U+1f5a5, U+1f5a8, U+1f5b1-1f5b2, U+1f5c2-1f5c4, U+1f5d1-1f5d3, U+1f5dc-1f5de, U+1f5e1, U+1f5f3, U+1f6aa, U+1f6ac, U+1f6bd, U+1f6bf, U+1f6c1, U+1f6cb, U+1f6cd-1f6cf, U+1f6d2, U+1f6e0-1f6e1, U+1f6f0, U+1f97b-1f97f, U+1f9af, U+1f9ba, U+1f9e2-1f9e6, U+1f9ea-1f9ec, U+1f9ee-1f9f4, U+1f9f7-1f9ff, U+1fa71-1fa74, U+1fa79-1fa7b, U+1fa86, U+1fa8e-1fa8f, U+1fa91-1fa93, U+1fa96, U+1fa99-1faa0, U+1faa2-1faa7, U+1faaa-1faae',
    'U+265f, U+26bd-26be, U+26f3, U+26f8, U+fe0f, U+1f004, U+1f0cf, U+1f380-1f384, U+1f386-1f38b, U+1f38d-1f391, U+1f396-1f397, U+1f399-1f39b, U+1f39e-1f39f, U+1f3a3-1f3a5, U+1f3a7-1f3a9, U+1f3ab-1f3b4, U+1f3b7-1f3bb, U+1f3bd-1f3c0, U+1f3c5-1f3c6, U+1f3c8-1f3c9, U+1f3cf-1f3d3, U+1f3f8-1f3f9, U+1f47e, U+1f4e2, U+1f4f7-1f4fd, U+1f52b, U+1f579, U+1f58c-1f58d, U+1f5bc, U+1f6f7, U+1f6f9, U+1f6fc, U+1f93f, U+1f941, U+1f945, U+1f947-1f94f, U+1f9e7-1f9e9, U+1f9f5-1f9f6, U+1fa70-1fa71, U+1fa80-1fa81, U+1fa83-1fa85, U+1fa87-1fa8a, U+1fa94-1fa95, U+1fa97-1fa98, U+1faa1, U+1faa9, U+1fadf',
    'U+2693, U+26e9-26ea, U+26f1-26f2, U+26f4-26f5, U+26fa, U+26fd, U+2708, U+fe0f, U+1f301, U+1f303, U+1f306-1f307, U+1f309, U+1f310, U+1f3a0-1f3a2, U+1f3aa, U+1f3cd-1f3ce, U+1f3d5, U+1f3d7-1f3db, U+1f3df-1f3e6, U+1f3e8-1f3ed, U+1f3ef-1f3f0, U+1f488, U+1f492, U+1f4ba, U+1f54b-1f54d, U+1f5fa-1f5ff, U+1f680-1f6a2, U+1f6a4-1f6a8, U+1f6b2, U+1f6d1, U+1f6d5-1f6d6, U+1f6dd-1f6df, U+1f6e2-1f6e5, U+1f6e9, U+1f6eb-1f6ec, U+1f6f3-1f6f6, U+1f6f8, U+1f6fa-1f6fb, U+1f9bc-1f9bd, U+1f9ed, U+1f9f3, U+1fa7c',
    'U+200d, U+2615, U+fe0f, U+1f32d-1f330, U+1f336, U+1f33d, U+1f344-1f37f, U+1f382, U+1f52a, U+1f7e9, U+1f7eb, U+1f942-1f944, U+1f950-1f96f, U+1f99e, U+1f9aa, U+1f9c0-1f9cb, U+1fad0-1fadc',
    'U+200d, U+2600-2601, U+2603-2604, U+2614, U+2618, U+26a1, U+26c4-26c5, U+26c8, U+26f0, U+2728, U+2744, U+2b1b, U+2b50, U+fe0f, U+1f300, U+1f304-1f305, U+1f308, U+1f30a-1f30f, U+1f311-1f321, U+1f324-1f32c, U+1f331-1f335, U+1f337-1f33c, U+1f33e-1f344, U+1f3d4, U+1f3d6, U+1f3dc-1f3de, U+1f3f5, U+1f400-1f43f, U+1f490, U+1f4a7, U+1f4ae, U+1f525, U+1f54a, U+1f573, U+1f577-1f578, U+1f648-1f64a, U+1f6d8, U+1f940, U+1f980-1f9ae, U+1f9ba, U+1fa90, U+1faa8, U+1fab0-1fabf, U+1facd-1facf, U+1fae7',
    'U+200d, U+2640, U+2642, U+2695-2696, U+26f7, U+26f9, U+2708, U+2764, U+27a1, U+fe0f, U+1f33e, U+1f373, U+1f37c, U+1f384-1f385, U+1f393, U+1f3a4, U+1f3a8, U+1f3c2-1f3c4, U+1f3c7, U+1f3ca-1f3cc, U+1f3eb, U+1f3ed, U+1f3fb-1f3ff, U+1f430, U+1f466-1f469, U+1f46b-1f478, U+1f47c, U+1f481-1f483, U+1f486-1f487, U+1f48b, U+1f48f, U+1f491, U+1f4bb-1f4bc, U+1f527, U+1f52c, U+1f574-1f575, U+1f57a, U+1f645-1f647, U+1f64b, U+1f64d-1f64e, U+1f680, U+1f692, U+1f6a3, U+1f6b4-1f6b6, U+1f6c0, U+1f6cc, U+1f91d, U+1f926, U+1f930-1f931, U+1f934-1f93a, U+1f93c-1f93e, U+1f977, U+1f9af-1f9b3, U+1f9b8-1f9b9, U+1f9bc-1f9bd, U+1f9cc-1f9cf, U+1f9d1-1f9df, U+1fa70, U+1fa82, U+1fac3-1fac5, U+1fac8, U+1faef',
    'U+200d, U+2194-2195, U+2603, U+261d, U+2620, U+2639-263a, U+2665, U+26a1, U+26c4, U+270a-270d, U+2728, U+2763-2764, U+2b50, U+fe0f, U+1f31a-1f31f, U+1f32b, U+1f389-1f38a, U+1f3fb-1f3ff, U+1f440-1f450, U+1f463-1f465, U+1f479-1f47b, U+1f47d-1f480, U+1f485, U+1f48b-1f48c, U+1f493-1f49f, U+1f4a2, U+1f4a4-1f4a6, U+1f4a8-1f4ab, U+1f4af, U+1f525, U+1f573, U+1f590, U+1f595-1f596, U+1f5a4, U+1f5e3, U+1f600-1f644, U+1f648-1f64a, U+1f64c, U+1f64f, U+1f90c-1f925, U+1f927-1f92f, U+1f932-1f933, U+1f970-1f976, U+1f978-1f97a, U+1f9a0, U+1f9b4-1f9b7, U+1f9bb, U+1f9be-1f9bf, U+1f9d0, U+1f9e0-1f9e1, U+1fa75-1fa79, U+1fac0-1fac2, U+1fac6, U+1fae0-1fae6, U+1fae8-1faea, U+1faef-1faf8'
];
/** Noto Color Emoji 字体的 base64 @font-face 缓存（首次读取后复用） */
let _emojiFontCssCache = null;
class RendererService extends koishi_1.Service {
    config;
    static inject = ['puppeteer'];
    templateDir;
    constructor(ctx, config) {
        super(ctx, 'group_analysis_renderer', true);
        this.config = config;
        this.templateDir = path_1.default.resolve(ctx.baseDir, 'data/group_analysis');
        this.ctx.on('ready', async () => {
            await this.init();
        });
    }
    getSkinPath(filename) {
        const skin = this.config.skin || 'md3';
        return path_1.default.resolve(this.templateDir, skin, filename);
    }
    async imageToBase64(url) {
        // 已内联的 data URI 直接返回，无需再下载
        if (typeof url === 'string' && url.startsWith('data:')) {
            return url;
        }
        try {
            this.ctx.logger.debug(`转换图片为 Base64: ${url}`);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            // 根据 URL 或 Content-Type 推断 MIME 类型
            const contentType = response.headers.get('content-type') || 'image/png';
            const base64 = buffer.toString('base64');
            const dataUrl = `data:${contentType};base64,${base64}`;
            this.ctx.logger.debug(`图片已转换为 Base64，大小: ${base64.length} 字符`);
            return dataUrl;
        }
        catch (error) {
            this.ctx.logger.warn(`图片转换 Base64 失败: ${url}`, error);
            // 返回一个 1x1 透明 PNG 的 Base64
            return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        }
    }
    /** 不做 emoji 处理：容器已安装 emoji 字体（font-noto-emoji），由 Chromium 直接正常渲染。 */
    async injectEmojiFont(html) {
        return html;
    }
    async init() {
        const resourcesDir = __dirname + '/../../resources';
        const templateDir = this.templateDir;
        const skin = this.config.skin || 'md3';
        // 创建空 HTML 占位：渲染时先 goto 它（建立 file:// base），再 setContent 注入内容，@font-face 相对字体才能被加载
        const emptyHtmlPath = ORIGINAL_SKINS.includes(skin)
            ? path_1.default.resolve(templateDir, 'original', skin, 'emptyHtml.html')
            : path_1.default.resolve(templateDir, skin, 'emptyHtml.html');
        await fs_1.promises.writeFile(emptyHtmlPath, '');
        // 拷贝原项目皮肤模板（nunjucks 渲染用）
        const originalSourceDir = path_1.default.resolve(resourcesDir, 'original');
        const originalDestDir = path_1.default.resolve(templateDir, 'original');
        await fs_1.promises.mkdir(originalDestDir, { recursive: true });
        await fs_1.promises.cp(originalSourceDir, originalDestDir, { recursive: true });
        // 原项目皮肤模板直接使用 original 目录，无需拷贝到独立目录
        if (!ORIGINAL_SKINS.includes(skin)) {
            // Source: resources/md3 (or other skin)
            const skinSourceDir = path_1.default.resolve(resourcesDir, skin);
            // Destination: data/group_analysis/md3
            const skinDestDir = path_1.default.resolve(templateDir, skin);
            /* try {
                await fs.access(skinDestDir)
            } catch (error) { */
            await fs_1.promises.mkdir(skinDestDir, { recursive: true });
            // Copy only the configured skin directory
            await fs_1.promises.cp(skinSourceDir, skinDestDir, { recursive: true });
            /*   } */
            const tempHtmlFiles = await fs_1.promises
                .readdir(skinDestDir)
                .then((files) => files.filter((file) => file.endsWith('.html') && !file.startsWith('template')))
                .catch(() => []);
            for (const file of tempHtmlFiles) {
                await fs_1.promises.unlink(path_1.default.resolve(skinDestDir, file));
            }
        }
        const page = await this.ctx.puppeteer.page();
        try {
            await page.goto('file://' + this.getSkinPath('template_user.html'), {
                waitUntil: 'domcontentloaded'
            });
        }
        catch (error) {
            this.ctx.logger.error('初始化模板文件时发生错误:', error);
        }
        this.ctx.setTimeout(async () => {
            try {
                page.close();
            }
            catch (error) {
                this.ctx.logger.error('关闭页面时发生错误:', error);
            }
        }, 3 * 60 * 1000);
    }
    /** 当前皮肤目录下用于建立 file:// base 的空 HTML 占位路径。 */
    emptyHtmlPath() {
        const skin = this.config.skin || 'md3';
        return ORIGINAL_SKINS.includes(skin)
            ? path_1.default.resolve(this.templateDir, 'original', skin, 'emptyHtml.html')
            : path_1.default.resolve(this.templateDir, skin, 'emptyHtml.html');
    }
    /** 确保用于建立 file:// base 的空 HTML 占位存在（不依赖 init 顺序）。 */
    async ensureEmptyHtml() {
        const p = this.emptyHtmlPath();
        try {
            await fs_1.promises.access(p);
        }
        catch (e) {
            await fs_1.promises.mkdir(path_1.default.dirname(p), { recursive: true });
            await fs_1.promises.writeFile(p, '');
        }
    }
    async renderGroupAnalysisToPdf(data) {
        let theme = this.config.theme;
        if (theme === 'auto') {
            const hour = new Date().getHours();
            theme = hour >= 19 || hour < 6 ? 'dark' : 'light';
        }
        const page = await this._renderGroupAnalysis(data, theme);
        const pdfBuffer = await page.pdf({ format: 'A4' });
        await page.close();
        return pdfBuffer;
    }
    async renderGroupAnalysis(data, config) {
        try {
            let theme = config.theme;
            if (theme === 'auto') {
                const hour = new Date().getHours();
                theme = hour >= 19 || hour < 6 ? 'dark' : 'light';
            }
            const skin = config.skin || 'md3';
            if (ORIGINAL_SKINS.includes(skin)) {
                // 原项目皮肤：nunjucks 渲染完整页面后整页截图
                const page = await this._renderOriginalSkinGroup(data, theme);
                const imageBuffer = await page.screenshot({ fullPage: true });
                await page.close();
                this.ctx.logger.info(`图片渲染成功（原项目皮肤 ${skin}）！`);
                return imageBuffer;
            }
            const page = await this._renderGroupAnalysis(data, theme);
            // 找到页面中的 container 元素
            const renderer = skins_1.skinRegistry.getSafe(skin);
            const selector = renderer.containerSelector;
            const element = await page.$(selector);
            if (!element) {
                await page.close();
                throw new Error(`无法在渲染的 HTML 中找到 ${selector} 元素。`);
            }
            const imageBuffer = await element.screenshot({});
            await page.close();
            this.ctx.logger.info('图片渲染成功！');
            return imageBuffer;
        }
        catch (error) {
            this.ctx.logger.error('渲染报告图片时发生错误:', error);
            if (error instanceof Error) {
                return `图片渲染失败: ${error.message}`;
            }
            return '图片渲染失败，发生未知错误。';
        }
    }
    async _renderGroupAnalysis(data, theme) {
        // 检查 puppeteer 是否可用
        if (!this.ctx.puppeteer) {
            throw new Error('Puppeteer service is not available.');
        }
        // 头像转 base64 内联：避免部分用户头像 URL 加载失败导致空白；失败用默认头像兜底
        const DEFAULT_AVATAR = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#d9dee5"/><circle cx="40" cy="31" r="15" fill="#aab3bf"/><path d="M10 76c4-17 16-26 30-26s26 9 30 26z" fill="#aab3bf"/></svg>').toString('base64');
        const avatarCache = new Map();
        const inlineAvatar = async (obj) => {
            if (!obj)
                return obj;
            const url = obj.avatar;
            if (!url)
                return { ...obj, avatar: DEFAULT_AVATAR };
            if (!avatarCache.has(url)) {
                let b64 = '';
                try {
                    b64 = await this.imageToBase64(url);
                }
                catch (e) { }
                avatarCache.set(url, b64 || DEFAULT_AVATAR);
            }
            return { ...obj, avatar: avatarCache.get(url) };
        };
        data = {
            ...data,
            userStats: await Promise.all((data.userStats || []).map(inlineAvatar)),
            userTitles: await Promise.all((data.userTitles || []).map(inlineAvatar)),
        };

        // Match AstrBot's deterministic mention pipeline: preserve plain text and render only known [user_id] references.
        const topicUsers = data.topicUserStats || data.userStats || [];
        const inlineAvatarById = new Map((data.userStats || []).map((u) => [String(u.userId), u.avatar || '']));
        const topicIdMap = new Map();
        for (const u of topicUsers) {
            if (!u || !u.userId) continue;
            const uid = String(u.userId);
            topicIdMap.set(uid, {
                name: u.nickname || u.rawName || '群友',
                avatar: inlineAvatarById.get(uid) || u.avatar || ''
            });
        }
        const mentionedIds = new Set();
        for (const topic of (data.topics || [])) {
            if (!topic) continue;
            const source = `${topic.detail || ''} ${(topic.contributors || []).join(' ')}`;
            for (const uid of topicIdMap.keys()) {
                if (source.includes(uid)) mentionedIds.add(uid);
            }
        }
        await Promise.all([...mentionedIds].map(async (uid) => {
            const entry = topicIdMap.get(uid);
            if (!entry || !entry.avatar || !String(entry.avatar).startsWith('data:')) {
                entry.avatar = entry?.avatar ? await this.imageToBase64(entry.avatar) : DEFAULT_AVATAR;
            }
        }));
        const escapeTopicHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[ch]);
        const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const capsuleOf = (entry) => {
            const name = escapeTopicHtml(entry.name || '群友');
            const avatar = String(entry.avatar || DEFAULT_AVATAR).replace(/"/g, '&quot;');
            const image = '<img src="' + avatar + '" alt="" style="width:18px;height:18px;border-radius:50%;margin-right:4px;display:block;flex-shrink:0">';
            // Copy original capsule metrics exactly to keep avatar/name vertically centered on the text baseline.
            return '<span style="display:inline-flex;align-items:center;background:rgba(0,0,0,0.05);padding:2px 6px 2px 2px;border-radius:12px;margin:0 2px;vertical-align:middle;position:relative;top:-0.12em;border:1px solid rgba(0,0,0,0.1);text-decoration:none">' + image + '<span style="font-size:0.85em;color:inherit;font-weight:500;line-height:1">' + name + '</span></span>';
        };
        data = {
            ...data,
            topics: (data.topics || []).map((topic) => {
                if (!topic) return topic;
                let source = String(topic.detail || '');
                // Normalize bare IDs known to this report into the original [user_id] token format.
                for (const uid of [...topicIdMap.keys()].sort((a, b) => b.length - a.length)) {
                    const idPattern = new RegExp('(?<!\\[)(?<![A-Za-z0-9_-])' + escapeRegExp(uid) + '(?![A-Za-z0-9_-])(?!\\])', 'g');
                    source = source.replace(idPattern, '[' + uid + ']');
                }
                const tokenPattern = /\[([A-Za-z0-9_-]{1,128})\]/g;
                let detail = '';
                let cursor = 0;
                let match;
                while ((match = tokenPattern.exec(source))) {
                    detail += escapeTopicHtml(source.slice(cursor, match.index)).replace(/\r?\n/g, '<br>');
                    const entry = topicIdMap.get(match[1]);
                    detail += entry ? capsuleOf(entry) : escapeTopicHtml(match[0]);
                    cursor = match.index + match[0].length;
                }
                detail += escapeTopicHtml(source.slice(cursor)).replace(/\r?\n/g, '<br>');
                return { ...topic, detail };
            })
        };
        const templatePath = this.getSkinPath('template_group.html');
        const randomId = Math.random().toString(36).substring(2, 15);
        const skin = this.config.skin || 'md3';
        const outTemplateHtmlPath = path_1.default.resolve(this.templateDir, skin, `${randomId}.html`);
        const dynamicAvatarUrl = data.userStats?.[Math.floor(Math.random() * data.userStats.length)]
            ?.avatar ||
            'https://cravatar.cn/avatar/00000000000000000000000000000000?d=mp';
        // 将头像转换为 Base64
        const dynamicAvatarBase64 = await this.imageToBase64(dynamicAvatarUrl);
        // 读取模板文件并替换占位符
        const templateHtml = await fs_1.promises.readFile(templatePath, 'utf-8');
        const filledHtml = (0, utils_1.renderTemplate)(templateHtml, {
            groupName: data.groupName,
            analysisDate: data.analysisDate,
            totalMessages: data.totalMessages.toString(),
            totalParticipants: data.totalParticipants.toString(),
            totalChars: data.totalChars.toString(),
            mostActivePeriod: data.mostActivePeriod,
            emojiCount: (data.emojiCount || 0).toString(),
            userStats: (0, utils_1.formatUserStats)(data.userStats, skin),
            topics: (0, utils_1.formatTopics)(data.topics || [], skin),
            userTitles: (0, utils_1.formatUserTitles)(data.userTitles || [], skin),
            activeHoursChart: (0, utils_1.generateActiveHoursChart)(data.activeHoursData || {}, skin),
            goldenQuotes: (0, utils_1.formatGoldenQuotes)(data.goldenQuotes || [], skin),
            theme,
            dynamicAvatarUrl: dynamicAvatarBase64
        });
        // 写入临时 HTML 文件
        await fs_1.promises.writeFile(outTemplateHtmlPath, await this.injectEmojiFont(filledHtml));
        this.ctx.logger.info('HTML 模板填充完成，正在调用 Puppeteer 进行渲染...');
        const page = await this.ctx.puppeteer.page();
        // 与 ChatLuna 原版一致：直接 goto 临时 HTML（不 handle emoji，由 Chromium 正常渲染）
        await page.goto('file://' + outTemplateHtmlPath, {
            waitUntil: 'domcontentloaded'
        });
        this.ctx.logger.info('网页加载完成，开始等待字体加载。');
        // 等待字体加载完成
        await page.evaluate(() => document.fonts.ready);
        this.ctx.logger.info('字体加载完成。');
        // 等待页面内图片加载完成（避免截图像素缺失/头像空白），最多等待 8 秒
        await Promise.race([
            page.evaluate(() => Promise.all(Array.from(document.images)
                .filter((img) => !img.complete)
                .map((img) => new Promise((resolve) => {
                    img.onload = img.onerror = resolve;
                })))),
            new Promise((resolve) => setTimeout(resolve, 8000))
        ]).catch(() => { });
        // 设置 3 分钟后自动删除临时文件
        this.ctx.setTimeout(async () => {
            try {
                await fs_1.promises.unlink(outTemplateHtmlPath);
                this.ctx.logger.debug(`已删除临时文件: ${outTemplateHtmlPath}`);
            }
            catch (error) {
                this.ctx.logger.warn(`删除临时文件失败: ${error}`);
            }
        }, 3 * 60 * 1000); // 3 分钟
        return page;
    }
    async _renderOriginalSkinGroup(data, theme) {
        if (!this.ctx.puppeteer) {
            throw new Error('Puppeteer service is not available.');
        }
        const skin = this.config.skin || 'md3';
        const skinDir = path_1.default.resolve(this.templateDir, 'original', skin);
        const templatePath = path_1.default.resolve(skinDir, 'html_template.html');
        if (!fs_1.existsSync(templatePath)) {
            throw new Error(`原项目皮肤模板不存在: ${templatePath}`);
        }
        const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(skinDir), {
            autoescape: false,
            throwOnUndefined: false
        });
        // 注册 Python 风格的 format 过滤器（模板中使用了 "%02d" | format(...) 等）
        env.addFilter('format', (fmt, ...args) => {
            let index = 0;
            return String(fmt).replace(/%[-+0-9.]*[sdif]/g, (match) => {
                const arg = args[index++];
                if (match.endsWith('s'))
                    return String(arg ?? '');
                if (match.endsWith('d')) {
                    const width = parseInt(match.match(/\d+/)?.[0] || '0', 10);
                    let value = String(Math.trunc(Number(arg) || 0));
                    if (match.includes('0'))
                        value = value.padStart(width, '0');
                    return value;
                }
                if (match.endsWith('f')) {
                    const digits = parseInt(match.match(/\.(\d+)/)?.[1] || '0', 10);
                    return (Number(arg) || 0).toFixed(digits);
                }
                return String(arg ?? '');
            });
        });
        const context = await this.buildOriginalSkinContext(data, env);
        const html = env.render('html_template.html', context);
        const randomId = Math.random().toString(36).substring(2, 15);
        const outTemplateHtmlPath = path_1.default.resolve(skinDir, `${randomId}.html`);
        const emojiHtmlOriginal = await this.injectEmojiFont(html);
        await fs_1.promises.writeFile(outTemplateHtmlPath, emojiHtmlOriginal);
        this.ctx.logger.info(`原项目皮肤 ${skin} HTML 生成完成，正在调用 Puppeteer 渲染...`);
        const page = await this.ctx.puppeteer.page();
        await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 2 });
        await page.goto('file://' + outTemplateHtmlPath, {
            waitUntil: 'networkidle0',
            timeout: 60000
        }).catch(() => page.goto('file://' + outTemplateHtmlPath, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        }));
        try {
            await page.evaluate(() => document.fonts.ready);
        }
        catch (err) {
            this.ctx.logger.debug(`等待字体加载超时: ${err}`);
        }
        // 等待图片加载完成（头像等），最多等待 8 秒
        await Promise.race([
            page.evaluate(() => Promise.all(Array.from(document.images)
                .filter((img) => !img.complete)
                .map((img) => new Promise((resolve) => {
                    img.onload = img.onerror = resolve;
                })))),
            new Promise((resolve) => setTimeout(resolve, 8000))
        ]).catch(() => { });
        this.ctx.setTimeout(async () => {
            try {
                await fs_1.promises.unlink(outTemplateHtmlPath);
            }
            catch (error) {
                this.ctx.logger.debug(`删除临时文件失败: ${error}`);
            }
        }, 3 * 60 * 1000);
        return page;
    }
    async buildOriginalSkinContext(data, env) {
        // 活跃度图表数据：24 小时数组
        const activeHoursData = data.activeHoursData || {};
        const values = Object.values(activeHoursData);
        const maxCount = values.length > 0 ? Math.max(...values) : 0;
        const chartData = Array.from({ length: 24 }, (_, hour) => {
            const count = activeHoursData[hour] || 0;
            return {
                hour,
                count,
                percentage: maxCount > 0 ? Math.round((count / maxCount) * 100) : 0
            };
        });
        // 话题：原项目子模板使用 topic.index / topic.topic.topic / topic.detail / topic.contributors
        const topics = (data.topics || []).map((t, index) => ({
            index: index + 1,
            topic: { topic: t.topic || '' },
            detail: t.detail || '',
            contributors: Array.isArray(t.contributors)
                ? t.contributors.join('、')
                : (t.contributors || '')
        }));
        // 用户称号：原项目子模板使用 title.avatar_data / title.name / title.title / title.mbti / title.reason
        // 头像统一转成 base64 内联，避免外网加载失败导致头像空白
        const avatarBase64Cache = new Map();
        const toBase64 = async (url) => {
            if (!url)
                return '';
            if (url.startsWith('data:'))
                return url;
            if (avatarBase64Cache.has(url))
                return avatarBase64Cache.get(url);
            const b64 = await this.imageToBase64(url);
            avatarBase64Cache.set(url, b64);
            return b64;
        };
        const titles = await Promise.all((data.userTitles || []).map(async (t) => ({
            name: t.name || '',
            title: t.title || '',
            mbti: t.mbti || '',
            reason: t.reason || '',
            avatar_data: t.avatar ? await toBase64(t.avatar) : ''
        })));
        // 金句：原项目子模板使用 quote.avatar_url / quote.sender / quote.content / quote.reason
        const quotes = await Promise.all((data.goldenQuotes || []).map(async (q) => ({
            sender: q.sender || '',
            content: q.content || '',
            reason: q.reason || '',
            avatar_url: q.avatar ? await toBase64(q.avatar) : ''
        })));
        // 渲染子模板为 HTML 字符串
        let topicsHtml = '';
        let titlesHtml = '';
        let quotesHtml = '';
        let hourlyChartHtml = '';
        try {
            if (topics.length)
                topicsHtml = env.render('topic_item.html', { topics });
            if (titles.length)
                titlesHtml = env.render('user_title_item.html', { titles });
            if (quotes.length)
                quotesHtml = env.render('quote_item.html', { quotes });
            hourlyChartHtml = env.render('activity_chart.html', { chart_data: chartData });
        }
        catch (error) {
            this.ctx.logger.warn('渲染原项目皮肤子模板时发生错误，将使用空内容:', error);
        }
        const now = new Date();
        return {
            current_date: data.analysisDate || now.toLocaleDateString('zh-CN'),
            current_datetime: now.toLocaleString('zh-CN', { hour12: false }),
            message_count: data.totalMessages,
            participant_count: data.totalParticipants,
            total_characters: data.totalChars,
            emoji_count: data.emojiCount || 0,
            most_active_period: data.mostActivePeriod || 'N/A',
            // 字体与渲染环境（与原项目默认值保持一致）
            t2i_font_source: 'Mainland',
            t2i_google_fonts_mirror: 'https://fonts.googleapis.com',
            t2i_gstatic_mirror: 'https://fonts.gstatic.com',
            // 子模板 HTML
            topics_html: topicsHtml,
            titles_html: titlesHtml,
            quotes_html: quotesHtml,
            hourly_chart_html: hourlyChartHtml,
            chat_quality_html: '',
            // Token 统计（Koishi 版不统计，填 0）
            total_tokens: 0,
            prompt_tokens: 0,
            completion_tokens: 0
        };
    }
    async renderUserPersona(data, username, avatar, config) {
        try {
            let theme = config.theme;
            if (theme === 'auto') {
                const hour = new Date().getHours();
                theme = hour >= 19 || hour < 6 ? 'dark' : 'light';
            }
            const page = await this._renderUserPersona(data, username, avatar, theme);
            const renderer = skins_1.skinRegistry.getSafe(config.skin || 'md3');
            const selector = renderer.containerSelector;
            const element = await page.$(selector);
            if (!element) {
                await page.close();
                throw new Error(`无法在渲染的 HTML 中找到 ${selector} 元素。`);
            }
            const imageBuffer = await element.screenshot();
            await page.close();
            this.ctx.logger.info('用户画像图片渲染成功！');
            return imageBuffer;
        }
        catch (error) {
            this.ctx.logger.error('渲染用户画像图片时发生错误:', error);
            if (error instanceof Error) {
                return `图片渲染失败: ${error.message}`;
            }
            return '图片渲染失败，发生未知错误。';
        }
    }
    async _renderUserPersona(data, username, avatar, theme) {
        if (!this.ctx.puppeteer) {
            throw new Error('Puppeteer service is not available.');
        }
        const templatePath = this.getSkinPath('template_user.html');
        const randomId = Math.random().toString(36).substring(2, 15);
        const skin = this.config.skin || 'md3';
        const outTemplateHtmlPath = path_1.default.resolve(this.templateDir, skin, `${randomId}.html`);
        const renderer = skins_1.skinRegistry.getSafe(skin);
        const formatTags = (tags) => {
            if (renderer.formatTags) {
                return renderer.formatTags(tags);
            }
            // Fallback if skin doesn't implement formatTags
            if (!tags || tags.length === 0) {
                return '<div class="empty-state">暂无数据</div>';
            }
            return tags.map((tag) => `<div class="chip">${tag}</div>`).join('');
        };
        const formatEvidence = (items) => {
            if (renderer.formatEvidence) {
                return renderer.formatEvidence(items);
            }
            // Fallback if skin doesn't implement formatEvidence
            if (!items || items.length === 0) {
                return '<div class="empty-state">暂无事实依据</div>';
            }
            const cards = items
                .map((item) => {
                const quoteHtml = (item || '')
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .join('<br/>');
                return `
                        <div class="card outlined-card evidence-card">
                            <p>${quoteHtml}</p>
                        </div>
                    `;
            })
                .join('');
            return `<div class="card-grid">${cards}</div>`;
        };
        const dynamicAvatarUrl = avatar ||
            'https://cravatar.cn/avatar/00000000000000000000000000000000?d=mp';
        // 将头像转换为 Base64
        const dynamicAvatarBase64 = await this.imageToBase64(dynamicAvatarUrl);
        const templateHtml = await fs_1.promises.readFile(templatePath, 'utf-8');
        const filledHtml = (0, utils_1.renderTemplate)(templateHtml, {
            avatar: dynamicAvatarBase64,
            username,
            analysisDate: data.analysisDate || '暂无记录',
            summary: data.summary || '暂无摘要',
            keyTraits: formatTags(data.keyTraits),
            interests: formatTags(data.interests),
            communicationStyle: data.communicationStyle || '暂无记录',
            evidence: formatEvidence(data.evidence),
            theme,
            dynamicAvatarUrl: dynamicAvatarBase64
        });
        await fs_1.promises.writeFile(outTemplateHtmlPath, await this.injectEmojiFont(filledHtml));
        this.ctx.logger.info('用户画像 HTML 模板填充完成，正在调用 Puppeteer 进行渲染...');
        const page = await this.ctx.puppeteer.page();
        // 与 ChatLuna 原版一致：直接 goto 临时 HTML（不 handle emoji，由 Chromium 正常渲染）
        await page.goto('file://' + outTemplateHtmlPath, {
            waitUntil: 'domcontentloaded'
        });
        this.ctx.logger.info('网页加载完成，开始等待字体加载。');
        // 等待字体加载完成
        await page.evaluate(() => document.fonts.ready);
        this.ctx.logger.info('字体加载完成。');
        this.ctx.setTimeout(async () => {
            try {
                await fs_1.promises.unlink(outTemplateHtmlPath);
                this.ctx.logger.debug(`已删除临时文件: ${outTemplateHtmlPath}`);
            }
            catch (error) {
                this.ctx.logger.warn(`删除临时文件失败: ${error}`);
            }
        }, 3 * 60 * 1000);
        return page;
    }
}
exports.RendererService = RendererService;
//# sourceMappingURL=renderer.js.map