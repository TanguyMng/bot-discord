import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getData } from '../../database/bddFunction.js';

export default {
    data: new SlashCommandBuilder()
        .setName('list')
        .setDescription('Permet d\'afficher les comptes enregistré'),
    async execute(interaction) {
        try {
            let accounts = await getData('lol_accounts');
            let users = await getData('discord_users');
            await interaction.reply({embeds : [await createGameResultsEmbed(accounts, users)] })
        }catch(error){
            console.error("problème avec le leaderboard", error);
            await interaction.reply({
                content: 'Une erreur est survenue lors de la récupération des informations du joueur.',
                ephemeral: true
            });
        }
    }
};

async function createGameResultsEmbed(accounts, users) {
    let embed = new EmbedBuilder()
    .setAuthor({
        name : `Leaderboard Solo/Duo queue`,
        iconURL: 'https://cdn.discordapp.com/attachments/1220074375093420142/1316399558108123177/ppDiscord.png?ex=675ae820&is=675996a0&hm=52a4de52b8f8e2cec96a0c6712b251cf121b67ed31f38f9a9af61108cd40d42f&',
    })
    .setTitle('list tracked accounts')
    .setColor('#9300f5'); // Couleur de l'embed
    for (let personne of accounts) {
        let user = users.find(u => u.id === personne.discord_user_id);
        let discordName = user ? user.discord_name : 'Unknown User';
        embed.addFields({ 
            name :`${personne.game_name}#${personne.tag}`,
            value: `Discord: ${discordName}`,
            inline: false 
        });
    }
    return embed;
}
