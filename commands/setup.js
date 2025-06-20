// commands/setup.js

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    MessageFlags
} = require('discord.js');
const setupManager = require('../utils/setupManager');
const xpDb = require('../xpManager');
const noblox = require('noblox.js');

const PENDING_CHANNEL_ID = '1382426084028584047';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Create a pending setup request for your Roblox group')
        .addStringOption(opt =>
            opt
                .setName('groupid')
                .setDescription('Your Roblox Group ID (you must be the group owner)')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt
                .setName('premiumkey')
                .setDescription('(Optional) Premium serial key')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            // Defer reply as ephemeral (only visible to the user)
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            console.log(`[setup] Invoked by guild ${interaction.guildId}, user ${interaction.user.id}`);

            const guildId = interaction.guild.id;
            const userId = interaction.user.id;
            const channelId = interaction.channel.id;
            const groupId = interaction.options.getString('groupid');
            const premiumKey = interaction.options.getString('premiumkey') || null;

            // 1) Check if this Roblox group is already configured in another guild
            const otherGuild = await setupManager.findGuildByGroupId(groupId);
            if (otherGuild && otherGuild !== guildId) {
                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🚫 Group Already Configured')
                            .setDescription('This Roblox group is already configured in another server.')
                            .setColor(0xED4245)
                            .setTimestamp()
                    ]
                });
                return;
            }

            // 2) Check if there is a pending setup elsewhere
            const pendingElsewhere = await setupManager.findPendingGuildByGroupId(groupId);
            if (pendingElsewhere && pendingElsewhere !== guildId) {
                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🚫 Pending Setup Elsewhere')
                            .setDescription('A setup request for this group is already pending in another server.')
                            .setColor(0xED4245)
                            .setTimestamp()
                    ]
                });
                return;
            }

            // 3) Check if this guild is already configured
            const existingCfg = await setupManager.getConfig(guildId);
            if (existingCfg?.groupId) {
                if (existingCfg.groupId === groupId) {
                    await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('🚫 Already Configured')
                                .setDescription('This server is already configured with the same Roblox group.')
                                .setColor(0xED4245)
                                .setTimestamp()
                        ]
                    });
                } else {
                    await interaction.editReply({
                        content: '❌ This server is already configured with another group. Use `/transfer-group` to change.'
                    });
                }
                return;
            }

            // 4) Check if there is already a pending setup in this guild
            const existingPending = await setupManager.getPendingSetup(guildId);
            if (existingPending) {
                if (existingPending.groupId === groupId) {
                    await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('🚫 Pending Setup Exists')
                                .setDescription('You already have a pending setup request for this group.')
                                .setColor(0xED4245)
                                .setTimestamp()
                        ]
                    });
                } else {
                    await interaction.editReply({
                        content: '❌ You already have another pending setup. Use `/transfer-group` or wait for confirmation.'
                    });
                }
                return;
            }

            // 5) Fetch group info from Roblox and verify ownership
            let groupInfo;
            try {
                groupInfo = await noblox.getGroup(parseInt(groupId, 10));
            } catch {
                await interaction.editReply({
                    content: '❌ Unable to fetch group info. Check the Group ID.'
                });
                return;
            }
            const ownerId = groupInfo.owner?.userId;
            if (!ownerId) {
                await interaction.editReply({
                    content: '❌ Cannot determine the group owner.'
                });
                return;
            }

            // 6) Verify that the user has linked their Roblox account
            const linked = await xpDb.getLinked(userId);
            if (!linked) {
                await interaction.editReply({
                    content: '❌ You must first link your Roblox account with `/verify`.'
                });
                return;
            }
            let linkedId;
            try {
                linkedId = await noblox.getIdFromUsername(linked);
            } catch {
                await interaction.editReply({
                    content: '❌ Unable to verify your Roblox username. Retry linking.'
                });
                return;
            }
            if (linkedId !== ownerId) {
                await interaction.editReply({
                    content: '❌ You are not the owner of this Roblox group.'
                });
                return;
            }

            // 7) Save pending setup
            await setupManager.setPendingSetup(guildId, {
                groupId,
                premiumKey,
                ownerDiscordId: userId,
                invokingChannelId: channelId
            });

            // 8) Save final config immediately
            await setupManager.setConfig(guildId, {
                groupId,
                roleBindings: [],        // customize later
                verificationRoleId: null,
                unverifiedRoleId: null,
                bypassRoleId: null
            });

            // Verify immediately in memory
            const cfgAfter = await setupManager.getConfig(guildId);
            console.log(`[setup] Config immediately after setConfig for guild ${guildId}:`, cfgAfter);

            // 9) Reply to user
            const embedUser = new EmbedBuilder()
                .setTitle('⚙️ Setup Pending')
                .setDescription([
                    `**Group ID:** ${groupId}`,
                    premiumKey ? `**Premium Key:** \`${premiumKey}\`` : '_No premium key provided_',
                    '',
                    'Your setup request has been submitted. You will be notified when confirmed.'
                ].join('\n'))
                .setColor(0xffa500)
                .setTimestamp();

            await interaction.editReply({
                embeds: [embedUser]
            });

            // 10) Send a message in the pending channel for admins
            const confirmButton = new ButtonBuilder()
                .setCustomId(`confirm_join_${guildId}`)
                .setLabel('✅ Confirm Bot in Group')
                .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder().addComponents(confirmButton);

            const embedPending = new EmbedBuilder()
                .setTitle('🚧 Bot Join Request')
                .addFields(
                    { name: 'Server', value: `<#${channelId}>`, inline: true },
                    { name: 'User', value: `<@${userId}>`, inline: true },
                    { name: 'Group', value: `[${groupId}](https://www.roblox.com/groups/${groupId})`, inline: false },
                    {
                        name: '\u200B',
                        value: '⚠️ Add the bot to the group, then click “Confirm Bot in Group”.'
                    }
                )
                .setColor(0xFFA500)
                .setTimestamp();

            try {
                const pendingChannel = await interaction.client.channels.fetch(PENDING_CHANNEL_ID);
                if (pendingChannel?.isTextBased()) {
                    await pendingChannel.send({
                        embeds: [embedPending],
                        components: [row]
                    });
                } else {
                    console.error(`❌ PENDING_CHANNEL_ID (${PENDING_CHANNEL_ID}) is not a valid text channel.`);
                }
            } catch (sendErr) {
                console.error('Error sending to pending channel:', sendErr);
            }

        } catch (error) {
            console.error('Error in /setup:', error);
            if (interaction.deferred || interaction.replied) {
                try {
                    await interaction.editReply({ content: '❌ Internal error during setup.' });
                } catch (e) {
                    console.error('Error editReply in catch:', e);
                }
            } else {
                await interaction.reply({ content: '❌ Internal error during setup.', flags: MessageFlags.Ephemeral });
            }
        }
    }
};