"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalysisService = void 0;
const koishi_1 = require("koishi");
const js_yaml_1 = require("js-yaml");
const utils_1 = require("../utils");
class AnalysisService extends koishi_1.Service {
    config;
    static inject = [
        'group_analysis_llm',
        'group_analysis_message',
        'group_analysis_renderer',
        'group_analysis_drawing'
    ];
    personaCache = new Map();
    personaProcessing = new Set();
    groupAnalysisCache = new Map();
    // 群昵称缓存：官方 bot 消息作者名是个人昵称，群名片需通过 getGuildMember 获取
    _groupNicknameCache = new Map();
    constructor(ctx, config) {
        super(ctx, 'group_analysis', true);
        this.config = config;
        this.setupPersonaDatabase();
        this.setupPersonaMessageListener();
    }
    setupPersonaDatabase() {
        this.ctx.database.extend('group_analysis_user_personas', {
            id: {
                type: 'char',
                length: 100
            },
            platform: {
                type: 'char',
                length: 30
            },
            selfId: { type: 'char', length: 100 },
            userId: { type: 'char', length: 100 },
            username: { type: 'char', length: 254 },
            persona: { type: 'text', nullable: true },
            lastAnalysisAt: { type: 'timestamp', nullable: true },
            updatedAt: { type: 'timestamp', nullable: true }
        }, {
            primary: 'id'
        });
    }
    setupPersonaMessageListener() {
        if (this.config.personaAnalysisMessageInterval === 0) {
            this.ctx.logger.info('已关闭自动用户画像分析。');
            return;
        }
        this.ctx.group_analysis_message.onUserMessage(async (session) => {
            if (!(0, utils_1.shouldListenToMessage)(session, this.config.listenerGroups, this.config.enableAllGroupsByDefault))
                return;
            await this.handleIncomingMessageForPersona(session);
        });
    }
    async handleIncomingMessageForPersona(session) {
        if (this.config.personaAnalysisMessageInterval === 0)
            return;
        if (!session.userId)
            return;
        // Skip users in personaUserFilter
        if (this.config.personaUserFilter.includes(session.userId)) {
            return;
        }
        // 黑名单用户不做画像分析
        if (this.config.personaBlacklist?.includes(session.userId)) {
            return;
        }
        const recordId = (0, utils_1.buildPersonaRecordId)(session.platform, session.selfId, session.userId);
        const cache = await this.ensurePersonaCache(recordId, {
            platform: session.platform,
            selfId: session.selfId,
            userId: session.userId,
            username: session.username || session.userId
        });
        cache.pendingMessages += 1;
        cache.record.username = session.username || cache.record.username;
        if (cache.pendingMessages >=
            this.config.personaAnalysisMessageInterval &&
            !this.personaProcessing.has(recordId)) {
            this.personaProcessing.add(recordId);
            const sourceGroup = {
                guildId: session.guildId || undefined,
                channelId: session.channelId || undefined,
                platform: session.platform,
                selfId: session.selfId
            };
            // eslint-disable-next-line no-void
            void this.runPersonaAnalysis(cache, sourceGroup)
                .catch((error) => this.ctx.logger.error(`执行用户画像分析失败 (${recordId}):`, error))
                .finally(() => {
                this.personaProcessing.delete(recordId);
                cache.pendingMessages = 0;
            });
        }
    }
    async ensurePersonaCache(id, defaults) {
        const cached = this.personaCache.get(id);
        if (cached)
            return cached;
        const existing = await this.ctx.database
            .select('group_analysis_user_personas')
            .where({ id })
            .execute()
            .then((records) => records[0]);
        if (existing) {
            if (existing.lastAnalysisAt &&
                !(existing.lastAnalysisAt instanceof Date)) {
                existing.lastAnalysisAt = new Date(existing.lastAnalysisAt);
            }
            if (existing.updatedAt && !(existing.updatedAt instanceof Date)) {
                existing.updatedAt = new Date(existing.updatedAt);
            }
        }
        let parsedPersona;
        if (existing?.persona) {
            try {
                parsedPersona = (0, js_yaml_1.load)(existing.persona);
            }
            catch (error) {
                this.ctx.logger.warn(`解析用户画像 YAML 失败 (${id})，将忽略历史画像。`, error);
                parsedPersona = null;
            }
        }
        const cache = {
            record: existing ||
                {
                    id,
                    ...defaults
                },
            pendingMessages: 0,
            parsedPersona
        };
        /* if (!existing) {
            await this.ctx.database.create(
                'group_analysis_user_personas',
                cache.record
            )
        } */
        this.personaCache.set(id, cache);
        return cache;
    }
    async runPersonaAnalysis(cache, sourceGroup) {
        const { record } = cache;
        const lookbackStart = (0, utils_1.getStartTimeByDays)(this.config.personaLookbackDays);
        const historyMessages = await this.collectUserMessagesForPersona(record, lookbackStart, sourceGroup);
        if (historyMessages.length < this.config.personaMinMessages) {
            this.ctx.logger.info(`用户 ${record.userId} 在设定时间窗内仅收集到 ${historyMessages.length} 条消息，低于触发阈值 ${this.config.personaMinMessages}，跳过画像分析。`);
            return;
        }
        const promptMessages = (0, utils_1.formatMessagesForPersona)(historyMessages);
        this.ctx.logger.info(`开始分析用户 ${record.userId} 的画像 (${record.username})，收集到 ${historyMessages.length} 条消息。`);
        const previousText = (0, utils_1.formatPersonaForPrompt)(cache.parsedPersona);
        const persona = await this.ctx.group_analysis_llm.analyzeUserPersona(record.userId, record.username, record.roles, promptMessages, previousText);
        if (!persona) {
            this.ctx.logger.warn(`LLM 未返回用户画像结果 (${record.userId})。`);
            return;
        }
        const personaWithEvidence = this.attachEvidenceMessageIds(persona, historyMessages);
        const merged = (0, utils_1.mergePersona)(cache.parsedPersona, personaWithEvidence);
        cache.parsedPersona = merged;
        await this.persistPersona(record, merged);
    }
    async collectUserMessagesForPersona(record, startTime, sourceGroup) {
        const results = [];
        const useOnlyCurrentGroup = this.config.personaOnlyCurrentGroup ||
            this.config.enableAllGroupsByDefault;
        // 优先匹配配置的监听群；未匹配到时回退到触发会话的当前群，
        // 保证官方 QQ 机器人等平台下画像分析仍能收集到消息。
        let relevantGroups = useOnlyCurrentGroup
            ? []
            : this.config.listenerGroups.filter((group) => group.enabled &&
                group.platform === record.platform &&
                group.selfId === record.selfId);
        if (!relevantGroups.length && sourceGroup) {
            const fallbackGroup = {
                enabled: true,
                platform: sourceGroup.platform,
                selfId: sourceGroup.selfId,
                channelId: sourceGroup.channelId,
                guildId: sourceGroup.guildId
            };
            if (fallbackGroup.platform &&
                fallbackGroup.selfId &&
                (fallbackGroup.channelId || fallbackGroup.guildId)) {
                this.ctx.logger.info(`用户 ${record.userId} 画像分析未匹配到配置监听群，回退使用当前群 (${fallbackGroup.channelId || fallbackGroup.guildId})。`);
                relevantGroups = [fallbackGroup];
            }
        }
        if (!relevantGroups.length) {
            const reason = useOnlyCurrentGroup
                ? '未提供可用的当前群组信息'
                : '未在配置中找到监听群组';
            this.ctx.logger.warn(`用户 ${record.userId} 画像分析缺少群组上下文（${reason}），跳过画像分析。`);
            return [];
        }
        this.ctx.logger.info(`用户 ${record.userId} 画像分析将从 ${relevantGroups.length} 个群收集消息。`);
        const totalLimit = this.config.personaMaxMessages;
        for (const group of relevantGroups) {
            const bot = this._getBot(group.selfId);
            let userGroupInfo = null;
            try {
                if (bot.platform === 'onebot') {
                    userGroupInfo = await bot.internal.getGroupMemberInfo(group.guildId, record.userId, true);
                }
                else if (bot?.getGuildMember) {
                    userGroupInfo = await bot.getGuildMember(group.channelId || group.guildId, record.userId);
                }
            }
            catch (error) {
                // 官方 QQ 机器人等平台可能没有获取群成员信息的权限，
                // 不中断画像分析，仅跳过角色信息（roles 保持为空）。
                this.ctx.logger.debug(`获取用户 ${record.userId} 的群组信息失败 (${group.channelId || group.guildId})，将跳过角色信息: ${error}`);
            }
            if (userGroupInfo) {
                record.roles = (userGroupInfo.roles || []).map((r) => (typeof r === 'string' ? r : r.name || r.id || ''));
            }
            const history = await this.ctx.group_analysis_message.getHistoricalMessages({
                guildId: group.guildId,
                channelId: group.channelId,
                userId: [record.userId],
                selfId: group.selfId,
                startTime,
                endTime: new Date(),
                limit: totalLimit,
                purpose: 'user-persona'
            });
            results.push(...history
                .map((message) => ({ ...message, content: (0, utils_1.cleanContent)(message.content) }))
                .filter((message) => message.content && !(0, utils_1.isJunkMessage)(message.content))
                .map((message) => ({
                ...message,
                guildId: message.guildId ?? group.guildId,
                channelId: message.channelId ?? group.channelId
            })));
            if (results.length >= totalLimit) {
                break;
            }
        }
        results.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        return results;
    }
    attachEvidenceMessageIds(persona, messages) {
        if (!persona.evidence) {
            return persona;
        }
        const evidenceEntries = persona.evidence;
        const messageIndex = {};
        const contentIndex = {};
        const getText = (msg) => koishi_1.h
            .select(msg.elements || [koishi_1.h.text(msg.content)], 'text')
            .toString()
            .trim();
        for (const message of messages) {
            if (message.messageId && !messageIndex[message.messageId]) {
                messageIndex[message.messageId] = message;
            }
            if (message.id && !messageIndex[message.id]) {
                messageIndex[message.id] = message;
            }
            const text = getText(message);
            if (text && !contentIndex[text]) {
                contentIndex[text] = message;
            }
        }
        const updated = [];
        for (const entry of evidenceEntries) {
            const rawEntry = String(entry).trim();
            // 1) 优先按 ID 匹配
            let resolvedMessage = messageIndex[rawEntry];
            // 2) 再按内容原文匹配（模型有时返回的是消息文本而非 ID）
            if (!resolvedMessage && contentIndex[rawEntry]) {
                resolvedMessage = contentIndex[rawEntry];
            }
            if (resolvedMessage) {
                updated.push(getText(resolvedMessage));
            }
            else {
                // 3) 都匹配不上，直接把原文作为引用（如果看起来像一句话）
                if (rawEntry.length > 0) {
                    updated.push(rawEntry);
                }
                else {
                    this.ctx.logger.warn(`无法找到画像证据 ${entry} 对应的消息，请检查消息服务是否正常。`);
                }
            }
        }
        this.ctx.logger.info(`已解析 ${updated.length} 条画像证据。`);
        return {
            ...persona,
            evidence: updated.length ? updated : []
        };
    }
    async persistPersona(record, persona) {
        const now = new Date();
        record.persona = (0, js_yaml_1.dump)(persona, {
            indent: 2,
            lineWidth: -1,
            noRefs: true
        });
        record.lastAnalysisAt = now;
        record.updatedAt = now;
        await this.ctx.database.upsert('group_analysis_user_personas', [record]);
    }
    async _getGroupHistoryFromMessageService(selfId, target, days, hours = 0, minutes = 0) {
        const targetId = target.guildId || target.channelId;
        if (!targetId) {
            this.ctx.logger.warn('执行群分析时缺少有效的群组或频道标识。');
            return [];
        }
        const endTime = new Date();
        const durationMinutes = days * 24 * 60 + hours * 60 + minutes;
        const hasSubDayWindow = hours > 0 || minutes > 0;
        const startTime = hasSubDayWindow
            ? new Date(endTime.getTime() - durationMinutes * 60 * 1000)
            : (0, utils_1.getStartTimeByDays)(days);
        const durationText = [days > 0 ? `${days} 天` : '', hours > 0 ? `${hours} 小时` : '', minutes > 0 ? `${minutes} 分钟` : ''].filter(Boolean).join(' ') || `${days} 天`;
        this.ctx.logger.info(`开始从消息服务获取群组 ${targetId} 近 ${durationText}的消息记录...`);
        const messages = await this.ctx.group_analysis_message.getHistoricalMessages({
            guildId: target.guildId,
            channelId: target.channelId,
            startTime,
            selfId,
            endTime,
            limit: this.config.maxMessages,
            purpose: 'group-analysis'
        });
        this.ctx.logger.info(`从消息服务获取到 ${messages.length} 条消息。`);
        return messages;
    }
    async _getGroupHistoryFromMessageServiceByTimeRange(selfId, target, startTime, endTime) {
        const targetId = target.guildId || target.channelId;
        if (!targetId) {
            this.ctx.logger.warn('执行群分析时缺少有效的群组或频道标识。');
            return [];
        }
        this.ctx.logger.info(`开始从消息服务获取群组 ${targetId} ${startTime.toLocaleString()} - ${endTime.toLocaleString()} 的消息记录...`);
        const messages = await this.ctx.group_analysis_message.getHistoricalMessages({
            guildId: target.guildId,
            channelId: target.channelId,
            startTime,
            selfId,
            endTime,
            limit: this.config.maxMessages,
            purpose: 'group-analysis'
        });
        this.ctx.logger.info(`从消息服务获取到 ${messages.length} 条消息。`);
        return messages;
    }
    async resolveGroupName(selfId, target) {
        const bot = this._getBot(selfId);
        const fallbackName = target.guildId || target.channelId || 'unknown';
        let groupName = fallbackName;
        if (bot) {
            try {
                if (target.guildId) {
                    groupName =
                        (await bot.getGuild(target.guildId)).name || groupName;
                }
                else if (target.channelId && bot.getChannel) {
                    const channel = await bot.getChannel(target.channelId, target.guildId);
                    groupName = channel?.name || groupName;
                }
            }
            catch (err) {
                this.ctx.logger.warn(`获取群组 ${fallbackName} 名称失败: ${err}`);
            }
        }
        return groupName;
    }
    normalizeQueryAction(action) {
        const normalized = action?.trim();
        if (normalized === '分析加对话' || normalized === '只对话') {
            return normalized;
        }
        return '只分析';
    }
    resolveQueryTimeRange(intent, fallbackDays, fallbackHours = 0, fallbackMinutes = 0) {
        const now = new Date();
        let start;
        let end;
        if (intent?.targetTime?.startTime) {
            const parsed = new Date(intent.targetTime.startTime);
            if (!isNaN(parsed.getTime()))
                start = parsed;
        }
        if (intent?.targetTime?.endTime) {
            const parsed = new Date(intent.targetTime.endTime);
            if (!isNaN(parsed.getTime()))
                end = parsed;
        }
        if (!end)
            end = now;
        if (!start) {
            if (fallbackHours > 0 || fallbackMinutes > 0) {
                start = new Date(now.getTime() - (fallbackDays * 24 * 60 + fallbackHours * 60 + fallbackMinutes) * 60 * 1000);
            }
            else {
                start = (0, utils_1.getStartTimeByDays)(fallbackDays);
            }
        }
        if (start > end) {
            const temp = start;
            start = end;
            end = temp;
        }
        return {
            start,
            end,
            description: intent?.targetTime?.description
        };
    }
    async executeGroupAnalysis(selfId, target, days, outputFormat, force, replySession, deliveryTarget, hours = 0, minutes = 0) {
        const bot = this._getBot(selfId);
        const analysisChannel = target.channelId ?? target.guildId;
        const sendTarget = deliveryTarget?.channelId || deliveryTarget?.guildId
            ? deliveryTarget
            : target;
        const targetChannel = sendTarget.channelId ?? sendTarget.guildId;
        const targetGuildContext = sendTarget.channelId && sendTarget.guildId
            ? sendTarget.guildId
            : undefined;
        if (!analysisChannel || !targetChannel) {
            this.ctx.logger.warn('执行群分析需要提供 channelId 或 guildId。');
            return;
        }
        const sendStatus = async (content) => replySession
            ? replySession.send(content)
            : bot?.sendMessage(targetChannel, content, targetGuildContext);
        let message;
        try {
            const cacheKey = (0, utils_1.buildGroupAnalysisCacheKey)(selfId, target, days + hours / 24 + minutes / 1440);
            const cached = this.groupAnalysisCache.get(cacheKey);
            const cacheExpired = (0, utils_1.isCacheExpiredByMinutes)(cached?.analyzedAt, this.config.groupAnalysisCacheMinutes);
            const shouldRefresh = force || cacheExpired || !cached;
            let analysisResult;
            if (!shouldRefresh && cached) {
                analysisResult = cached.result;
            }
            else {
                const windowText = [days > 0 ? `${days} 天` : '', hours > 0 ? `${hours} 小时` : '', minutes > 0 ? `${minutes} 分钟` : ''].filter(Boolean).join(' ') || `${days} 天`;
                await sendStatus(`开始分析群聊近 ${windowText}的活动，请稍候...`);
                const messages = await this._getGroupHistoryFromMessageService(selfId, target, days, hours, minutes);
                if (messages.length < this.config.minMessages) {
                    await sendStatus(`消息数量（${messages.length}/${this.config.minMessages}）不足于进行进行有效分析。`);
                    return;
                }
                this.ctx.logger.info(`群分析已获取 ${messages.length} 条消息，开始智能分析。`);
                analysisResult = await this.analyzeGroupMessages(messages, selfId, target);
                this.groupAnalysisCache.set(cacheKey, {
                    result: analysisResult,
                    analyzedAt: new Date()
                });
            }
            const format = outputFormat || this.config.outputFormat || 'image';
            switch (format) {
                case 'image':
                    {
                        const image = await this.ctx.group_analysis_renderer.renderGroupAnalysis(analysisResult, this.config);
                        message =
                            typeof image === 'string'
                                ? koishi_1.h.text(image)
                                : koishi_1.h.image(image, 'image/png');
                    }
                    break;
                case 'pdf': {
                    const pdfBuffer = await this.ctx.group_analysis_renderer.renderGroupAnalysisToPdf(analysisResult);
                    message = pdfBuffer
                        ? koishi_1.h.file(pdfBuffer, 'application/pdf')
                        : koishi_1.h.text('PDF 渲染失败，请检查日志。');
                    break;
                }
                default: {
                    message = koishi_1.h.text((0, utils_1.generateTextReport)(analysisResult));
                }
            }
        }
        catch (error) {
            this.ctx.logger.error(`为群组 ${target.guildId || target.channelId} 执行分析任务时发生错误:`, error);
            const errorMessage = error instanceof Error ? error.message : '未知错误。';
            message = koishi_1.h.text(`分析失败: ${errorMessage}。请检查网络连接和 LLM 配置，或联系管理员。`);
        }
        if (replySession) {
            await replySession.send(message);
        }
        else {
            await bot?.sendMessage(targetChannel, message, targetGuildContext);
        }
    }
    async executeGroupQuery(session, target, query, outputFormat) {
        const bot = this._getBot(session.selfId);
        const targetChannel = target.channelId ?? target.guildId;
        const targetGuildContext = target.channelId && target.guildId ? target.guildId : undefined;
        if (!targetChannel) {
            this.ctx.logger.warn('执行群分析需要提供 channelId 或 guildId。');
            return;
        }
        const sendStatus = async (content) => session.send(content);
        const currentTime = new Date();
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const groupName = await this.resolveGroupName(session.selfId, target);
        this.ctx.logger.info(`收到群分析请求，开始解析用户请求: ${query}`);
        const intent = await this.ctx.group_analysis_llm.parseGroupQuery({
            query,
            currentTime: currentTime.toLocaleString('zh-CN', {
                hour12: false
            }),
            timeZone,
            platform: session.platform,
            groupName,
            guildId: target.guildId,
            channelId: target.channelId,
            currentUserId: session.userId,
            currentUserName: session.username || session.userId
        });
        if (!intent) {
            await sendStatus('未能解析你的请求，请换个说法再试。');
            return;
        }
        const action = this.normalizeQueryAction(intent.action);
        const timeRange = this.resolveQueryTimeRange(intent, this.config.cronAnalysisDays ?? 1, this.config.cronAnalysisHours ?? 0, this.config.cronAnalysisMinutes ?? 0);
        this.ctx.logger.info(`准备获取消息记录: ${timeRange.start.toLocaleString()} - ${timeRange.end.toLocaleString()}`);
        const messages = await this._getGroupHistoryFromMessageServiceByTimeRange(session.selfId, target, timeRange.start, timeRange.end);
        if (messages.length < this.config.minMessages) {
            await sendStatus(`消息数量（${messages.length}/${this.config.minMessages}）不足于进行有效分析。`);
            return;
        }
        this.ctx.logger.info(`群分析已获取 ${messages.length} 条消息，开始智能分析。`);
        const keywords = Array.isArray(intent.keywords)
            ? intent.keywords.filter(Boolean)
            : intent.keywords
                ? [String(intent.keywords)]
                : [];
        const topics = Array.isArray(intent.topics)
            ? intent.topics.filter(Boolean)
            : intent.topics
                ? [String(intent.topics)]
                : [];
        const nicknames = Array.isArray(intent.nicknames)
            ? intent.nicknames.filter(Boolean)
            : intent.nicknames
                ? [String(intent.nicknames)]
                : [];
        const analysisContext = {
            keywords,
            topics,
            nicknames,
            query,
            timeRange
        };
        const analysisResult = await this.analyzeGroupMessages(messages, session.selfId, target, analysisContext);
        const textReport = (0, utils_1.generateTextReport)(analysisResult);
        const format = outputFormat || this.config.outputFormat || 'image';
        if (action !== '只对话') {
            let reportMessage;
            switch (format) {
                case 'image':
                    {
                        const image = await this.ctx.group_analysis_renderer.renderGroupAnalysis(analysisResult, this.config);
                        reportMessage =
                            typeof image === 'string'
                                ? koishi_1.h.text(image)
                                : koishi_1.h.image(image, 'image/png');
                    }
                    break;
                case 'pdf': {
                    const pdfBuffer = await this.ctx.group_analysis_renderer.renderGroupAnalysisToPdf(analysisResult);
                    reportMessage = pdfBuffer
                        ? koishi_1.h.file(pdfBuffer, 'application/pdf')
                        : koishi_1.h.text('PDF 渲染失败，请检查日志。');
                    break;
                }
                default: {
                    reportMessage = koishi_1.h.text(textReport);
                }
            }
            await sendStatus(reportMessage);
        }
        if (action !== '只分析') {
            const reply = await this.ctx.group_analysis_llm.replyGroupQuery({
                query,
                analysisResult: textReport,
                currentTime: currentTime.toLocaleString('zh-CN', {
                    hour12: false
                }),
                groupName,
                guildId: target.guildId,
                channelId: target.channelId,
                currentUserId: session.userId,
                currentUserName: session.username || session.userId
            });
            if (reply?.length) {
                await sendStatus(reply);
            }
            else {
                await sendStatus('对话生成失败，请稍后再试。');
            }
        }
    }
    async executeCustomAnalysis(session, target, prompt, days, hours = 0, minutes = 0) {
        const targetChannel = target.channelId ?? target.guildId;
        if (!targetChannel) {
            this.ctx.logger.warn('执行自定义分析需要提供 channelId 或 guildId。');
            return;
        }
        const durationMinutes = Math.floor(days * 24 * 60 + hours * 60 + minutes);
        if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
            await session.send('自定义提示词分析时间范围必须大于 0 分钟。');
            return;
        }
        const startTime = new Date(Date.now() - durationMinutes * 60 * 1000);
        const endTime = new Date();
        const durationText = [
            days > 0 ? `${days} 天` : '',
            hours > 0 ? `${hours} 小时` : '',
            minutes > 0 ? `${minutes} 分钟` : ''
        ].filter(Boolean).join(' ') || `${durationMinutes} 分钟`;
        const sendStatus = async (content) => session.send(content);
        // 不记录提示词全文，避免把自定义指令内容写进运行日志。
        this.ctx.logger.info(`收到自定义提示词分析请求 (群: ${targetChannel}，范围: 近 ${durationText})。`);
        try {
            await sendStatus(`开始使用自定义提示词分析近 ${durationText} 的聊天记录，请稍候...`);
            const messages = await this._getGroupHistoryFromMessageServiceByTimeRange(session.selfId, target, startTime, endTime);
            if (messages.length < this.config.minMessages) {
                await sendStatus(`消息数量（${messages.length}/${this.config.minMessages}）不足于进行有效分析。`);
                return;
            }
            const { allMessagesText } = (0, utils_1.calculateBasicStats)(messages);
            const messagesText = allMessagesText.join('\n');
            this.ctx.logger.info(`自定义分析已获取 ${messages.length} 条消息，开始调用 LLM。`);
            const result = await this.ctx.group_analysis_llm.runCustomAnalysis(prompt, messagesText);
            this.ctx.logger.info('自定义分析完成，开始发送结果。');
            for (const chunk of this._splitTextForSend(result)) {
                await sendStatus(koishi_1.h.text(chunk));
            }
        }
        catch (error) {
            this.ctx.logger.error(`为群组 ${target.guildId || target.channelId} 执行自定义分析时发生错误:`, error);
            const errorMessage = error instanceof Error ? error.message : '未知错误。';
            await sendStatus(koishi_1.h.text(`自定义分析失败: ${errorMessage}。请检查网络连接和 LLM 配置，或联系管理员。`));
        }
    }
    async executeAutoAnalysisForEnabledGroups() {
        const enabledGroups = this.config.listenerGroups.filter((group) => group.enabled);
        const maxConcurrentAnalyses = 3;
        for (let index = 0; index < enabledGroups.length; index += maxConcurrentAnalyses) {
            const currentBatch = enabledGroups.slice(index, index + maxConcurrentAnalyses);
            await Promise.allSettled(currentBatch.map(async (group) => {
                try {
                    const analysisTarget = { guildId: group.guildId, channelId: group.channelId };
                    const deliveryTarget = group.reportChannelId
                        ? { channelId: group.reportChannelId }
                        : undefined;
                    await this.executeGroupAnalysis(group.selfId, analysisTarget, this.config.cronAnalysisDays, undefined, false, undefined, deliveryTarget, this.config.cronAnalysisHours ?? 0, this.config.cronAnalysisMinutes ?? 0);
                }
                catch (err) {
                    this.ctx.logger.error(`群 ${group.guildId || group.channelId} 自动分析失败:`, err);
                }
            }));
        }
    }
    async getUserPersona(platform, selfId, userId) {
        const recordId = (0, utils_1.buildPersonaRecordId)(platform, selfId, userId);
        // First, check the cache
        const cached = this.personaCache.get(recordId);
        if (cached?.parsedPersona) {
            return {
                profile: cached.parsedPersona,
                username: cached.record.username
            };
        }
        // If not in cache, query the database
        const record = await this.ctx.database
            .select('group_analysis_user_personas')
            .where({ id: recordId })
            .execute()
            .then((records) => records[0]);
        if (!record?.persona) {
            return null;
        }
        try {
            const profile = (0, js_yaml_1.load)(record.persona);
            return { profile, username: record.username };
        }
        catch (error) {
            this.ctx.logger.warn(`解析用户画像 YAML 失败 (${recordId})，无法提供画像。`, error);
            return null;
        }
    }
    async executeUserPersonaAnalysis(session, userId, force) {
        const bot = session.bot;
        await session.send('正在查询用户画像数据，请稍候...');
        let message;
        try {
            const recordId = (0, utils_1.buildPersonaRecordId)(session.platform, session.selfId, userId);
            let avatar;
            let user;
            try {
                user = await bot.getGuildMember(session.channelId || session.guildId, userId);
            }
            catch (error) {
                // 官方 QQ 机器人等平台可能没有获取群成员信息的权限，回退到本地记录
                this.ctx.logger.debug(`获取用户 ${userId} 的成员信息失败，将回退到本地记录: ${error}`);
            }
            const cache = await this.ensurePersonaCache(recordId, {
                platform: session.platform,
                selfId: session.selfId,
                userId,
                username: user?.nick || user?.name || user?.user?.name || userId
            });
            let displayName = cache.record.username;
            const cacheExpired = (0, utils_1.isCacheExpiredByDays)(cache.record.lastAnalysisAt, this.config.personaCacheLifetimeDays);
            const shouldRefresh = force || cacheExpired || !cache.parsedPersona;
            if (shouldRefresh) {
                if (!force && cache.parsedPersona && cacheExpired) {
                    const ttlDays = this.config.personaCacheLifetimeDays;
                    if (ttlDays > 0) {
                        await session.send(`上次用户画像更新已超过 ${ttlDays} 天，正在重新生成画像。`);
                    }
                }
                const sourceGroup = {
                    guildId: session.guildId || undefined,
                    channelId: session.channelId || undefined,
                    platform: session.platform,
                    selfId: session.selfId
                };
                await this.runPersonaAnalysis(cache, sourceGroup);
                if (!cache.parsedPersona) {
                    message = koishi_1.h.text('暂未收集到足够的聊天记录来生成该用户的画像，请稍后再试。');
                    await session.send(message);
                    return;
                }
                cache.pendingMessages = 0;
            }
            const profile = cache.parsedPersona;
            if (user) {
                // Koishi Universal.GuildMember 结构：{ user: { id, name, avatar }, name, ... }
                avatar = user.avatar || user.user?.avatar;
                const resolvedName = user.nick ||
                    user.name ||
                    user.user?.name;
                if (resolvedName) {
                    displayName = resolvedName;
                    cache.record.username = resolvedName;
                }
            }
            // 平台化头像解析：onebot 走 QQ 号接口，官方 QQ 机器人走 openid 模板
            if (session.platform === 'onebot') {
                avatar = (0, utils_1.getAvatarUrl)(userId);
            }
            else if (!avatar) {
                avatar = (0, utils_1.resolveUserAvatar)(bot, userId);
            }
            // 昵称/头像兜底：从数据库已记录的消息中回退用户资料
            if (!displayName || displayName === userId || !avatar) {
                const fallback = await this.lookupUserProfileFromMessages(session.platform, session.selfId, userId);
                if (fallback) {
                    if ((!displayName || displayName === userId) && fallback.username) {
                        displayName = fallback.username;
                        cache.record.username = fallback.username;
                    }
                    if (!avatar && fallback.avatarUrl) {
                        avatar = fallback.avatarUrl;
                    }
                }
            }
            profile.analysisDate = cache.record.lastAnalysisAt.toLocaleString();
            const image = await this.ctx.group_analysis_renderer.renderUserPersona(profile, displayName, avatar, this.config);
            message =
                typeof image === 'string'
                    ? koishi_1.h.text(image)
                    : koishi_1.h.image(image, 'image/png');
        }
        catch (error) {
            this.ctx.logger.error(`为用户 ${userId} 执行画像分析时发生错误:`, error);
            const errorMessage = error instanceof Error ? error.message : '未知错误。';
            message = koishi_1.h.text(`分析失败: ${errorMessage}。请检查服务状态或联系管理员。`);
        }
        await session.send(message);
    }
    async resolveGroupNickname(bot, guildId, userId) {
        if (!bot?.getGuildMember || !guildId || !userId)
            return null;
        const key = `${bot.selfId}:${guildId}:${userId}`;
        const cached = this._groupNicknameCache.get(key);
        if (cached) {
            if (cached.expireAt > Date.now())
                return cached.name;
            this._groupNicknameCache.delete(key);
        }
        try {
            const info = await bot.getGuildMember(guildId, userId);
            const name = (info?.name || info?.user?.name || '').trim();
            this._groupNicknameCache.set(key, {
                name: name || null,
                expireAt: Date.now() + (name ? 3600_000 : 60_000)
            });
            return name || null;
        }
        catch (error) {
            // 无权限或调用失败，缓存失败状态 60 秒，避免反复请求
            this._groupNicknameCache.set(key, { name: null, expireAt: Date.now() + 60_000 });
            return null;
        }
    }
    async lookupUserProfileFromMessages(platform, selfId, userId) {
        try {
            const records = await this.ctx.database
                .select('group_analysis_messages')
                .where({ platform, selfId, userId })
                .orderBy(($) => $.timestamp, 'desc')
                .limit(1)
                .execute();
            const latest = records[0];
            if (!latest)
                return null;
            return {
                username: latest.username || null,
                avatarUrl: latest.avatarUrl || null
            };
        }
        catch (error) {
            this.ctx.logger.debug(`从消息记录回退用户资料失败 (${platform}/${userId}): ${error}`);
            return null;
        }
    }
    async executeDailyComic(selfId, target, days) {
        const bot = this._getBot(selfId);
        const targetChannel = target.channelId ?? target.guildId;
        if (!targetChannel) {
            this.ctx.logger.warn('执行每日漫画需要提供 channelId 或 guildId。');
            return;
        }
        const sendStatus = async (content) => bot?.sendMessage(targetChannel, content, target.guildId);
        const lookbackDays = days ?? this.config.comicDays ?? 1;
        try {
            await sendStatus('正在生成今日群聊漫画，请稍候...');
            const messages = await this._getGroupHistoryFromMessageService(selfId, target, lookbackDays);
            if (messages.length < this.config.comicMinMessages) {
                await sendStatus(`消息数量（${messages.length}/${this.config.comicMinMessages}）不足以生成漫画，请稍后再试。`);
                return;
            }
            // 1. 提取话题
            const { allMessagesText } = (0, utils_1.calculateBasicStats)(messages);
            const messagesText = allMessagesText.join('\n');
            const topics = await this.ctx.group_analysis_llm.summarizeTopics(messagesText, null);
            if (!topics?.length) {
                await sendStatus('未能从群聊记录中提取到有效话题，无法生成漫画。');
                return;
            }
            // 2. 生成漫画分镜提示词
            const scene = await this.ctx.group_analysis_llm.analyzeComicStoryboards(topics);
            if (!scene) {
                await sendStatus('漫画分镜提示词生成失败，请检查日志。');
                return;
            }
            // 3. 调用生图 API 生成漫画
            const imageBuffer = await this.ctx.group_analysis_drawing.generateImage(scene);
            const mime = imageBuffer[0] === 0x89
                ? 'image/png'
                : imageBuffer[0] === 0xff
                    ? 'image/jpeg'
                    : 'image/png';
            await bot?.sendMessage(targetChannel, koishi_1.h.image(imageBuffer, mime), target.guildId);
            this.ctx.logger.info(`每日漫画生成并发送成功 (${target.guildId || target.channelId})，图片大小: ${imageBuffer.length} bytes。`);
        }
        catch (error) {
            this.ctx.logger.error(`为群组 ${target.guildId || target.channelId} 生成每日漫画失败:`, error);
            const errorMessage = error instanceof Error ? error.message : '未知错误。';
            await sendStatus(`漫画生成失败: ${errorMessage}`);
        }
    }
    async executeDailyComicForEnabledGroups() {
        const enabledGroups = this.config.listenerGroups.filter((group) => group.enabled);
        for (const group of enabledGroups) {
            try {
                await this.executeDailyComic(group.selfId, {
                    guildId: group.guildId,
                    channelId: group.channelId
                });
            }
            catch (err) {
                this.ctx.logger.error(`群 ${group.guildId || group.channelId} 自动漫画生成失败:`, err);
            }
        }
    }
    async analyzeGroupMessages(messages, selfId, target, context) {
        // 清洗原始协议标签、过滤官方 bot 签名等非聊天垃圾内容
        messages = (messages || [])
            .map((m) => {
            const content = (0, utils_1.cleanContent)(m.content);
            // If cleaning changed stored content, rebuild parsed elements too; otherwise
            // downstream text extraction can still read the uncleaned protocol markup.
            return {
                ...m,
                content,
                elements: content !== m.content ? koishi_1.h.parse(content) : m.elements
            };
        })
            .filter((m) => m.content && !(0, utils_1.isJunkMessage)(m.content));
        this.ctx.logger.info(`开始分析 ${messages.length} 条消息...`);
        const { userStats, totalChars, totalEmojiCount, allMessagesText } = (0, utils_1.calculateBasicStats)(messages);
        const messagesText = allMessagesText.join('\n');
        // ID 版消息文本：用 [user_id] 代替昵称，避免 emoji 昵称干扰 LLM；分析后按 ID 回填完整昵称。
        const idBasedMessagesText = messages
            .map((m) => {
            const sourceElements = Array.isArray(m.elements) && m.elements.length
                ? m.elements
                : koishi_1.h.parse(m.content || '');
            const text = koishi_1.h
                .select(sourceElements, 'text')
                .map((e) => e.attrs?.content || '')
                .join('')
                .trim();
            return text ? `[${m.userId ?? 'unknown'}]: ${text}` : null;
        })
            .filter(Boolean)
            .join('\n');
        // LLM analyses in parallel
        const users = Object.values(userStats);
        const [topics, userTitles, goldenQuotes] = await Promise.all([
            this.ctx.group_analysis_llm.summarizeTopics(idBasedMessagesText || messagesText, context),
            this.config.userTitleAnalysis
                ? this.ctx.group_analysis_llm.analyzeUserTitles(users, context)
                : Promise.resolve([]),
            this.ctx.group_analysis_llm.analyzeGoldenQuotes(idBasedMessagesText || messagesText, this.config.maxGoldenQuotes, context)
        ]).catch((error) => {
            this.ctx.logger.error('LLM analysis failed:', error);
            //  On LLM failure, return empty results to avoid crashing the entire analysis.
            return [
                [],
                [],
                []
            ];
        });
        // Final statistics
        const sortedUsers = users.sort((a, b) => b.messageCount - a.messageCount);
        // 群名片解析：官方 QQ bot 消息作者名是"个人昵称"，群名片需通过 getGuildMember 获取。
        // 只对活跃的 top 用户调用，且带缓存避免重复请求。
        const botForAvatar = this._getBot(selfId);
        const guildIdForNick = target?.guildId;
        const groupNicknameMap = new Map();
        if (botForAvatar?.getGuildMember && guildIdForNick) {
            const topUsers = sortedUsers.slice(0, Math.max(this.config.maxUsersInReport * 2, 20));
            await Promise.all(topUsers.map(async (u) => {
                const gname = await this.resolveGroupNickname(botForAvatar, guildIdForNick, String(u.userId));
                if (gname)
                    groupNicknameMap.set(String(u.userId), gname);
            }));
            if (groupNicknameMap.size)
                this.ctx.logger.info(`已获取 ${groupNicknameMap.size} 个群成员的群名片。`);
        }
        // 为用户补全真实头像：优先消息记录中的头像，其次按平台生成头像 URL。
        // 官方 QQ 机器人等平台下 userId 为 openid，不能直接使用 QQ 号头像接口。
        const avatarMap = new Map();
        for (const user of sortedUsers) {
            if (!user.avatar) {
                user.avatar = (0, utils_1.resolveUserAvatar)(botForAvatar, user.userId) || undefined;
            }
            avatarMap.set(String(user.userId), user.avatar || '');
        }
        // 昵称映射：统一用群名片作为显示名。LLM 生成的 sender/name 很可能是"个人昵称"，
        // 这里把个人昵称（含/不含 emoji）归一化后映射到群名片。
        const nicknameAvatarMap = new Map();
        const nicknameMap = new Map();
        for (const user of sortedUsers) {
            const rawName = user.nickname;
            const displayName = groupNicknameMap.get(String(user.userId)) || rawName;
            if (rawName) {
                const normRaw = (0, utils_1.normalizeNickname)(rawName);
                nicknameMap.set(normRaw || rawName, displayName);
                nicknameMap.set((0, utils_1.normalizeNickname)(displayName) || displayName, displayName);
            }
            if (user.avatar) {
                nicknameAvatarMap.set(rawName, user.avatar);
                const normRaw = (0, utils_1.normalizeNickname)(rawName);
                if (normRaw)
                    nicknameAvatarMap.set(normRaw, user.avatar);
            }
            // 保留个人昵称（供话题 chip 匹配），排行榜显示名仍使用群名片
            user.rawName = rawName;
            user.nickname = displayName;
        }
        // 话题：参与者/描述里的用户 ID（官方 bot 为 openid）回填为昵称，回填不到显示"群友"
        if (Array.isArray(topics)) {
            const topicIdToName = new Map();
            for (const msg of messages) {
                const un = msg.username ? String(msg.username) : '';
                if (msg.userId && un && un !== String(msg.userId) && !/^[0-9A-Fa-f]{16,}$/.test(un))
                    topicIdToName.set(String(msg.userId), un);
            }
            for (const [uid, gname] of groupNicknameMap) {
                if (gname)
                    topicIdToName.set(uid, gname);
            }
            const resolveTopicName = (raw) => {
                const sVal = String(raw || '').trim();
                // 形如 "昵称 ([openid])" / "昵称(openid)"：取昵称（昵称本身是 openid 时回填）
                const m = sVal.match(/^(.*?)\s*[（(]\s*\[?\s*([0-9A-Fa-f]{16,})\s*\]?\s*[）)]\s*$/);
                if (m) {
                    const nick = m[1].trim();
                    if (nick && !/^[0-9A-Fa-f]{16,}$/.test(nick))
                        return nick;
                    return topicIdToName.get(m[2]) || '群友';
                }
                // 纯 [openid] / openid
                const only = sVal.replace(/^[\[（(]+|[\]）)]+$/g, '').trim();
                if (/^[0-9A-Fa-f]{16,}$/.test(only))
                    return topicIdToName.get(only) || '群友';
                const cleaned = sVal.replace(/[\[\]()（）]/g, '').trim();
                if (topicIdToName.has(cleaned))
                    return topicIdToName.get(cleaned);
                if (nicknameMap.has(sVal))
                    return nicknameMap.get(sVal);
                const norm = (0, utils_1.normalizeNickname)(sVal);
                if (norm && nicknameMap.has(norm))
                    return nicknameMap.get(norm);
                if (/^[0-9A-Fa-f]{16,}$/.test(cleaned))
                    return '群友';
                return sVal;
            };
            topics.forEach((topic) => {
                if (!topic)
                    return;
                if (Array.isArray(topic.contributors)) {
                    topic.contributors = [...new Set(topic.contributors.map(resolveTopicName).filter(Boolean))];
                }
                // Keep raw IDs in detail: renderer resolves [user_id] to nickname/avatar capsules.
            });
        }
        // 用户称号：用真实昵称替换 LLM 生成的 name（保留 emoji），并补全头像
        if (Array.isArray(userTitles)) {
            userTitles.forEach((title) => {
                if (title && title.name) {
                    const normalized = (0, utils_1.normalizeNickname)(title.name);
                    const realName = nicknameMap.get(title.name) ||
                        (normalized ? nicknameMap.get(normalized) : '') ||
                        '';
                    if (realName)
                        title.name = realName;
                }
                if (title && !title.avatar) {
                    const tn = (0, utils_1.normalizeNickname)(title.name);
                    title.avatar = nicknameAvatarMap.get(title.name) || (tn ? nicknameAvatarMap.get(tn) : '') || avatarMap.get(String(title.id)) || '';
                }
            });
        }
        // 金句：LLM 输入用 [user_id]，这里按 ID 精确回填完整昵称（含 emoji），并补全头像。
        if (Array.isArray(goldenQuotes)) {
            // 官方 bot 的 userId 可能是 openid（长十六进制串），不能直接当昵称显示
            const isOpenId = (v) => { const x = String(v || '').trim(); if (!x) return false; if (/^\d+$/.test(x)) return false; return /^[0-9A-Fa-f]{16,}$/.test(x); };
            // id → 完整昵称（群名片优先，回退消息昵称；跳过 openid 形式）
            const idToNickname = new Map();
            for (const msg of messages) {
                const un = msg.username ? String(msg.username) : '';
                if (msg.userId && un && un !== String(msg.userId) && !isOpenId(un))
                    idToNickname.set(String(msg.userId), un);
            }
            for (const [uid, gname] of groupNicknameMap) {
                if (gname)
                    idToNickname.set(uid, gname);
            }
            goldenQuotes.forEach((quote) => {
                if (quote && quote.sender) {
                    const uid = String(quote.sender).replace(/[\[\]]/g, '').trim();
                    if (idToNickname.has(uid)) {
                        // LLM 返回的是 [user_id]，精确回填完整昵称（含 emoji）
                        quote.sender = idToNickname.get(uid);
                        if (!quote.avatar && avatarMap.has(uid))
                            quote.avatar = avatarMap.get(uid);
                    }
                    else {
                        // 兜底：LLM 可能返回了昵称，按归一化匹配
                        const normalized = (0, utils_1.normalizeNickname)(quote.sender);
                        const realName = nicknameMap.get(quote.sender) ||
                            (normalized ? nicknameMap.get(normalized) : '') ||
                            '';
                        if (realName)
                            quote.sender = realName;
                        else if (isOpenId(quote.sender))
                            quote.sender = '群友';
                        if (!quote.avatar) {
                            quote.avatar =
                                nicknameAvatarMap.get(quote.sender) ||
                                nicknameAvatarMap.get(normalized) ||
                                '';
                        }
                    }
                }
            });
        }
        const overallActiveHours = users.reduce((acc, user) => {
            for (const hour in user.activeHours) {
                acc[hour] = (acc[hour] || 0) + user.activeHours[hour];
            }
            return acc;
        }, {});
        const mostActiveHourEntry = Object.entries(overallActiveHours).sort((a, b) => b[1] - a[1])[0];
        const mostActiveHour = mostActiveHourEntry
            ? mostActiveHourEntry[0]
            : 'N/A';
        // Generate chart using the renderer service
        const activeHoursChartHtml = (0, utils_1.generateActiveHoursChart)(overallActiveHours);
        // 清理话题描述里 LLM 输出的"缺口说明/若信息不足"等元信息，避免出现在报告正文
        if (Array.isArray(topics)) {
            topics.forEach((t) => {
                if (t && typeof t.detail === 'string') {
                    t.detail = t.detail
                        .replace(/缺口说明[：:][\s\S]*$/g, '')
                        .replace(/若信息不足[\s\S]*$/g, '')
                        .trim();
                }
            });
        }
        const groupName = await this.resolveGroupName(selfId, target);
        const result = {
            totalMessages: messages.length,
            totalChars,
            totalParticipants: users.length,
            emojiCount: totalEmojiCount,
            mostActiveUser: sortedUsers[0] || null,
            mostActivePeriod: mostActiveHour !== 'N/A'
                ? `${mostActiveHour.padStart(2, '0')}:00 - ${String(parseInt(mostActiveHour) + 1).padStart(2, '0')}:00`
                : 'N/A',
            userStats: sortedUsers.slice(0, this.config.maxUsersInReport),
            // Keep the full identity map for topic [user_id] capsules; visible rankings remain capped.
            topicUserStats: sortedUsers.map((user) => ({
                userId: String(user.userId),
                nickname: user.nickname,
                rawName: user.rawName,
                avatar: user.avatar
            })),
            topics,
            userTitles,
            goldenQuotes,
            activeHoursChart: activeHoursChartHtml,
            activeHoursData: overallActiveHours,
            analysisDate: new Date().toLocaleDateString('zh-CN'),
            groupName
        };
        this.ctx.logger.info('消息分析完成。');
        return result;
    }
    _splitTextForSend(text, chunkSize = 2000) {
        const trimmed = text.trim();
        if (!trimmed)
            return [];
        if (trimmed.length <= chunkSize)
            return [trimmed];
        const chunks = [];
        let current = '';
        for (const line of trimmed.split('\n')) {
            if (line.length > chunkSize) {
                if (current) {
                    chunks.push(current);
                    current = '';
                }
                for (let i = 0; i < line.length; i += chunkSize) {
                    chunks.push(line.slice(i, i + chunkSize));
                }
                continue;
            }
            if (current && current.length + line.length + 1 > chunkSize) {
                chunks.push(current);
                current = line;
            }
            else {
                current = current ? `${current}\n${line}` : line;
            }
        }
        if (current)
            chunks.push(current);
        return chunks;
    }
    _getBot(selfId) {
        return this.ctx.bots.find((bot) => bot.selfId === selfId);
    }
}
exports.AnalysisService = AnalysisService;
//# sourceMappingURL=analysis.js.map
