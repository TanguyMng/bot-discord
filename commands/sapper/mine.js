import { SlashCommandBuilder } from 'discord.js';
import { updateData, insertData, getData } from '../../database/bddFunction.js';

export default {
	data: new SlashCommandBuilder()
		.setName('mine')
		.setDescription('Pose une mine dans le salon'),
	async execute(interaction) {
		try{
            let channel_id = interaction.channelId;
            let sapper = await getData('sapper');
            let channel = sapper.find(u=>u.channel_id === channel_id);
            let mines = channel?.mine_nb;
            if(mines === undefined){
                await insertData('sapper', {channel_id : channel_id, mine_nb : 0});
                mines = 0;
            }
            let res =1;
            if(mines < 10){
                mines = mines+1;
                res = await updateData('sapper', {mine_nb : mines}, {channel_id : channel_id});
            }

            if(res !==0){
                await interaction.reply(`Il y a maintenant ${mines} mines dans le salon, attention à vous`);
            }else{
                await interaction.reply('probleme, probleme engine caput');
            }
        }catch(error){
            console.error(`Erreur dans mine.js:`, error);
            await interaction.reply({
                content: "Une erreur est survenue dans mine.js.",
                ephemeral: true
            });
        }
        
	}
};