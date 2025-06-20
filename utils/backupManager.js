// utils/backupManager.js
const fs = require('fs');
const path = require('path');

module.exports = {
    async createBackup(guild) {
        const data = {
            roles: guild.roles.cache.map(r => ({
                name: r.name,
                color: r.color,
                permissions: r.permissions.bitfield.toString()  // Convert BigInt to string
            })),
            channels: guild.channels.cache.map(c => ({
                name: c.name,
                type: c.type,
                parentId: c.parentId,
                permissionOverwrites: c.permissionOverwrites.cache.map(o => o.toJSON())
            }))
        };

        // Ensure the backups directory exists
        const backupDir = path.join(__dirname, '..', 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const id = Date.now().toString();
        fs.writeFileSync(path.join(backupDir, `${id}.json`), JSON.stringify(data, null, 2));
        return id;
    },

    // restoreBackup(id, guild) { … }
};