// commands/update.js

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const noblox = require('noblox.js');
const setupManager = require('../utils/setupManager');
const xpDb = require('../xpManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('update')
        .setDescription('Sync Discord roles based on premium & Roblox rank/verification')
        .addStringOption(opt =>
            opt
                .setName('roblox')
                .setDescription('Roblox username to update (default = your linked account)')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply();
            const member = interaction.member;
            const guildId = interaction.guildId;
            const discordId = interaction.user.id;

            if (!member || !interaction.guild) {
                return interaction.editReply('❌ This command must be run in a server.');
            }

            // Environment-provided role IDs
            const PREMIUM_ROLE_ID = process.env.DISCORD_PREMIUM_ROLE_ID;
            const LIFETIME_ROLE_ID = process.env.DISCORD_LIFETIME_ROLE_ID;
            const EARLY_ACCESS_ROLE_ID = process.env.DISCORD_EARLY_ACCESS_ROLE_ID;

            // The server in which premium roles should be granted
            const PREMIUM_SERVER_ID = '1143513693091528824';

            // 1) Check global premium status
            const isPremium = await xpDb.isPremiumUser(discordId).catch(() => false);

            // 2) Prepare trackers
            const rolesAdded = [];
            const rolesRemoved = [];

            // 3) Remove any existing premium/lifetime/early-access roles
            const allPremiumRoles = [PREMIUM_ROLE_ID, LIFETIME_ROLE_ID, EARLY_ACCESS_ROLE_ID].filter(Boolean);
            for (const roleId of allPremiumRoles) {
                if (member.roles.cache.has(roleId)) {
                    await member.roles.remove(roleId, 'Cleanup existing premium roles');
                    rolesRemoved.push(roleId);
                }
            }

            // 4) If user is premium AND is in the designated server, assign the correct roles
            if (isPremium && guildId === PREMIUM_SERVER_ID) {
                // Determine plan to decide which roles to grant
                const planRecord = await xpDb.getGuildPremiumRecord(guildId, discordId).catch(() => null);

                if (planRecord && planRecord.plan === 'lifetime') {
                    // Lifetime: grant lifetime + premium + early access
                    for (const roleId of [LIFETIME_ROLE_ID, PREMIUM_ROLE_ID, EARLY_ACCESS_ROLE_ID]) {
                        if (roleId && !member.roles.cache.has(roleId)) {
                            await member.roles.add(roleId, 'Grant lifetime premium package');
                            rolesAdded.push(roleId);
                        }
                    }
                } else {
                    // Monthly or annual: grant only the premium role
                    if (PREMIUM_ROLE_ID && !member.roles.cache.has(PREMIUM_ROLE_ID)) {
                        await member.roles.add(PREMIUM_ROLE_ID, 'Grant standard premium');
                        rolesAdded.push(PREMIUM_ROLE_ID);
                    }
                }
            }

            // 5) Sync Roblox/group roles & verification (unchanged)
            const cfg = await setupManager.getConfig(guildId);
            if (!cfg?.groupId) {
                return interaction.editReply('❌ This server is not configured. Run `/setup` first.');
            }
            const { groupId, roleBindings = [], verificationRoleId, unverifiedRoleId } = cfg;

            // Determine which Roblox account to use
            let robloxName = interaction.options.getString('roblox');
            let targetDiscordId = discordId;
            if (robloxName) {
                const linked = await xpDb.getDiscordUserIdFromRobloxName(robloxName);
                if (linked) targetDiscordId = linked;
                else {
                    const allLinked = await xpDb.getAllLinked();
                    const found = allLinked.find(l => l.robloxName.toLowerCase() === robloxName.toLowerCase());
                    if (found) targetDiscordId = found.discordId;
                    else return interaction.editReply(`❌ No one linked to Roblox username \`${robloxName}\`. They must run \`/verify\`.`);
                }
            } else {
                robloxName = await xpDb.getLinked(targetDiscordId);
                if (!robloxName) {
                    return interaction.editReply('❌ You have not linked your Roblox account. Run `/verify` first.');
                }
            }

            // Fetch Roblox info
            await noblox.setCookie(process.env.ROBLOX_COOKIE).catch(() => { });
            const robloxUserId = await noblox.getIdFromUsername(robloxName)
                .catch(() => { throw new Error(`Could not find Roblox user \`${robloxName}\``); });
            const rank = await noblox.getRankInGroup(groupId, robloxUserId)
                .catch(err => { throw new Error(`Error fetching Roblox rank: ${err.message}`); });
            const groupRoles = await noblox.getRoles(groupId)
                .catch(err => { throw new Error(`Error fetching group roles: ${err.message}`); });
            const matchedRole = groupRoles.find(r => r.rank === rank) || null;
            const matchedName = matchedRole?.name || 'None';

            // Build sets for roles to add/remove
            const toAdd = new Set();
            const toRemove = new Set();

            // a) group-role binding
            const binding = roleBindings.find(b => b.groupRoleId === matchedRole?.id);
            if (binding) toAdd.add(binding.discordRoleId);

            // b) verification
            const isLinked = await xpDb.getLinked(targetDiscordId);
            if (verificationRoleId && isLinked) toAdd.add(verificationRoleId);

            // c) unverified removals
            const targetMember = await interaction.guild.members.fetch(targetDiscordId);
            for (const { discordRoleId } of roleBindings) {
                if (!toAdd.has(discordRoleId) && targetMember.roles.cache.has(discordRoleId)) {
                    toRemove.add(discordRoleId);
                }
            }
            if (unverifiedRoleId && targetMember.roles.cache.has(unverifiedRoleId)) {
                toRemove.add(unverifiedRoleId);
            }

            // Apply group & verification roles
            for (const rId of toAdd) {
                if (!targetMember.roles.cache.has(rId)) {
                    await targetMember.roles.add(rId, 'Sync group/verification role');
                    rolesAdded.push(rId);
                }
            }
            for (const rId of toRemove) {
                if (targetMember.roles.cache.has(rId)) {
                    await targetMember.roles.remove(rId, 'Remove outdated group/verification role');
                    rolesRemoved.push(rId);
                }
            }

            // Sync nickname
            if (targetMember.nickname !== robloxName) {
                await targetMember.setNickname(robloxName, 'Sync nickname to Roblox username').catch(() => { });
            }

            // 6) Build and send final embed
            const added = rolesAdded.length
                ? rolesAdded.map(r => `<@&${r}>`).join(' ')
                : 'None';
            const removed = rolesRemoved.length
                ? rolesRemoved.map(r => `<@&${r}>`).join(' ')
                : 'None';

            const embed = new EmbedBuilder()
                .setTitle('🔄 Update Completed')
                .setColor(0x5865f2)
                .addFields(
                    { name: 'Roblox User', value: `\`${robloxName}\``, inline: false },
                    { name: 'Discord Member', value: `<@${targetDiscordId}>`, inline: false },
                    { name: 'Group Role', value: matchedName, inline: false },
                    { name: 'Roles Added', value: added, inline: true },
                    { name: 'Roles Removed', value: removed, inline: true }
                )
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in /update:', error);
            const msg = `❌ ${error.message}`;
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply({ content: msg });
            } else {
                return interaction.reply({ content: msg });
            }
        }
    }
};