// utils/permManager.js
const { QuickDB } = require('quick.db');
const db = new QuickDB({ filePath: './data.sqlite' });

module.exports = {
    /**
     * Restituisce l'owner custom (se già salvato), altrimenti salva e restituisce
     * il vero guild.ownerId la prima volta che viene chiamato.
     * @param {string} guildId
     * @param {string} guildOwnerId
     * @returns {Promise<string>}
     */
    async getOwner(guildId, guildOwnerId) {
        let owner = await db.get(`owner_${guildId}`);
        if (!owner) {
            await db.set(`owner_${guildId}`, guildOwnerId);
            return guildOwnerId;
        }
        return owner;
    },

    /** Sovrascrive l'owner custom per questo server */
    async setOwner(guildId, userId) {
        await db.set(`owner_${guildId}`, userId);
    },

    /** Restituisce il rank numerico di un utente in un server (0–3) */
    async getRank(guildId, userId) {
        return (await db.get(`rank_${guildId}_${userId}`)) ?? 0;
    },

    /** Imposta il rank numerico di un utente (0–3) */
    async setRank(guildId, userId, rank) {
        await db.set(`rank_${guildId}_${userId}`, rank);
    },

    /** Controlla se un utente ha almeno un certo rank */
    async hasRank(guildId, userId, minRank = 0) {
        const r = await this.getRank(guildId, userId);
        return r >= minRank;
    },

    /** Etichette */
    RANKS: {
        MEMBER: 0,
        OFFICER: 1,
        HICOM: 2,
        OWNER: 3
    }
};