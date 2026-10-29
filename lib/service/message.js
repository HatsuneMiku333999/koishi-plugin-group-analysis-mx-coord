"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageService = void 0;
const koishi_1 = require("koishi");
const utils_1 = require("../utils");
const cqcode_1 = require("../onebot/cqcode");
class MessageService extends koishi_1.Service {
    config;
    messageCache = new Map();
    cacheSize = 1000;
    cacheExpiration = 1000 * 60 * 24; // 1 days
    messageHandlers = [];
    activityStats = new Map();
    persistenceBuffers = new Map();
    activityWindowMs = 60 * 1000;
    highActivityThreshold = 30;
    bufferFlushSize = 50;
    bufferIdleFlushMs = 30 * 1000;
    bufferSweepIntervalMs = 30 * 1000;
    constructor(ctx, config) {
        super(ctx, 'group_analysis_message', true);
        this.config = config;
        this.setupDatabase();
        this.setupMessageListener();
        this.setupCacheCleanup();
        this.setupPersistenceTasks();
    }
    onUserMessage(handler) {
        this.messageHandlers.push(handler);
    }
    setupDatabase() {
        this.ctx.database.extend('group_analysis_messages', {
            id: 'string',
            platform: 'string',
            selfId: 'string',
            channelId: 'string',
            guildId: { type: 'string', nullable: true },
            userId: 'string',
            username: 'string',
            content: 'text',
            avatarUrl: 'string',
            timestamp: 'timestamp',
            messageId: { type: 'string', nullable: true }
        }, { primary: 'id' });
    }
    setupMessageListener() {
        this.ctx.on('message', async (session) => {
            if (this.shouldListenToMessage(session)) {
                await this.handleMessage(session);
            }
        });
    }
    shouldListenToMessage(session) {
        // TODO: private message
        const result = (0, utils_1.shouldListenToMessage)({
            guildId: session.guildId || undefined,
            channelId: session.channelId || undefined,
            platform: session.platform,
            selfId: session.selfId
        }, this.config.listenerGroups, this.config.enableAllGroupsByDefault);
        if (!result) {
            // 帮助定位"消息未被记录/画像消息为 0"的问题
            this.ctx.logger.debug(`消息未计入统计 (platform=${session.platform}, selfId=${session.selfId}, guildId=${session.guildId}, channelId=${session.channelId})，请检查"监听群组"配置（需与机器人实际平台/ID 一致）。`);
        }
        return result;
    }
    async handleMessage(session) {
        // 黑名单用户的消息完全不记录、不参与统计
        if (this.config.personaBlacklist?.includes(session.userId)) {
            return;
        }
        // 清洗掉官方 bot 的原始表情/协议标签，只保留正常文字
        const cleanContent = (0, utils_1.cleanContent)(session.content);
        // 腾讯官方 bot 的签名等非聊天垃圾内容，不记录
        if ((0, utils_1.isJunkMessage)(cleanContent) || !cleanContent) {
            return;
        }
        const uniqueId = session.messageId
            ? `${session.platform}_${session.messageId}`
            : `${session.platform}_${session.selfId}_${session.channelId}_${Date.now()}_${Math.random()
                .toString(36)
                .substring(2, 9)}`;
        const storedMessage = {
            id: uniqueId,
            platform: session.platform,
            selfId: session.selfId,
            channelId: session.channelId || '0',
            guildId: session.guildId || '0',
            userId: session.userId,
            avatarUrl: session.event.user?.avatar || '',
            // 用户昵称可能存在事件缺失（如官方 QQ bot 作者未返回 username），做多级兜底
            username: session.username || session.event?.user?.name || session.userId || '未知用户',
            content: cleanContent,
            timestamp: new Date(session.timestamp),
            messageId: session.messageId
        };
        // Add to local cache
        this.addToCache(storedMessage);
        await this.persistIncomingMessage(session, storedMessage);
        // Notify all registered handlers
        for (const handler of this.messageHandlers) {
            try {
                await handler(session);
            }
            catch (error) {
                this.ctx.logger.warn('Message handler error:', error);
            }
        }
    }
    addToCache(message) {
        const cacheKey = `${message.platform}_${message.guildId || message.channelId}`;
        let messages = this.messageCache.get(cacheKey) || [];
        messages.unshift(message);
        // Keep only recent messages in cache
        if (messages.length > this.cacheSize) {
            messages = messages.slice(0, this.cacheSize);
        }
        this.messageCache.set(cacheKey, messages);
    }
    setupCacheCleanup() {
        // Clean up expired cache entries every 5 minutes
        this.ctx.setInterval(() => {
            const now = Date.now();
            for (const [key, messages] of this.messageCache.entries()) {
                const validMessages = messages.filter((msg) => now - msg.timestamp.getTime() < this.cacheExpiration);
                if (validMessages.length === 0) {
                    this.messageCache.delete(key);
                }
                else if (validMessages.length !== messages.length) {
                    this.messageCache.set(key, validMessages);
                }
            }
        }, 5 * 60 * 1000);
    }
    setupPersistenceTasks() {
        this.ctx.setInterval(async () => {
            await this.flushIdleBuffers();
        }, this.bufferSweepIntervalMs);
        this.ctx.on('dispose', async () => {
            this.flushAllBuffers();
        });
        const retentionDays = this.config.retentionDays;
        if (retentionDays === 0) {
            return;
        }
        const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
        this.ctx.setInterval(async () => {
            const cutoff = new Date(Date.now() - retentionMs);
            const removalQuery = {
                timestamp: { $lt: cutoff }
            };
            await this.ctx.database
                .remove('group_analysis_messages', removalQuery)
                .catch((error) => this.ctx.logger.warn('Failed to cleanup expired cached messages:', error));
        }, 6 * 60 * 60 * 1000);
    }
    async getBotAPIHistoricalMessages(filter, bot) {
        const logger = this.ctx.logger;
        const targetId = filter.channelId || filter.guildId;
        if (!targetId) {
            logger.warn('Bot API historical messages require channelId or guildId');
            return [];
        }
        const limit = filter.limit || 100;
        const startTime = filter.startTime || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default 1 day
        const endTime = filter.endTime || new Date();
        const allMessages = [];
        let fetchedCount = 0;
        let queryRounds = 0;
        let nextId;
        try {
            while (fetchedCount < limit) {
                const messageList = await bot.getMessageList(targetId, nextId, 'before');
                if (!messageList?.data?.length)
                    break;
                queryRounds++;
                const batch = messageList.data.map((msg) => ({
                    id: `${bot.platform}_${bot.selfId}_${targetId}_${msg.id}`,
                    platform: bot.platform,
                    selfId: bot.selfId,
                    channelId: filter.channelId,
                    guildId: msg.guild?.id ?? filter.guildId,
                    userId: msg.user.id,
                    username: msg.member?.name ?? msg.user.name ?? msg.user.nick,
                    content: msg.content,
                    timestamp: new Date(msg.createdAt ?? msg.timestamp),
                    messageId: msg.id,
                    avatarUrl: msg.user.avatar || '',
                    elements: koishi_1.h.parse(msg.content).concat(msg.quote
                        ? (0, koishi_1.h)('quote', {
                            id: msg.quote.id,
                            userId: msg.quote.user.id,
                            name: msg.quote.user.name
                        }, msg.quote.elements)
                        : [])
                }));
                const validMessages = batch.filter((msg) => {
                    const withinTimeRange = msg.timestamp >= startTime && msg.timestamp <= endTime;
                    const matchesUser = !filter.userId ||
                        filter.userId.length < 1 ||
                        filter.userId.includes(msg.userId);
                    const hitFilterContent = !this.config.wordsFilter.some((word) => msg.content.includes(word) /* ||
                        msg.username.includes(word) */);
                    // Apply purpose-based filtering
                    let purposeFilter = true;
                    if (filter.purpose === 'group-analysis') {
                        // Filter out users in userFilter for group analysis
                        purposeFilter = !this.config.userFilter.includes(msg.userId);
                    }
                    else if (filter.purpose === 'user-persona') {
                        // Filter out users in personaUserFilter for user persona
                        purposeFilter = !this.config.personaUserFilter.includes(msg.userId);
                    }
                    // 黑名单用户的消息一律排除
                    if (this.config.personaBlacklist?.includes(msg.userId)) {
                        purposeFilter = false;
                    }
                    return (withinTimeRange &&
                        matchesUser &&
                        hitFilterContent &&
                        purposeFilter);
                });
                allMessages.unshift(...validMessages);
                fetchedCount += validMessages.length;
                const oldestMsg = batch[0];
                if (oldestMsg.timestamp < startTime) {
                    logger.info(`群 ${targetId} [第 ${queryRounds} 轮] 获取了 ${validMessages.length} 条消息。最旧消息: ${oldestMsg.timestamp.toLocaleString()}`);
                    break;
                }
                nextId = messageList.prev || oldestMsg.messageId;
                if (fetchedCount >= limit || !nextId?.length) {
                    logger.info(`群 ${targetId} [第 ${queryRounds} 轮] 获取了 ${validMessages.length} 条消息。最旧消息: ${oldestMsg.timestamp.toLocaleString()}`);
                    break;
                }
            }
            return allMessages.slice(0, limit);
        }
        catch (error) {
            logger.error('Failed to fetch Bot API historical messages:', error);
            if (!this.config.alwaysPersistMessages) {
                logger.info('获取历史消息失败，建议启用消息持久化功能以降低对平台历史接口的依赖。');
            }
            return [];
        }
    }
    async getHistoricalMessages(filter) {
        const botFromSelfId = filter.selfId
            ? this.ctx.bots.find((b) => b.selfId === filter.selfId)
            : undefined;
        const inferred = (0, utils_1.inferPlatformInfo)(filter, this.config.listenerGroups);
        const platform = inferred.platform || botFromSelfId?.platform;
        const selfId = inferred.selfId || filter.selfId;
        const bot = this.ctx.bots.find((b) => b.platform === platform && b.selfId === selfId);
        if (this.config.alwaysPersistMessages) {
            this.ctx.logger.info('使用数据库历史消息获取功能。');
            return this.getDatabaseHistoricalMessages(filter).then((messages) => {
                return messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            });
        }
        if (platform === 'onebot') {
            this.ctx.logger.info('使用 OneBot 历史消息获取功能。');
            return this.getOneBotHistoricalMessages(filter).then((messages) => {
                return messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            });
        }
        if (bot?.['getMessageList']) {
            this.ctx.logger.info('使用 Bot API 历史消息获取功能。');
            return this.getBotAPIHistoricalMessages(filter, bot);
        }
        this.ctx.logger.warn('未找到可用的适配器，将使用数据库历史消息获取功能。');
        return this.getDatabaseHistoricalMessages(filter);
    }
    async getOneBotHistoricalMessages(filter) {
        const logger = this.ctx.logger;
        const targetId = filter.guildId || filter.channelId;
        if (!targetId) {
            logger.warn('OneBot historical messages require guildId or channelId');
            return [];
        }
        const bot = this.ctx.bots.find((b) => b.platform === 'onebot' &&
            b.selfId === (filter.selfId ?? b.selfId));
        if (!bot || bot.platform !== 'onebot') {
            logger.warn('No OneBot instance found');
            return [];
        }
        const { isRunningNapCat, botAppName } = await (0, utils_1.isNapCatBot)(bot);
        logger.info(`是否运行在 NapCat: ${isRunningNapCat}, 具体的 OneBot 实例: ${botAppName}`);
        const messages = [];
        const limit = filter.limit || 100;
        const startTime = filter.startTime || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default 1 day
        const endTime = filter.endTime || new Date();
        let messageSeq;
        let messageId;
        let fetchedCount = 0;
        let queryRounds = 0;
        let oldestMsg = null;
        try {
            while (fetchedCount < limit) {
                const requestPackage = {
                    group_id: Number(targetId),
                    message_seq: messageSeq,
                    // message id: /lagrange
                    message_id: messageId,
                    count: 50,
                    reverseOrder: typeof messageSeq === 'number'
                };
                if (!isRunningNapCat) {
                    delete requestPackage.reverseOrder;
                    requestPackage.count = 30;
                }
                if (messageSeq === undefined) {
                    delete requestPackage.message_id;
                    delete requestPackage.message_seq;
                }
                const result = await bot.internal
                    ._request('get_group_msg_history', requestPackage)
                    .then((result) => result.data);
                if (!result?.messages?.length) {
                    logger.info(`群 ${targetId} [第 ${queryRounds} 轮] 最旧消息: ${new Date((oldestMsg?.time || 0) * 1000).toLocaleString()}`);
                    break;
                }
                queryRounds++;
                const batch = result.messages;
                const validMessages = batch.filter((msg) => {
                    const msgTime = new Date(msg.time * 1000);
                    const withinTimeRange = msgTime >= startTime && msgTime <= endTime;
                    const userId = String(msg.sender?.user_id);
                    const matchesUser = !filter.userId ||
                        filter.userId.length < 1 ||
                        filter.userId.includes(userId);
                    const hitFilterContent = !this.config.wordsFilter.some((word) => msg.raw_message.includes(word) /* ||
                        msg.sender.nickname.includes(word) */);
                    // Apply purpose-based filtering
                    let purposeFilter = true;
                    if (filter.purpose === 'group-analysis') {
                        // Filter out users in userFilter for group analysis
                        purposeFilter = !this.config.userFilter.includes(userId);
                    }
                    else if (filter.purpose === 'user-persona') {
                        // Filter out users in personaUserFilter for user persona
                        purposeFilter =
                            !this.config.personaUserFilter.includes(userId);
                    }
                    // 黑名单用户的消息一律排除
                    if (this.config.personaBlacklist?.includes(userId)) {
                        purposeFilter = false;
                    }
                    return (withinTimeRange &&
                        matchesUser &&
                        hitFilterContent &&
                        purposeFilter);
                });
                messages.unshift(...validMessages);
                fetchedCount += validMessages.length;
                if ((batch?.[0]?.time || 0) * 1000 < startTime.getTime() ||
                    batch[0].time === oldestMsg?.time ||
                    batch.length === 0) {
                    logger.info(`群 ${targetId} [第 ${queryRounds} 轮] 获取了 ${validMessages.length} 条消息。最旧消息: ${new Date((batch[0]?.time || 0) * 1000).toLocaleString()}`);
                    break;
                }
                oldestMsg = batch[0];
                messageSeq = oldestMsg.message_seq;
                messageId = oldestMsg.message_id;
            }
            // Convert to StoredMessage format
            const results = messages.map((msg) => ({
                id: `onebot_${msg.message_id}`,
                platform: 'onebot',
                selfId: bot.selfId,
                channelId: targetId,
                guildId: filter.guildId,
                userId: String(msg.sender.user_id),
                username: msg.sender.nickname,
                content: msg.raw_message || '',
                avatarUrl: (0, utils_1.getAvatarUrl)(msg.sender.user_id),
                timestamp: new Date(msg.time * 1000),
                messageId: String(msg.message_id),
                elements: cqcode_1.CQCode.parse(msg.raw_message)
            }));
            return results;
        }
        catch (error) {
            logger.error('Failed to fetch OneBot historical messages:', error);
            if (!this.config.alwaysPersistMessages) {
                logger.info('OneBot 历史消息获取失败，建议启用消息持久化功能以降低接口调用失败的影响。');
            }
            return [];
        }
    }
    async getDatabaseHistoricalMessages(filter) {
        try {
            const query = {};
            if (filter.guildId)
                query.guildId = filter.guildId;
            if (filter.channelId)
                query.channelId = filter.channelId;
            if (filter.userId && filter.userId.length > 0)
                query.userId = {
                    $in: filter.userId
                };
            if (filter.startTime || filter.endTime) {
                query.timestamp = {};
                if (filter.startTime)
                    query.timestamp.$gte = filter.startTime;
                if (filter.endTime)
                    query.timestamp.$lte = filter.endTime;
            }
            // Apply purpose-based filtering
            if (filter.purpose === 'group-analysis' &&
                this.config.userFilter.length > 0) {
                // Exclude users in userFilter for group analysis
                query.userId = query.userId
                    ? {
                        $in: filter.userId.filter((userId) => !this.config.userFilter.includes(userId))
                    }
                    : { $nin: this.config.userFilter };
            }
            else if (filter.purpose === 'user-persona' &&
                this.config.personaUserFilter.length > 0) {
                // Exclude users in personaUserFilter for user persona
                query.userId = query.userId
                    ? {
                        $in: filter.userId.filter((userId) => !this.config.userFilter.includes(userId))
                    }
                    : { $nin: this.config.personaUserFilter };
            }
            // 黑名单用户的消息一律排除
            if (this.config.personaBlacklist?.length > 0) {
                const blacklist = this.config.personaBlacklist;
                query.userId = query.userId
                    ? { $in: filter.userId.filter((userId) => !blacklist.includes(userId)) }
                    : { $nin: blacklist };
            }
            const messages = await this.ctx.database
                .select('group_analysis_messages')
                .where(query)
                .offset(filter.offset ?? 0)
                .limit(filter.limit ?? 100)
                .orderBy(($) => $.timestamp, 'desc')
                .execute();
            return messages.map((message) => ({
                ...message,
                elements: koishi_1.h.parse(message.content)
            }));
        }
        catch (error) {
            this.ctx.logger.error('Failed to fetch database historical messages:', error);
            return [];
        }
    }
    getActivityStats(key, timestamp) {
        const now = timestamp.getTime();
        const stats = this.activityStats.get(key);
        if (!stats || now - stats.windowStart > this.activityWindowMs) {
            const fresh = { windowStart: now, count: 0 };
            this.activityStats.set(key, fresh);
            return fresh;
        }
        return stats;
    }
    async persistIncomingMessage(session, storedMessage) {
        if (this.config.alwaysPersistMessages) {
            await this.enqueueMessageForPersistence(storedMessage);
            return;
        }
        if (session.platform !== 'onebot' && !session.bot['getMessageList']) {
            await this.enqueueMessageForPersistence(storedMessage);
        }
    }
    async enqueueMessageForPersistence(message) {
        const key = (0, utils_1.buildMessagePersistenceKey)(message);
        const stats = this.getActivityStats(key, message.timestamp);
        stats.count += 1;
        if (stats.count < this.highActivityThreshold) {
            await this.flushPendingBuffer(key);
            await this.persistMessages([message]);
            return;
        }
        const buffer = this.persistenceBuffers.get(key) || {
            messages: [],
            lastMessageAt: 0
        };
        buffer.messages.push(message);
        buffer.lastMessageAt = Date.now();
        this.persistenceBuffers.set(key, buffer);
        if (buffer.messages.length >= this.bufferFlushSize) {
            await this.flushPendingBuffer(key);
        }
    }
    async flushPendingBuffer(key) {
        const buffer = this.persistenceBuffers.get(key);
        if (!buffer || buffer.messages.length === 0)
            return;
        const payload = buffer.messages.splice(0, buffer.messages.length);
        this.persistenceBuffers.delete(key);
        await this.persistMessages(payload);
    }
    async flushIdleBuffers() {
        const now = Date.now();
        const tasks = [];
        for (const [key, buffer] of this.persistenceBuffers.entries()) {
            if (buffer.messages.length === 0) {
                this.persistenceBuffers.delete(key);
                continue;
            }
            if (now - buffer.lastMessageAt >= this.bufferIdleFlushMs) {
                tasks.push(this.flushPendingBuffer(key));
            }
        }
        await Promise.allSettled(tasks);
        for (const [key, stats] of this.activityStats.entries()) {
            if (now - stats.windowStart > this.activityWindowMs) {
                this.activityStats.delete(key);
            }
        }
    }
    async flushAllBuffers() {
        const tasks = Array.from(this.persistenceBuffers.keys()).map((key) => this.flushPendingBuffer(key));
        await Promise.allSettled(tasks);
    }
    async persistMessages(messages) {
        if (!messages.length)
            return;
        try {
            await this.ctx.database.upsert('group_analysis_messages', messages);
        }
        catch (error) {
            this.ctx.logger.warn('Failed to store message in database:', error);
        }
    }
    getRecentMessages(guildId, channelId, limit = 100) {
        const platform = this.config.listenerGroups.find((l) => (!guildId || l.guildId === guildId) &&
            (!channelId || l.channelId === channelId))?.platform || 'unknown';
        const cacheKey = `${platform}_${guildId || channelId}`;
        const cached = this.messageCache.get(cacheKey) || [];
        return cached.slice(0, limit);
    }
    async getMessageStats(filter) {
        const messages = await this.getHistoricalMessages({
            ...filter,
            limit: 10000
        });
        const uniqueUsers = new Set(messages.map((m) => m.userId));
        const timestamps = messages.map((m) => m.timestamp).sort();
        return {
            totalCount: messages.length,
            userCount: uniqueUsers.size,
            timeRange: timestamps.length > 0
                ? {
                    start: timestamps[0],
                    end: timestamps[timestamps.length - 1]
                }
                : null
        };
    }
}
exports.MessageService = MessageService;
//# sourceMappingURL=message.js.map