// utils/setupManager.js

const db = require('./db');

module.exports = {
    // Get config or defaults if none exist
    async getConfig(guildId) {
        const val = await db.get(`config_${guildId}`);
        console.log(`[setupManager] getConfig for guild ${guildId}:`, val);
        return val || {
            groupId: null,
            premiumKey: null,
            roleBindings: [],
            verificationRoleId: null,
            unverifiedRoleId: null,
            bypassRoleId: null
        };
    },

    // Set the final config, clearing any pending entries
    async setConfig(guildId, config) {
        console.log(`[setupManager] setConfig called for guild ${guildId} with:`, config);
        await db.delete(`pendingSetup_${guildId}`);
        await db.delete(`pendingTransfer_${guildId}`);
        const result = await db.set(`config_${guildId}`, {
            groupId: config.groupId ?? null,
            premiumKey: config.premiumKey ?? null,
            roleBindings: config.roleBindings ?? [],
            verificationRoleId: config.verificationRoleId ?? null,
            unverifiedRoleId: config.unverifiedRoleId ?? null,
            bypassRoleId: config.bypassRoleId ?? null
        });
        console.log(`[setupManager] setConfig result for guild ${guildId}:`, result);
        return result;
    },

    // Merge partial updates into existing config
    async updateConfig(guildId, partial) {
        const existing = await this.getConfig(guildId);
        const merged = {
            groupId: partial.groupId ?? existing.groupId,
            premiumKey: partial.premiumKey ?? existing.premiumKey,
            roleBindings: partial.roleBindings ?? existing.roleBindings,
            verificationRoleId: partial.verificationRoleId ?? existing.verificationRoleId,
            unverifiedRoleId: partial.unverifiedRoleId ?? existing.unverifiedRoleId,
            bypassRoleId: partial.bypassRoleId ?? existing.bypassRoleId
        };
        return this.setConfig(guildId, merged);
    },

    // Pending setup entries
    async setPendingSetup(guildId, data) {
        console.log(`[setupManager] setPendingSetup for guild ${guildId}:`, data);
        return db.set(`pendingSetup_${guildId}`, data);
    },
    async getPendingSetup(guildId) {
        const val = await db.get(`pendingSetup_${guildId}`);
        console.log(`[setupManager] getPendingSetup for guild ${guildId}:`, val);
        return val || null;
    },
    async clearPendingSetup(guildId) {
        console.log(`[setupManager] clearPendingSetup for guild ${guildId}`);
        return db.delete(`pendingSetup_${guildId}`);
    },

    // Pending transfer entries (if used)
    async setPendingTransfer(guildId, data) {
        console.log(`[setupManager] setPendingTransfer for guild ${guildId}:`, data);
        return db.set(`pendingTransfer_${guildId}`, data);
    },
    async getPendingTransfer(guildId) {
        const val = await db.get(`pendingTransfer_${guildId}`);
        console.log(`[setupManager] getPendingTransfer for guild ${guildId}:`, val);
        return val || null;
    },
    async clearPendingTransfer(guildId) {
        console.log(`[setupManager] clearPendingTransfer for guild ${guildId}`);
        return db.delete(`pendingTransfer_${guildId}`);
    },

    // Find a guild already configured with this Roblox groupId
    async findGuildByGroupId(groupId) {
        const entries = await db.all();
        for (const { id, value } of entries) {
            if (typeof id === 'string' && id.startsWith('config_')) {
                const gid = id.slice('config_'.length);
                if (value && value.groupId === groupId) {
                    console.log(`[setupManager] findGuildByGroupId found guild ${gid} for groupId ${groupId}`);
                    return gid;
                }
            }
        }
        console.log(`[setupManager] findGuildByGroupId: none found for groupId ${groupId}`);
        return null;
    },

    async findPendingGuildByGroupId(groupId) {
        const entries = await db.all();
        for (const { id, value } of entries) {
            if (typeof id === 'string' && id.startsWith('pendingSetup_')) {
                const gid = id.slice('pendingSetup_'.length);
                if (value && value.groupId === groupId) {
                    console.log(`[setupManager] findPendingGuildByGroupId found guild ${gid} for groupId ${groupId}`);
                    return gid;
                }
            }
        }
        console.log(`[setupManager] findPendingGuildByGroupId: none found for groupId ${groupId}`);
        return null;
    },

    // Debug utilities
    async loadAllConfigs() {
        const out = [];
        const entries = await db.all();
        for (const { id, value } of entries) {
            if (typeof id === 'string' && id.startsWith('config_')) {
                const guildId = id.slice('config_'.length);
                out.push({ guildId, config: value });
            }
        }
        console.log('[setupManager] loadAllConfigs:', out);
        return out;
    },
    async loadAllPendingSetups() {
        const out = [];
        const entries = await db.all();
        for (const { id, value } of entries) {
            if (typeof id === 'string' && id.startsWith('pendingSetup_')) {
                const guildId = id.slice('pendingSetup_'.length);
                out.push({ guildId, pending: value });
            }
        }
        console.log('[setupManager] loadAllPendingSetups:', out);
        return out;
    },
    async isGroupConfigured(groupId) {
        const gid = await this.findGuildByGroupId(groupId);
        return gid !== null;
    }
};