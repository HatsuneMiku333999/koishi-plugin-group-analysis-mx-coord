"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateBasicStats = calculateBasicStats;
exports.buildPersonaRecordId = buildPersonaRecordId;
exports.generateTextReport = generateTextReport;
exports.getAvatarUrl = getAvatarUrl;
exports.resolveUserAvatar = resolveUserAvatar;
exports.normalizeNickname = normalizeNickname;
exports.formatUserStats = formatUserStats;
exports.formatGoldenQuotes = formatGoldenQuotes;
exports.formatUserTitles = formatUserTitles;
exports.formatTopics = formatTopics;
exports.generateActiveHoursChart = generateActiveHoursChart;
exports.renderTemplate = renderTemplate;
exports.shouldListenToMessage = shouldListenToMessage;
exports.inferPlatformInfo = inferPlatformInfo;
exports.getStartTimeByDays = getStartTimeByDays;
exports.normalizeArray = normalizeArray;
exports.preferArray = preferArray;
exports.finalizePersonaList = finalizePersonaList;
exports.normalizePersonaText = normalizePersonaText;
exports.formatMessagesForPersona = formatMessagesForPersona;
exports.formatPersonaForPrompt = formatPersonaForPrompt;
exports.mergePersona = mergePersona;
exports.isCacheExpiredByDays = isCacheExpiredByDays;
exports.isCacheExpiredByMinutes = isCacheExpiredByMinutes;
exports.buildGroupAnalysisCacheKey = buildGroupAnalysisCacheKey;
exports.buildMessagePersistenceKey = buildMessagePersistenceKey;
exports.isNapCatBot = isNapCatBot;
exports.isJunkMessage = isJunkMessage;
exports.cleanContent = cleanContent;
const koishi_1 = require("koishi");
const skins_1 = require("./skins");
function calculateBasicStats(messages) {
    const userStats = {};
    let totalChars = 0;
    let totalEmojiCount = 0;
    const allMessagesText = [];
    for (const msg of messages) {
        const userId = String(msg.userId);
        if (!userId)
            continue;
        if (!userStats[userId]) {
            userStats[userId] = getInitialUserStats(msg);
        }
        const stat = userStats[userId];
        // 持续更新头像：使用该用户最近一条带头像的消息
        if (msg.avatarUrl) {
            stat.avatar = msg.avatarUrl;
        }
        stat.messageCount++;
        stat.lastActive = new Date(Math.max(stat.lastActive.getTime(), msg.timestamp.getTime()));
        const hour = msg.timestamp.getHours();
        stat.activeHours[hour] = (stat.activeHours[hour] || 0) + 1;
        if (hour >= 0 && hour < 6) {
            stat.nightMessages++;
        }
        const elements = msg.elements || koishi_1.h.parse(msg.content);
        let pureText = '';
        for (const el of elements) {
            if (el.type === 'text') {
                pureText += el.attrs.content;
                // onebot 兼容，添加 reply
            }
            else if (el.type === 'quote' || el.type === 'reply') {
                stat.replyCount++;
            }
            else if (el.type === 'at') {
                stat.atCount++;
            }
            else if (el.type === 'face') {
                stat.emojiStats['face'] = (stat.emojiStats['face'] || 0) + 1;
                totalEmojiCount++;
            }
            else if (el.type === 'image' &&
                el.attrs.subType != null &&
                el.attrs.subType !== 0) {
                stat.emojiStats['sticker'] =
                    (stat.emojiStats['sticker'] || 0) + 1;
                totalEmojiCount++;
            }
        }
        if (pureText) {
            allMessagesText.push(`${msg.username}(${msg.userId}): ${pureText.trim()}`);
        }
        stat.charCount += pureText.length || msg.content.length;
        totalChars += pureText.length || msg.content.length;
    }
    for (const userId in userStats) {
        const stat = userStats[userId];
        stat.avgChars = stat.messageCount
            ? parseFloat((stat.charCount / stat.messageCount).toFixed(1))
            : 0;
        stat.nightRatio = stat.messageCount
            ? parseFloat((stat.nightMessages / stat.messageCount).toFixed(2))
            : 0;
        stat.replyRatio = stat.messageCount
            ? parseFloat((stat.replyCount / stat.messageCount).toFixed(2))
            : 0;
        stat.emojiRatio = stat.messageCount
            ? parseFloat((totalEmojiCount / stat.messageCount).toFixed(2))
            : 0;
    }
    return { userStats, totalChars, totalEmojiCount, allMessagesText };
}
function buildPersonaRecordId(platform, selfId, userId) {
    return `${platform}:${selfId}:${userId}`;
}
function getInitialUserStats(msg) {
    return {
        userId: String(msg.userId),
        nickname: msg.username,
        messageCount: 0,
        charCount: 0,
        avatar: msg.avatarUrl,
        lastActive: new Date(0),
        replyCount: 0,
        atCount: 0,
        emojiRatio: 0,
        emojiStats: {},
        nightRatio: 0,
        avgChars: 0,
        replyRatio: 0,
        nightMessages: 0,
        activeHours: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i, 0]))
    };
}
function generateTextReport(result) {
    let report = `📊 群聊分析报告 (${result.analysisDate})\n`;
    report += `群组: ${result.groupName}\n\n`;
    report += `总消息: ${result.totalMessages} | 参与人数: ${result.totalParticipants} | 总字数: ${result.totalChars} | 表情: ${result.emojiCount}\n`;
    report += `最活跃时段: ${result.mostActivePeriod}\n\n`;
    report += `💬 热门话题:\n`;
    if (result.topics?.length) {
        result.topics.forEach((t) => {
            report += `- ${t.topic} (参与者: ${t.contributors.join(', ')})\n  ${t.detail}\n`;
        });
    }
    else {
        report += '无明显话题\n';
    }
    report += `\n🏆 群友称号:\n`;
    if (result.userTitles?.length) {
        result.userTitles.forEach((t) => {
            report += `- ${t.name}: ${t.title} ${t.mbti && t.mbti !== 'N/A' ? `(${t.mbti})` : ''} - ${t.reason}\n`;
        });
    }
    else {
        report += '无特殊称号\n';
    }
    report += `\n💬 群圣经:\n`;
    if (result.goldenQuotes?.length) {
        result.goldenQuotes.forEach((q) => {
            report += `- "${q.content}" —— ${q.sender}\n  理由: ${q.reason}\n`;
        });
    }
    else {
        report += '无金句记录\n';
    }
    return report;
}
function getAvatarUrl(userId) {
    return `http://q1.qlogo.cn/g?b=qq&nk=${userId}&s=640`;
}
/**
 * 归一化昵称：去除 emoji、修饰符和空白，用于昵称匹配。
 * 用户昵称常含 emoji，LLM 返回的发送者/称号名可能不带 emoji，归一化后可正确匹配头像。
 */
