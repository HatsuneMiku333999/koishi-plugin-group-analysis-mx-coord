"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMService = void 0;
const koishi_1 = require("koishi");
const js_yaml_1 = require("js-yaml");
class LLMService extends koishi_1.Service {
    config;
    constructor(ctx, config) {
        super(ctx, 'group_analysis_llm', true);
        this.config = config;
    }
    async _callOpenAI(prompt, taskName) {
        const logger = this.ctx.logger;
        const endpoint = this.config.openaiEndpoint.replace(/\/$/, '');
        const url = `${endpoint}/chat/completions`;
        logger.info(`正在调用 OpenAI API 进行 ${taskName}...`);
        const response = await this.ctx.http.post(url, {
            model: this.config.openaiModel,
            messages: [
                { role: 'user', content: prompt }
            ],
            temperature: this.config.temperature ?? 1
        }, {
            headers: {
                'Authorization': `Bearer ${this.config.openaiApiKey}`,
                'Content-Type': 'application/json'
            }
        });
        const rawContent = response?.choices?.[0]?.message?.content;
        if (!rawContent) {
            logger.error(`OpenAI API 返回空响应: ${JSON.stringify(response)}`);
            throw new Error(`OpenAI API 返回空响应 (${taskName})`);
        }
        logger.info(`LLM 原始响应: ${rawContent || '[空响应]'}`);
        return rawContent;
    }
    async _callLLM(prompt, taskName) {
        const rawContent = await this._callOpenAI(prompt, taskName);
        // Extract YAML from markdown code block (supports both yaml and yml)
        const yamlMatch = rawContent.match(/```ya?ml\s*([\s\S]*?)\s*```/);
        if (!yamlMatch) {
            this.ctx.logger.warn(`未找到 YAML 代码块，无法解析。`);
            throw new Error('未找到 YAML 响应。');
        }
        try {
            // json: true 容忍重复 key（LLM 偶尔会重复输出 sender 等字段），后者覆盖前者
            const data = (0, js_yaml_1.load)(yamlMatch[1], { json: true });
            if (Array.isArray(data)) {
                this.ctx.logger.info(`成功解析 ${data.length} 条数据。`);
            }
            return data;
        }
        catch (err) {
            this.ctx.logger.error('解析 YAML 失败:', err);
            this.ctx.logger.error('待解析的 YAML 字符串:', yamlMatch[1] || '[空字符串]');
            throw err;
        }
    }
    async _callText(prompt, taskName) {
        const rawContent = await this._callOpenAI(prompt, taskName);
        return rawContent;
    }
    formatTimeRange(context) {
        if (!context?.timeRange)
            return '（未指定）';
        const { start, end, description } = context.timeRange;
        const format = (date) => date ? date.toLocaleString('zh-CN', { hour12: false }) : '（未知）';
        const rangeText = `${format(start)} ~ ${format(end)}`;
        return description ? `${description} (${rangeText})` : rangeText;
    }
    fillAnalysisPrompt(template, context) {
        const keywordsText = context?.keywords?.length > 0
            ? context.keywords.join('、')
            : '（无）';
        const topicsText = context?.topics?.length > 0 ? context.topics.join('、') : '（无）';
        const nicknamesText = context?.nicknames?.length > 0
            ? context.nicknames.join('、')
            : '（无）';
        const queryText = context?.query || '（无）';
        const timeRangeText = this.formatTimeRange(context);
        return template
            .replace('{keywords}', keywordsText)
            .replace('{topics}', topicsText)
            .replace('{nicknames}', nicknamesText)
            .replace('{query}', queryText)
            .replace('{timeRange}', timeRangeText);
    }
    async summarizeTopics(messagesText, context) {
        const basePrompt = this.fillAnalysisPrompt(this.config.promptTopic
            .replace('{messages}', messagesText)
            .replace('{maxTopics}', this.config.maxTopics.toString()), context);
        // Persisted user prompts may predate the ID-capsule behavior. Append the contract last
        // so contributors and detail references remain resolvable even with an older saved prompt.
        const prompt = `${basePrompt}\n\n【身份引用格式（优先于以上旧提示，必须遵守）】\n- 输入中的每条消息以 [user_id]: 开头。contributors 只输出这些消息中出现过的原始 user_id，不要输出昵称、昵称与 ID 的组合或其他标记。\n- detail 中每次提到具体群友，都只写 [user_id]，例如 [A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4]；不要写裸 ID 或昵称。这样报告才能把引用替换成对应昵称和头像。\n- 只能引用输入中实际出现的 ID，不得编造。`;
        return this._callLLM(prompt, '话题分析').then((data) => data ?? []);
    }
    async analyzeUserTitles(users, context) {
        const userSummaries = users
            .sort((a, b) => b.messageCount - a.messageCount)
            .slice(0, this.config.maxUserTitles)
            .map((user) => `- ${user.nickname} (QQ:${user.userId}): ` +
            `发言${user.messageCount}条, 平均${user.avgChars}字, ` +
            `表情比例${user.emojiRatio}, 夜间发言比例${user.nightRatio}, ` +
            `回复比例${user.replyRatio}`)
            .join('\n');
        const prompt = this.fillAnalysisPrompt(this.config.promptUserTitles.replace('{users}', userSummaries), context);
        return this._callLLM(prompt, '用户称号分析').then((data) => data ?? []);
    }
    async analyzeGoldenQuotes(messagesText, maxQuotes, context) {
        const prompt = this.fillAnalysisPrompt(this.config.promptGoldenQuotes
            .replace('{messages}', messagesText)
            .replace('{maxGoldenQuotes}', String(maxQuotes)), context);
        return this._callLLM(prompt, '金句分析').then((data) => data ?? []);
    }
    async analyzeUserPersona(userId, username, roles, recentMessages, previousAnalysis) {
        const filledPrompt = this.config.promptUserPersona
            .replace('{messages}', recentMessages || '（最近暂无发言记录）')
            .replace('{previousAnalysis}', previousAnalysis || '（无历史画像，请从零开始）')
            .replace('{roles}', roles?.join(', ') || '（未知角色）')
            .replace('{userId}', userId)
            .replace('{username}', username || userId)
            .replace('{personaLookbackDays}', String(this.config.personaLookbackDays));
        const resultArray = await this._callLLM(filledPrompt, '用户画像分析');
        const result = resultArray[0] || null;
        if (!result)
            return null;
        result.username = username;
        return result;
    }
    async parseGroupQuery(promptContext) {
        const prompt = this.config.promptQueryParser
            .replace('{currentTime}', promptContext.currentTime)
            .replace('{timeZone}', promptContext.timeZone)
            .replace('{platform}', promptContext.platform)
            .replace('{groupName}', promptContext.groupName || '未知群聊')
            .replace('{guildId}', promptContext.guildId || '')
            .replace('{channelId}', promptContext.channelId || '')
            .replace('{currentUserId}', promptContext.currentUserId || '')
            .replace('{currentUserName}', promptContext.currentUserName || '')
            .replace('{query}', promptContext.query);
        try {
            const intent = await this._callLLM(prompt, '群分析请求解析');
            return intent ?? null;
        }
        catch (error) {
            this.ctx.logger.warn('解析群分析请求失败:', error);
            return null;
        }
    }
    async replyGroupQuery(promptContext) {
        const prompt = this.config.promptQueryChat
            .replace('{currentTime}', promptContext.currentTime)
            .replace('{groupName}', promptContext.groupName || '未知群聊')
            .replace('{guildId}', promptContext.guildId || '')
            .replace('{channelId}', promptContext.channelId || '')
            .replace('{currentUserId}', promptContext.currentUserId || '')
            .replace('{currentUserName}', promptContext.currentUserName || '')
            .replace('{query}', promptContext.query)
            .replace('{analysisResult}', promptContext.analysisResult || '');
        return this._callText(prompt, '群分析对话回复');
    }
    async runCustomAnalysis(userPrompt, messagesText) {
        const prompt = `${userPrompt.trim()}\n\n` +
            '以下是群聊记录（每行格式为 昵称(userId): 消息内容）：\n' +
            messagesText;
        return this._callText(prompt, '自定义提示词分析');
    }
    async analyzeComicStoryboards(topics) {
        const validTopics = (topics || []).filter((t) => t?.topic);
        const topicsText = validTopics
            .map((t, i) => `${i + 1}. 话题: ${t.topic}\n   详情: ${t.detail || ''}`)
            .join('\n');
        const prompt = this.config.promptComicStoryboard
            .replace('{topics}', topicsText || '（无话题）')
            .replace('{topicCount}', String(Math.max(validTopics.length, 1)));
        this.ctx.logger.info(`正在生成漫画分镜提示词（${validTopics.length} 个话题）...`);
        const rawContent = await this._callOpenAI(prompt, '漫画分镜提示词');
        // 优先解析 JSON（兼容 ```json 代码块），失败时用正则提取 scene 字段
        const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        const candidates = [jsonMatch?.[1], rawContent].filter(Boolean);
        for (const candidate of candidates) {
            try {
                const data = JSON.parse(candidate);
                const scene = data?.scene ||
                    (Array.isArray(data?.storyboards)
                        ? data.storyboards.map((s) => s?.scene).filter(Boolean).join('\n\n')
                        : null);
                if (typeof scene === 'string' && scene.trim()) {
                    return scene.trim();
                }
            }
            catch (err) {
                // 继续尝试下一个候选
            }
        }
        const sceneMatch = rawContent.match(/"scene"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (sceneMatch) {
            return sceneMatch[1].replace(/\\"/g, '"').trim();
        }
        this.ctx.logger.warn('未能从 LLM 响应中解析出漫画 scene 提示词。');
        return null;
    }
}
exports.LLMService = LLMService;
//# sourceMappingURL=llm.js.map
