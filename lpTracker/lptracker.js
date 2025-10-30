import {EmbedBuilder } from 'discord.js';
import axios from 'axios';
import { getData, updateData, insertData, deleteData } from '../database/bddFunction.js';

// On n'utilise plus channelId en dur, mais on va le chercher dans la table optimisée
async function getChannelForWriting(guildId) {
    // On cherche le channel lié à la guild courante
    let data = await getData('lptracker_channels', { guild_id: guildId });
    if (data.length > 0) {
        return data[0].channel_id;
    }
    return null;
}


//tableau avec toutes les valeurs que j'ai besoins pour le message 
function createMData(){
    return {
        pseudo :'', gameStatue :'', lp : '', lpGeneral :'', tier :'', rank :'', color :'', 
        kills :'', deaths :'', assists :'', champion :'', queue :'', wins :'', losses :'', 
        gameID :'', win :"", promotion:""
    };
}

async function trackingLp(client, riotKey) {
    let interval = 10000; // Intervalle en millisecondes (10 secondes)
    let Data = await getData('lol_accounts');
    console.log("vérification des dernières games jouées par les personnes inscrites");

        for (let item of Data) {
            item.puuid = await verifPuuid(item.game_name, item.tag, item.puuid, riotKey);
            let m_data = createMData();

            //item.id = summonner id;
            let played = await getPlayerLastSoloDuo(riotKey,item.puuid,item.last_game_id, m_data);
            if(played){
                m_data.pseudo = item.game_name + '#'+ item.tag;
                await getPlayerRankAndLp(item.puuid,riotKey,item.lp,item.tier, item.rank, m_data);
                await updateLastGameID(item.puuid, m_data.gameID, m_data.lpGeneral, m_data.rank, m_data.tier);
                await deleteData('lol_matches', {puuid: item.puuid, match_id: m_data.gameID}); // On supprime l'ancienne partie si elle existe
                await insertData('lol_matches', {
                                                puuid: item.puuid,
                                                match_id: m_data.gameID,
                                                queue_type: m_data.queue,
                                                champion: m_data.champion,
                                                kills: safeInt(m_data.kills),
                                                deaths: safeInt(m_data.deaths),
                                                assists: safeInt(m_data.assists),
                                                win: m_data.gameStatue === 'win',
                                                lp_change: safeInt(m_data.lp),
                                                tier: m_data.tier,
                                                rank: m_data.rank,
                                                played_at: new Date()
                });
                
                 // On va chercher le bon channel pour la guild (si besoin, adapte pour multi-guild)
                // Ici, on suppose que tu as une seule guild ou que tu veux envoyer dans tous les channels configurés
                let allChannels = await getData('lptracker_channels');
                for (let channelRow of allChannels) {
                    await scheduleMessage(client, m_data, channelRow.channel_id);
                }
            }
            await sleep(interval); // Pause entre chaque élément
        }

        // Re-lancer après avoir traité tous les éléments relancer toutes les 10 mins (600000)
        console.log("fin de la vérification");
        setTimeout(() => trackingLp(client, riotKey), 600000);
}



async function verifPuuid(summonerName, tag, puuid, riotAPIKey ) {
    try {
        let response = await axios.get(`https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${summonerName}/${tag}?api_key=${riotAPIKey}`);
        let newPuuid = response.data.puuid;
        if (newPuuid === puuid) {
            return puuid;
        }
        await updateData('lol_accounts', { puuid: newPuuid }, { puuid: puuid });
        await updateData('lol_matches', { puuid: newPuuid }, { puuid: puuid });
        return newPuuid;
    } catch (error) {
        console.error('Erreur lors de la vérification du PUUID :', error);
        return puuid;
    }
}

// Fonction principale pour afficher le rang et les LP
async function getPlayerRankAndLp(puuid,riotKey, lastLp, lastTier, lastRank, m_data ) {
    
    try {
        let url = `https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}?api_key=${riotKey}`;
        let response = await axios.get(url);
        let leagueEntries = response.data;

        let tierChanged = false;
        let rankChanged = false;

        // Filtrer pour les parties classées en solo/duo
        let soloQueue = leagueEntries.find(entry => entry.queueType === 'RANKED_SOLO_5x5');
        if (soloQueue) {
            m_data.queue = soloQueue.queueType;
            m_data.tier = soloQueue.tier;
            m_data.rank = soloQueue.rank;
            m_data.lpGeneral = soloQueue.leaguePoints; // nb lp gagné ou perdu 
            if (lastTier !== m_data.tier) {
                tierChanged = true;
            }
            if (lastRank !== m_data.rank) {
                rankChanged = true;
            }
            let lpDefined = (lastLp !== undefined && m_data.lpGeneral !== undefined);
            if(lpDefined){
                if(!tierChanged && !rankChanged){
                    m_data.lp = m_data.lpGeneral-lastLp;
                    m_data.promotion = "no";
                }else if(m_data.gameStatue ==="win"){
                    m_data.promotion = "up";
                    m_data.lp = (100-lastLp)+m_data.lpGeneral;
                }else{
                    m_data.promotion = "down";
                    m_data.lp = (100-m_data.lpGeneral)+lastLp;
                }
            }
            
            m_data.wins = soloQueue.wins;
            m_data.losses = soloQueue.losses;
        }
    } catch (error) {
        console.error('Erreur lors de la récupération des données :', error.message);
    }
}

