import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getData } from '../../database/bddFunction.js';

const rankList = ["","IV","III","II","I"];
const tierList = ["UNRANKED","IRON","BRONZE","SILVER","GOLD","PLATINUM","DIAMOND","MASTER","GRANDMASTER","CHALLENGER"];




export default {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Permet d\'afficher le leaderboard des parties classés des personnes enregistré'),
    async execute(interaction) {
        try {
            let accounts = await getData('lol_accounts');
            let users = await getData('discord_users');
            let leaderbord = await compare(accounts, users);
            await interaction.reply({embeds : [await createGameResultsEmbed(leaderbord)] })

        }catch(error){
            console.error("problème avec le leaderboard", error);
            await interaction.reply({
                content: "Une erreur est survenue lors de l'affichage du leaderboard.",
                ephemeral: true
            });
        }
    }
};

async function compare(accounts, users) {
    let leaderboard = [];
    for (let item of accounts) {
        let tierIndex = tierList.indexOf(item.tier);
        let rankIndex = rankList.indexOf(item.rank);
        if (tierIndex === -1 || rankIndex === -1) {
            console.error(`Invalid tier or rank for player ${item.gamename}: tier=${item.tier}, rank=${item.rank}`);
            continue; // Skip this item if tier or rank is invalid
        }
        //Trouver le pseudo discord associé
        let user = users.find(u => u.id === item.discord_user_id);
        let discordName = user ? user.discord_name : 'Unknown User';
        // Calculate the point based on tier and rank
        // Assuming the point is calculated as tier * 4 + rank, where tier is from 0 to 9 and rank is from 0 to 4
        // Example: UNRANKED = 0, IRON IV = 1, IRON III = 2, ..., CHALLENGER I = 36
        let point = (tierIndex * 4) + rankIndex;
        // Add the player to the leaderboard with their calculated points`;
        leaderboard.push({
            name : item.game_name,
            discord: discordName,
            point : point,
            tier : item.tier,
            rank : item.rank,
            lp : item.lp
        });
    }
    leaderboard.sort((a, b) =>  b.point - a.point || b.lp - a.lp); // Sort the leaderboard in descending order based on points
    return leaderboard;
}

async function createGameResultsEmbed(leaderboard){
    let embed = new EmbedBuilder()
    .setAuthor({
        name : `Leaderboard Solo/Duo queue`,
        iconURL: 'https://cdn.discordapp.com/attachments/1220074375093420142/1316399558108123177/ppDiscord.png?ex=675ae820&is=675996a0&hm=52a4de52b8f8e2cec96a0c6712b251cf121b67ed31f38f9a9af61108cd40d42f&',
    })
    .setTitle('Current leaderboard of tracked accounts')
    .setColor('#9300f5'); // Couleur de l'embed
    let iterator = 0;
    for (let personne of leaderboard) {
        iterator++;
        embed.addFields({ 
            name : `${iterator}`, 
            value:  `${personne.name}(${personne.tier} ${personne.rank} ${personne.lp})` , 
            inline: false 
        });
    }
    return embed;
}


//nombres.sort((a, b) => a - b); // Tri croissant
