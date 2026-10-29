"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvatarUrl = getAvatarUrl;
/**
 * Get avatar URL for a user
 * @param userId User ID (QQ number)
 * @returns Avatar URL
 */
function getAvatarUrl(userId) {
    return `http://q1.qlogo.cn/g?b=qq&nk=${userId}&s=640`;
}
//# sourceMappingURL=types.js.map