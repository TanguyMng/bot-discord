import { SlashCommandBuilder } from 'discord.js';
import { updateData, insertData, getData } from '../../database/bddFunction.js';

export default {
    data: new SlashCommandBuilder()
        .setName('mines')
        .addStringOption(option => 
            option.setName('nb_mines')
                .setDescription('nombres de mines')
                .setRequired(true))
        .setDescription('Pose une mine dans le salon'),
    async execute(interaction) {
        try{
            let max_mines = 10;
            let channel_id = interaction.channelId;
            let sapper = await getData('sapper');
            let channel = sapper.find(u=>u.channel_id === channel_id);
            let mines = channel?.mine_nb;
            if(mines === undefined){
                await insertData('sapper', {channel_id : channel_id, mine_nb : 0});
                mines = 0;
            }
            let res =1;
            if(mines+nb_mines < max_mines){
                mines += nb_mines;
                res = await updateData('sapper', {mine_nb : mines}, {channel_id : channel_id});
            }else{
                res = 0;
            }

            if(res !==0){
                await interaction.reply(`Il y a maintenant ${mines} mines dans le salon, attention à vous`);
            }else{
                await interaction.reply(`Je ne peux poser autant de mines, tu peux en poser ${max_mines-mines}`);
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