function normalizeNickname(name) {
    if (!name)
        return '';
    return String(name)
        .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2B00}-\u{2BFF}\u{1F000}-\u{1F02F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '')
        .replace(/\s+/g, '')
        .trim();
}
/**
 * 按平台解析用户头像 URL。
 * - onebot: 使用 QQ 号头像接口（q1.qlogo.cn）
 * - qq（官方 QQ 机器人）: 使用 openid 头像模板 q.qlogo.cn/qqapp/{appid}/{openid}/640
 * - 其他平台: 返回 null，由调用方回退到事件头像或默认头像
 */
function resolveUserAvatar(bot, userId) {
    if (!bot || !userId)
        return null;
    if (bot.platform === 'onebot') {
        return getAvatarUrl(userId);
    }
    if (bot.platform === 'qq') {
        const appid = bot.config?.id;
        if (appid) {
            return `https://q.qlogo.cn/qqapp/${appid}/${userId}/640`;
        }
        return null;
    }
    return null;
}
function formatUserStats(userStats, skin = 'md3') {
    const renderer = skins_1.skinRegistry.getSafe(skin);
    return renderer.formatUserStats(userStats);
}
function formatGoldenQuotes(quotes, skin = 'md3') {
    const renderer = skins_1.skinRegistry.getSafe(skin);
    return renderer.formatGoldenQuotes(quotes);
}
function formatUserTitles(userTitles, skin = 'md3') {
    const renderer = skins_1.skinRegistry.getSafe(skin);
    return renderer.formatUserTitles(userTitles);
}
function formatTopics(topics, skin = 'md3') {
    const renderer = skins_1.skinRegistry.getSafe(skin);
    return renderer.formatTopics(topics);
}
function generateActiveHoursChart(activeHours, skin = 'md3') {
    const renderer = skins_1.skinRegistry.getSafe(skin);
    return renderer.generateActiveHoursChart(activeHours);
}
function renderTemplate(template, data) {
    return template.replace(/\$\{(.*?)\}/g, (_, key) => data[key] || '');
}
function shouldListenToMessage(session, listenerGroups, enableAllGroupsByDefault = false) {
    if (!session.guildId && !session.channelId)
        return false;
    if (enableAllGroupsByDefault)
        return true;
    return listenerGroups.some((listener) => {
        if (!listener.enabled ||
            listener.platform !== session.platform ||
            listener.selfId !== session.selfId) {
            return false;
        }
        const channelMatches = !!listener.channelId &&
            !!session.channelId &&
            listener.channelId === session.channelId;
        const guildMatches = !!listener.guildId &&
            !!session.guildId &&
            listener.guildId === session.guildId;
        return channelMatches || guildMatches;
    });
}
function inferPlatformInfo(filter, listenerGroups) {
    for (const listener of listenerGroups) {
        if ((!filter.guildId || listener.guildId === filter.guildId) &&
            (!filter.channelId || listener.channelId === filter.channelId)) {
            return {
                platform: listener.platform,
                guildId: filter.guildId || listener.guildId,
                channelId: filter.channelId || listener.channelId,
                selfId: listener.selfId
            };
        }
    }
    return {};
}
function getStartTimeByDays(days) {
    const now = new Date();
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const targetTime = now.getTime() - (days - 1) * millisecondsPerDay;
    const startTime = new Date(targetTime);
    startTime.setHours(0, 0, 0, 0);
    return startTime;
}
function normalizeArray(value) {
    if (!value)
        return [];
    if (Array.isArray(value))
        return value;
    if (value === '无')
        return [];
    return value
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
}
function preferArray(primary, fallback) {
    const primaryList = primary?.filter(Boolean) || [];
    if (primaryList.length)
        return primaryList;
    return fallback?.filter(Boolean) || [];
}
function finalizePersonaList(list) {
    return list.length ? list : '无';
}
function normalizePersonaText(text) {
    return text ? text.replace(/\s+/g, ' ').trim() : '';
}
function formatMessagesForPersona(messages) {
    return messages
        .map((message) => {
        const time = message.timestamp
            .toISOString()
            .replace('T', ' ')
            .slice(0, 16);
        const scope = message.guildId
            ? `群:${message.guildId}`
            : `频道:${message.channelId}`;
        const normalized = normalizePersonaText(koishi_1.h
            .select(message.elements, 'text')
            .map((text) => text.attrs.content)
            .join(''));
        const referenceId = message.messageId || message.id;
        const referenceLabel = referenceId
            ? `msgid:${referenceId}`
            : `msgid:${message.id}`;
        return `[${time}] ${scope} ${message.username} <${referenceLabel}>: ${normalized}`;
    })
        .join('\n');
}
function formatPersonaForPrompt(persona) {
    if (!persona)
        return '（无历史画像）';
    const lines = [];
    lines.push(`summary: ${persona.summary || '无'}`);
    lines.push(`keyTraits: ${(persona.keyTraits || []).join('; ') || '无'}`);
    lines.push(`interests: ${(persona.interests || []).join('; ') || '无'}`);
    lines.push(`communicationStyle: ${persona.communicationStyle || '未知'}`);
    if (!persona.evidence || !persona.evidence.length) {
        lines.push('evidence: 无');
    }
    else {
        lines.push('evidence:');
        persona.evidence.forEach((item) => {
            lines.push(`    quote: ${item || '（空）'}`);
        });
    }
    return lines.join('\n');
}
function mergePersona(previous, current) {
    if (!previous)
        return current;
    return {
        ...previous,
        ...current,
        keyTraits: preferArray(current.keyTraits, previous.keyTraits),
        interests: preferArray(current.interests, previous.interests),
        evidence: preferArray(current.evidence, previous.evidence),
        lastMergedFromHistory: true
    };
}
function isCacheExpiredByDays(lastAnalysisAt, ttlDays) {
    if (ttlDays <= 0)
        return true;
    if (!lastAnalysisAt)
        return true;
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    return Date.now() - lastAnalysisAt.getTime() > ttlMs;
}
function isCacheExpiredByMinutes(lastAnalysisAt, ttlMinutes) {
    if (ttlMinutes <= 0)
        return true;
    if (!lastAnalysisAt)
        return true;
    const ttlMs = ttlMinutes * 60 * 1000;
    return Date.now() - lastAnalysisAt.getTime() > ttlMs;
}
function buildGroupAnalysisCacheKey(selfId, target, days) {
    const targetId = target.guildId
        ? `guild:${target.guildId}`
        : `channel:${target.channelId}`;
    return `${selfId}:${targetId}:${days}`;
}
function buildMessagePersistenceKey(message) {
    const scope = message.guildId || message.channelId || 'global';
    return `${message.platform}_${message.selfId}_${scope}`;
}
async function isNapCatBot(bot) {
    if (bot.platform !== 'onebot') {
        return { isRunningNapCat: false, botAppName: '' };
    }
    const onebot = bot;
    const versionInfo = await onebot.internal._request('get_version_info', {});
    const name = versionInfo.data['app_name'].toLowerCase();
    return { isRunningNapCat: name.includes('napcat'), botAppName: name };
}
/**
 * 判断消息是否为非聊天的垃圾内容（腾讯官方 bot 的 ROBOT1.0_ 签名、超长无空白 token 串等）。
 * 这类内容不应存入消息库，也不应参与分析。
 */
function isJunkMessage(content) {
    if (content === null || content === undefined)
        return false;
    const s = String(content).trim();
    if (!s)
        return false;
    // 腾讯 QQ 官方机器人消息签名（任意位置出现都过滤）
    if (/ROBOT1\.0_/.test(s))
        return true;
    // 超长且无空白的 sign/token 串（正常聊天不会这样）
    if (s.length > 150 && !/\s/.test(s) && /^[A-Za-z0-9+/=_.!-]+$/.test(s))
        return true;
    return false;
}
/**
 * 清洗消息内容：移除 QQ 官方 bot 的原始协议标签（<faceType=...>、<@...>、<#...> 等），只保留正常文字。
 */
function cleanContent(content) {
    if (content === null || content === undefined)
        return '';
    let s = String(content);
    // 官方表情原始标签（含 faceId/ext）
    s = s.replace(/<faceType=[^>]*>/gi, '');
    s = s.replace(/<faceId=[^>]*>/gi, '');
    // @ 提及 / 频道等原始标签
    s = s.replace(/<@[^>]*>/g, '');
    s = s.replace(/<#[^>]*>/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
}
//# sourceMappingURL=utils.js.map