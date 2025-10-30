import { SlashCommandBuilder } from 'discord.js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
import { insertData, getData } from '../../database/bddFunction.js';
const  riotAPIKey  = process.env.riotAPIKey;
const m_data = {
    discordname : '', 
    gamename :'', 
    tag :'', 
    puuid : '', 
    id :'', 
    accountid : '', 
    profileiconid : '', 
    revisiondate : '', 
    summonerlevel :'', 
    lastgameid : '', 
    lp :'', 
    rank:'', 
    tier :''
};


export default {
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('register a player with a discord account, it works one time')
        .addStringOption(option => 
            option.setName('discordaccount')
                .setDescription('The discord account')
                .setRequired(true)
        )
        .addStringOption(option => 
            option.setName('playername')
                .setDescription('The name of the player')
                .setRequired(true)
        )
        .addStringOption(option2 => 
            option2.setName('tag')
                .setDescription('The tag of the player')
                .setRequired(true)
        ),
    async execute(interaction) {
        let summonerName = interaction.options.getString('playername');
        let summonerTag = interaction.options.getString('tag');
        let discordId = interaction.user.id;
        let discordName = interaction.user.username;

        try {
            // Vérification si le pseudo discord est valide
            // 1 Vérifier ou insérer l'utilisateur discord 
            let users = await getData('discord_users', { discord_id: discordId });
            let discordUserId;
            if(users.length === 0) {
                await insertData('discord_users', { 
                    discord_id: discordId, 
                    discord_name: discordName 
                });
                users = await getData('discord_users', { discord_id: discordId });
            }
            discordUserId = users[0].id;

            // 2 Récupérer les infos lol 
            let summonerInfo = await getSummonerInfo(summonerName, summonerTag);
            if (!summonerInfo) {
                await interaction.reply('Impossible de trouver ce joueur.');
                return;
            }

            m_data.gamename = summonerInfo.gameName;
            m_data.tag = summonerInfo.tagLine;
            m_data.puuid = summonerInfo.puuid;

           /* const summonerOtherInfo = await getOtherSummonerInfo(m_data.puuid);

            if(!summonerOtherInfo){
                await interaction.reply('Impossible de trouver ce joueur.');
                return;
            }

            m_data.id = summonerOtherInfo.id;
            m_data.accountid = summonerOtherInfo.accountId;
            m_data.profileiconid = summonerOtherInfo.profileIconId;
            m_data.revisiondate = summonerOtherInfo.revisionDate;
            m_data.summonerlevel = summonerOtherInfo.summonerLevel;*/

            await getPlayerRankAndLp(m_data.puuid);
            await getLastGameID(m_data.puuid);

            //3 Insérer dans lol_accounts avec la clé étrangère discord_user_id
            const lolAccount = {
                discord_user_id: discordUserId,
                game_name: m_data.gamename,
                tag: m_data.tag,
                puuid: m_data.puuid,
                summoner_id: m_data.id,
                //account_id: m_data.accountid,
                //profile_icon_id: m_data.profileiconid,
                //summoner_level: m_data.summonerlevel,
                last_game_id: m_data.lastgameid,
                lp: m_data.lp,
                rank: m_data.rank,
                tier: m_data.tier
            };

            let res = await insertData('lol_accounts', lolAccount);
            if (res > 0) {
                await interaction.reply('Compte discord et lol bien associés.');
            } else {
                // Si l'insertion échoue, cela signifie que le compte est déjà associé
                await interaction.reply('Compte discord et lol déjà associés.');
            }
        } catch (error) {
            console.error('Erreur dans registerDiscordLol:', error);
            await interaction.reply({
                content : 'Une erreur est survenue lors de l\'association du compte.',
                ephemeral : true
            });
        }
    }
};

async function getSummonerInfo(summonerName, tag) {
    try {
        let response = await axios.get(`https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${summonerName}/${tag}?api_key=${riotAPIKey}`);
        return response.data;
    } catch (error) {
        console.error('Erreur lors de l\'appel à l\'API Riot dans la fonction getSummonerInfo', error);
        return null;
    }
}
/*async function getOtherSummonerInfo(puuid) {
    try {
        let response = await axios.get(`https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}?api_key=${riotAPIKey}`);
        return response.data[1];
    } catch (error) {
        console.error('Erreur lors de l\'appel à l\'API Riot dans la fonction getSummonerOtherInfo', error);
        return null;
    }
}*/

async function getPlayerRankAndLp(puuid) {
    
    try {
        let url = `https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}?api_key=${riotAPIKey}`;
        let response = await axios.get(url);
        let leagueEntries = response.data;

        // Filtrer pour les parties classées en solo/duo
        let soloQueue = leagueEntries.find(entry => entry.queueType === 'RANKED_SOLO_5x5');

        if (soloQueue) {
            m_data.lp = soloQueue.leaguePoints;
            m_data.rank = soloQueue.rank;
            m_data.tier = soloQueue.tier;           
        }else{
            m_data.lp = null;
            m_data.rank = "";
            m_data.tier = "UNRANKED";
        }
    } catch (error) {
        console.error('Erreur lors de la récupération des données :', error.message);
    }
}

async function getLastGameID(puuid){
    try {
        let responses = await axios.get(`https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?type=ranked&start=0&count=1&api_key=${riotAPIKey}`);
        let gameIDs = responses.data;
        if(!Array.isArray(gameIDs) || gameIDs.length === 0){
            m_data.lastgameid = "";
            return;
        }
        m_data.lastgameid = gameIDs[0];
    }catch(error){
        console.error('Erreur lors de la récupération des données :', error.message);
    }
}

