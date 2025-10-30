import fs from 'node:fs';
import path from 'node:path';
import { REST, Routes } from 'discord.js';
/*import dotenv from 'dotenv';
dotenv.config();*/


const  tokenDiscord = process.env.tokenDiscordPrinc;


const commands = [];
const __dirname = path.resolve();

// Grab all the command folders from the commands directory you created earlier
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	// Grab all the command files from the commands directory you created earlier
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = await import(pathToFileURL(filePath).href);
		if ('data' in command.default && 'execute' in command.default) {
			commands.push(command.default.data.toJSON());
		} else {
			console.error(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(tokenDiscord);

// and deploy your commands!
(async () => {
	let  clientId  = process.env.clientIdPrinc;
	let  guildId  = process.env.guildIdPrinc;
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(
			Routes.applicationGuildCommands(clientId, guildId),
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();

// Helper for Windows path compatibility with import()
import { pathToFileURL } from 'node:url';