// antiRaidManager.js
const { QuickDB } = require('quick.db');
const db = new QuickDB({ filePath: './data.sqlite' });
const { AuditLogEvent, PermissionsBitField } = require('discord.js');

// Utility delay
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Richiama su guildMemberAdd
async function handleAntiRaidJoin(member) {
    const guild = member.guild;
    const guildId = guild.id;

    const enabled = await db.get(`antiRaid_${guildId}.enabled`);
    if (!enabled) return false;

    // Carica configurazione
    const threshold = await db.get(`antiRaid_${guildId}.threshold`);
    const interval = await db.get(`antiRaid_${guildId}.interval`);
    const whitelistRoles = await db.get(`antiRaid_${guildId}.whitelistRoles`) || [];
    if (!threshold || !interval) return false;

    // Salva timestamp join
    const now = Date.now();
    let joins = await db.get(`antiRaid_${guildId}.lastJoins`) || [];
    // Rimuovi vecchi
    joins = joins.filter(j => now - j.ts <= interval * 1000);
    joins.push({ id: member.id, ts: now });
    await db.set(`antiRaid_${guildId}.lastJoins`, joins);

    // Conta solo membri non in whitelist
    let nonWhiteCount = 0;
    for (const j of joins) {
        try {
            const m = await guild.members.fetch(j.id);
            const hasWhitelist = m.roles.cache.some(r => whitelistRoles.includes(r.id));
            if (!hasWhitelist) nonWhiteCount++;
        } catch {
            // ignore fetch fail
        }
    }

    // Se soglia superata e non già in lockdown
    const lockdown = await db.get(`antiRaid_${guildId}.lockdown`);
    if (nonWhiteCount >= threshold && !lockdown) {
        await triggerLockdown(guild, joins);
        return true;
    }
    return false;
}

async function triggerLockdown(guild, joins) {
    const guildId = guild.id;
    await db.set(`antiRaid_${guildId}.lockdown`, true);

    // Carica dettagli config
    const action = await db.get(`antiRaid_${guildId}.action`);
    const timeoutDuration = await db.get(`antiRaid_${guildId}.timeoutDuration`);
    const quarantineRoleId = await db.get(`antiRaid_${guildId}.quarantineRoleId`);
    const logChannelId = await db.get(`antiRaid_${guildId}.logChannelId`);
    const whitelistRoles = await db.get(`antiRaid_${guildId}.whitelistRoles`) || [];
    const revokeInvites = await db.get(`antiRaid_${guildId}.revokeInvitesOnLockdown`);

    // 1) Revoke invites se abilitato
    if (revokeInvites) {
        try {
            const invites = await guild.invites.fetch();
            for (const invite of invites.values()) {
                try {
                    await invite.delete('Revoked during anti-raid lockdown');
                } catch { }
            }
        } catch (err) {
            console.warn('antiRaid: cannot fetch/delete invites:', err);
        }
    }

    // 2) Applicare azione sui join rilevati
    const results = [];
    for (const j of joins) {
        // fetch member
        let member;
        try {
            member = await guild.members.fetch(j.id);
        } catch {
            continue;
        }
        // skip whitelist
        if (member.roles.cache.some(r => whitelistRoles.includes(r.id))) continue;
        try {
            if (action === 'kick') {
                // batch con delay per rate limit
                await member.kick('Anti-raid auto-kick');
                results.push({ id: member.id, action: 'kicked', ok: true });
                await wait(500);
            } else if (action === 'timeout') {
                if (guild.members.me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                    await member.timeout(timeoutDuration * 1000, 'Anti-raid timeout');
                    results.push({ id: member.id, action: `timed out ${timeoutDuration}s`, ok: true });
                    await wait(300);
                } else {
                    results.push({ id: member.id, action: 'timeout_failed_no_perm', ok: false });
                }
            } else if (action === 'quarantine') {
                if (!quarantineRoleId) {
                    results.push({ id: member.id, action: 'quarantine_no_role', ok: false });
                } else {
                    // assegna ruolo quarantena
                    await member.roles.add(quarantineRoleId, 'Anti-raid quarantine');
                    results.push({ id: member.id, action: `quarantined <@&${quarantineRoleId}>`, ok: true });
                    await wait(300);
                }
            } else {
                results.push({ id: member.id, action: 'no_action_set', ok: false });
            }
        } catch (err) {
            results.push({ id: member.id, action: 'error', ok: false, error: err.message });
        }
    }

    // 3) Notifica in logChannel
    if (logChannelId) {
        try {
            const ch = await guild.channels.fetch(logChannelId);
            if (ch && ch.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setTitle('🚨 Anti-Raid: Lockdown Attivato')
                    .setDescription(`Rilevati ${joins.length} join in breve tempo. Azione: ${action}`)
                    .addFields(
                        { name: 'Soglia superata', value: `Threshold: verifica impostata`, inline: false },
                        { name: 'Lockdown', value: '⚠️ Attivo', inline: true }
                    )
                    .setColor('Red')
                    .setTimestamp();
                // aggiungi dettagli risultati
                let details = results.map(r => {
                    const mention = `<@${r.id}>`;
                    return `${mention}: ${r.action}${r.ok ? '' : ' (failed)'}`;
                }).join('\n');
                if (!details) details = 'Nessuna azione applicata (prob. whitelist o permessi mancanti).';
                embed.addFields({ name: 'Risultati', value: details.slice(0, 1024) });
                await ch.send({ embeds: [embed] });
            }
        } catch (err) {
            console.warn('antiRaid: cannot send log message:', err);
        }
    }
}

// Opzionale: monitor ban massivi, qui un esempio minimal
async function handleBanAdd(ban) {
    const guild = ban.guild;
    const guildId = guild.id;
    // Carica lista ruoli autorizzati a ban da configManager o altro. Qui esempio semplice:
    const allowedBanRoles = await db.get(`antiRaid_${guildId}.banAllowedRoles`) || [];
    // Fetch audit log per sapere executor
    try {
        const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
        const entry = logs.entries.first();
        if (entry) {
            const executor = entry.executor;
            const memberExec = await guild.members.fetch(executor.id).catch(() => null);
            if (memberExec) {
                const isAllowed = memberExec.roles.cache.some(r => allowedBanRoles.includes(r.id)) || executor.id === guild.ownerId;
                if (!isAllowed) {
                    // Alert in logChannel
                    const logChannelId = await db.get(`antiRaid_${guildId}.logChannelId`);
                    if (logChannelId) {
                        const ch = await guild.channels.fetch(logChannelId).catch(() => null);
                        if (ch && ch.isTextBased()) {
                            const embed = new EmbedBuilder()
                                .setTitle('⚠️ Ban non autorizzato rilevato')
                                .setDescription(`Utente <@${ban.user.id}> bannato da <@${executor.id}> che non è in whitelist ban.`)
                                .setColor('Orange')
                                .setTimestamp();
                            await ch.send({ embeds: [embed] });
                        }
                    }
                    // Potresti rimuovere permesso BanMembers dal ruolo di executor o alertare owner via DM.
                }
            }
        }
    } catch { }
}

module.exports = {
    handleAntiRaidJoin,
    handleBanAdd
};