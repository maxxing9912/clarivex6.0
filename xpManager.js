// xpManager.js
const path = require('path');
const { QuickDB } = require('quick.db');

// Use a secure path in the current folder
const dbPath = path.join(__dirname, 'data.sqlite');
const db = new QuickDB({ filePath: dbPath });

module.exports = {
    // --- XP Management ---
    async addXP(userId, amount) {
        const key = `xp_${userId}`;
        const current = (await db.get(key)) || 0;
        const total = current + amount;
        await db.set(key, total);
        return total;
    },

    async removeXP(userId, amount) {
        const key = `xp_${userId}`;
        const current = (await db.get(key)) || 0;
        const total = Math.max(0, current - amount);
        await db.set(key, total);
        return total;
    },

    async setXP(userId, value) {
        const safeValue = Math.max(0, value);
        await db.set(`xp_${userId}`, safeValue);
        return safeValue;
    },

    async getXP(userId) {
        return (await db.get(`xp_${userId}`)) || 0;
    },

    async getAllXp() {
        const all = await db.all();
        return all
            .filter(r => r.id.startsWith('xp_'))
            .map(r => ({ userId: r.id.replace('xp_', ''), xp: r.value }));
    },

    // --- Warning Management (server-specific) ---
    async addWarning(userId, guildId, warning) {
        const key = `warns_${guildId}_${userId}`;
        const list = (await db.get(key)) || [];
        list.push(warning);
        await db.set(key, list);
        return list;
    },

    async removeWarning(userId, guildId, index) {
        const key = `warns_${guildId}_${userId}`;
        const list = (await db.get(key)) || [];
        if (index < 0 || index >= list.length) {
            throw new Error('Invalid warning index');
        }
        const [removed] = list.splice(index, 1);
        await db.set(key, list);
        return removed;
    },

    async getWarnings(userId, guildId) {
        return (await db.get(`warns_${guildId}_${userId}`)) || [];
    },

    // --- Badge Management (server-specific) ---
    async addBadge(userId, guildId, badgeName) {
        const key = `badges_${guildId}_${userId}`;
        const list = (await db.get(key)) || [];
        if (!list.includes(badgeName)) list.push(badgeName);
        await db.set(key, list);
        return list;
    },

    async removeBadge(userId, guildId, badgeName) {
        const key = `badges_${guildId}_${userId}`;
        const list = (await db.get(key)) || [];
        const idx = list.indexOf(badgeName);
        if (idx === -1) throw new Error('Badge not found');
        list.splice(idx, 1);
        await db.set(key, list);
        return list;
    },

    async getBadges(userId, guildId) {
        return (await db.get(`badges_${guildId}_${userId}`)) || [];
    },

    // --- Verification / Linking ---
    async setCode(userId, code) {
        await db.set(`verifCode_${userId}`, code);
    },

    async getCode(userId) {
        return await db.get(`verifCode_${userId}`);
    },

    async setTempUser(userId, robloxName) {
        await db.set(`tempUser_${userId}`, robloxName);
    },

    async getTempUser(userId) {
        return await db.get(`tempUser_${userId}`);
    },

    async clearTemp(userId) {
        await db.delete(`verifCode_${userId}`);
        await db.delete(`tempUser_${userId}`);
    },

    async linkRoblox(userId, robloxName) {
        await db.set(`link_${userId}`, robloxName);
    },

    async getLinked(userId) {
        return await db.get(`link_${userId}`);
    },

    async removeLink(userId) {
        await db.delete(`link_${userId}`);
    },

    async getAllLinked() {
        const all = await db.all();
        return all
            .filter(r => r.id.startsWith('link_'))
            .map(r => ({ discordId: r.id.replace('link_', ''), robloxName: r.value }));
    },

    async getDiscordUserIdFromRobloxName(robloxName) {
        const allLinks = await this.getAllLinked();
        const found = allLinks.find(
            link => link.robloxName.toLowerCase() === robloxName.toLowerCase()
        );
        return found ? found.discordId : null;
    },

    // --- XP Config Management (server-specific) ---
    /**
     * Retrieve XP configuration for a specific guild.
     * Returns { thresholds: [ { name: string, xp: number }, ... ] }
     */
    async getXPConfigForGuild(guildId) {
        return (await db.get(`xpConfig_${guildId}`)) || { thresholds: [] };
    },

    /**
     * Set or update XP configuration for a guild.
     * config must be { thresholds: [ { name, xp }, ... ] }
     */
    async setXPConfigForGuild(guildId, config) {
        await db.set(`xpConfig_${guildId}`, config);
        return config;
    },

    // --- Premium Management (global) ---
    async setPremiumUser(userId, value) {
        await db.set(`premiumUser_${userId}`, Boolean(value));
    },

    async isPremiumUser(userId) {
        const val = await db.get(`premiumUser_${userId}`);
        return Boolean(val);
    },

    // --- Server-specific Premium Management ---
    async setGuildPremium(guildId, userId, value = true) {
        await db.set(`premium_${guildId}_${userId}`, Boolean(value));
    },

    async isPremiumInGuild(guildId, userId) {
        return Boolean(await db.get(`premium_${guildId}_${userId}`));
    },

    // --- Wrapper compatibility ---
    async getRobloxId(userId) {
        return await db.get(`link_${userId}`);
    }
};