async function getPlayerLastSoloDuo(riotKey, puuid,lastGameID, m_data){
    //récupérer les dernières parties 
    try {
        let responses = await axios.get(`https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?type=ranked&start=0&count=1&api_key=${riotKey}`);
        let gameIDs = responses.data;
        if(!Array.isArray(gameIDs) || !(gameIDs.length > 0)){
            return false;
        }
        let GameID = gameIDs[0];
        if ((lastGameID === GameID) && (lastGameID !== "")){
            return false;
        }else{
            let response = await axios.get(`https://europe.api.riotgames.com/lol/match/v5/matches/${GameID}?api_key=${riotKey}`);
            let matchDetails = response.data;
            if(matchDetails.info.queueId !== 420){
                return false;
            }
            let playerStats = matchDetails.info.participants.find(participant => participant.puuid === puuid);
            m_data.kills = playerStats.kills;
            m_data.deaths = playerStats.deaths;
            m_data.assists = playerStats.assists;
            m_data.champion = playerStats.championName;
            m_data.color = playerStats.win ? '#1eff00' : '#ff0000';
            m_data.gameStatue = playerStats.win ? 'win' : 'lose';
            m_data.gameID = GameID;
            return true;
        }

    }catch (error){
        console.error("ici en bas",'Erreur lors de la récupération des données :', error.message);
        return false;
    }
   
}


//mise en forme du message 
function createGameResultsEmbed(m_data){
    let embed = new EmbedBuilder()
    .setAuthor({
        name : `Pablo`,
        iconURL: 'https://cdn.discordapp.com/attachments/1220074375093420142/1316399558108123177/ppDiscord.png?ex=675ae820&is=675996a0&hm=52a4de52b8f8e2cec96a0c6712b251cf121b67ed31f38f9a9af61108cd40d42f&',
    })
    .setTitle(m_data.gameStatue === "win" ? 'Victory' : 'Defeat')
    .setDescription( m_data.promotion === "up" ? `${m_data.pseudo} a ${m_data.gameStatue} ${m_data.lp} league points et a été promu ${m_data.tier} ${m_data.rank} avec ${m_data.lpGeneral}  lp` 
                    : m_data.promotion ==="down" ? `${m_data.pseudo} a ${m_data.gameStatue} ${m_data.lp} league points et a été relégué ${m_data.tier} ${m_data.rank} avec ${m_data.lpGeneral}  lp`
                    :`${m_data.pseudo} a ${m_data.gameStatue} ${m_data.lp} league points et arrive ${m_data.tier} ${m_data.rank} ${m_data.lpGeneral}  lp`)
    .setColor(m_data.color || '#ffffff') // Couleur de l'embed
    .setThumbnail(`https://ddragon.leagueoflegends.com/cdn/14.23.1/img/champion/${m_data.champion}.png`)
    // Ajouter des champs (fields)
    .addFields(
        {
          name: "score",
          value: m_data.kills+'/'+m_data.deaths+'/'+m_data.assists || "non disponible",
          inline: true
        },
        {
          name: "champion",
          value:  m_data.champion || "Non disponible",
          inline: true
        },
        {
          name: "queue",
          value: m_data.queue || "Non disponible",
          inline: true
        },
      );
    
    return embed;
}

// Fonction pour envoyer un message programmé
async function scheduleMessage(client, m_data, channelId) {
        try {
            let channel = await client.channels.fetch(channelId);
            if (channel /*&& channel.isTextBased()*/) {
                await channel.send({embeds : [createGameResultsEmbed(m_data)] });
            } else {
                console.error('Le channel spécifié n\'est pas textuel ou n\'existe pas.');
            }
        } catch (error) {
            console.error('Erreur lors de l\'envoi du message automatique :', error);
        }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function updateLastGameID(puuid, newGameID, newLp, newRank, newTier) {
    try {
        await updateData('lol_accounts', {last_game_id : newGameID, lp : safeInt(newLp), rank : newRank, tier : newTier}, {puuid : puuid})
    } catch (error) {
        console.error('Erreur dans updateLastGameId : ', error);
    }
}

function safeInt(val) {
    return (val === '' || val === undefined || val === null) ? null : Number(val);
}

export default trackingLp ;