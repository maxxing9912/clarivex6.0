// configManager.js
const { QuickDB } = require('quick.db');
const db = new QuickDB({ filePath: './config.sqlite' });

module.exports = {
    _key(guildId) {
        return `cfg_${guildId}`;
    },

    /** Save a field (e.g. “prefix” or “welcomeChannel”) in the guild’s config */
    async set(guildId, field, value) {
        const key = this._key(guildId);
        const cfg = (await db.get(key)) || {};
        cfg[field] = value;
        await db.set(key, cfg);
        return cfg;
    },

    /** Read a single config field (or undefined if missing) */
    async get(guildId, field) {
        const key = this._key(guildId);
        const cfg = (await db.get(key)) || {};
        return cfg[field];
    },

    /** Delete one config field */
    async remove(guildId, field) {
        const key = this._key(guildId);
        const cfg = (await db.get(key)) || {};
        delete cfg[field];
        await db.set(key, cfg);
        return cfg;
    },

    /** Return the entire config object for that guild */
    async getAll(guildId) {
        return (await db.get(this._key(guildId))) || {};
    }
};