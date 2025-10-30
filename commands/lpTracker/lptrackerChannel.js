import { SlashCommandBuilder } from 'discord.js';
import { updateData, insertData, getData } from '../../database/bddFunction.js';

export default {
    data: new SlashCommandBuilder()
        .setName('createrankchannel')
        .setDescription('Permet de définir le channel où vont être affichées les informations des games classées des comptes')
        .setDescription('enregistrés')
        .addStringOption(option =>
            option.setName('rankchannel')
                .setDescription('ID du salon où vont être affichées les informations')
                .setRequired(true)
        ),
    async execute(interaction) {
        let channelId = interaction.options.getString('rankchannel');
        let guildId = interaction.guild.id;

        try {
            // Vérifie si un channel existe déjà pour ce serveur
            let existing = await getData('lptracker_channels', { guild_id: guildId });
            let res;
            if (existing.length > 0) {
                // Mise à jour du channel pour ce serveur
                res = await updateData('lptracker_channels', { channel_id: channelId }, { guild_id: guildId });
            } else {
                // Insertion d'un nouveau channel pour ce serveur
                res = await insertData('lptracker_channels', { guild_id: guildId, channel_id: channelId });
            }

            if (res !== 0) {
                await interaction.reply('Channel enregistré avec succès.');
            } else {
                await interaction.reply(`Problème avec l\'initialisation du channel.`);
            }
        } catch (error) {
            console.error(`Erreur dans lpTrackerChannel:`, error);
            await interaction.reply({
                content: "Une erreur est survenue lors de la création du channel.",
                ephemeral: true
            });
        }
    }
};


