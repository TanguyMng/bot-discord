import { SlashCommandBuilder } from 'discord.js';
import { deleteData, getData } from '../../database/bddFunction.js';

export default {
    data: new SlashCommandBuilder()
        .setName('deleteaccount')
        .setDescription('Permet de supprimer un compte enregistré')
        .addStringOption(option => 
            option.setName('pseudo')
                .setDescription('The lol pseudo')
                .setRequired(true)
        ).addStringOption(option => 
            option.setName('tag')
                .setDescription('The tag of the lol pseudo')
                .setRequired(true)
        ),
    async execute(interaction) {
        let pseudo = interaction.options.getString('pseudo');
        let tag = interaction.options.getString('tag');
        let discordId = interaction.user.id;

        try{
            //1 Récupérer l'id interne de l'utilisateur discord
            let users = await getData('discord_users', { discord_id: discordId });
            if(users.length === 0) {
                await interaction.reply({
                    content: "Vous devez d'abord vous enregistrer avec la commande /register.",
                    ephemeral: true // Only the user who invoked the command will see this message
                });
                return;
            }
            let discordUserId = users[0].id;

            //2 Supprimer le compte lol lié à ce discord user
            let res = await deleteData('lol_accounts',{
                discord_user_id : discordUserId,
                game_name : pseudo,
                tag : tag
            });

            if(res === 1){
                await interaction.reply("Le compte a bien été supprimé");
            }else{
                await interaction.reply("Le compte n'as pas pu être supprimé, il n'existe pas");
            }
        }catch(err){
            console.error('Error in deleteaccount : ',err);
            await interaction.reply({
                content : "Une erreur est survenue lors de la suppression du compte.",
                ephemeral: true // Only the user who invoked the command will see this message
            });
        }
    }
};
