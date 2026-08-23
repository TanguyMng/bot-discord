import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

// Fix ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validation env - Version 1 simplifiée
const token = process.env.tokenDiscordPrinc;
const clientId = process.env.clientIdPrinc;
const guildId = process.env.guildIdPrinc; // Optionnel pour dev

if (!token) {
  console.error('❌ tokenDiscordPrinc manquant dans .env');
  process.exit(1);
}
if (!clientId) {
  console.error('❌ clientIdPrinc manquant dans .env');
  process.exit(1);
}

const commands = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = await import(pathToFileURL(filePath).href);
    
    if ('data' in command.default && 'execute' in command.default) {
      commands.push(command.default.data.toJSON());
      console.log(`✅ Chargé: ${command.default.data.name}`);
    } else {
      console.log(`[WARNING] ${filePath} manque data ou execute`);
    }
  }
}

const rest = new REST().setToken(token);

(async () => {
  try {
    console.log(`🚀 Déploiement de ${commands.length} commandes...`);

    let data;
    // Si guildId présent -> déploiement instantané en dev (1s)
    // Si pas de guildId -> déploiement global (1h de propagation)
    if (guildId) {
      console.log(`📍 Mode GUILD (dev) sur ${guildId}`);
      data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands },
      );
    } else {
      console.log('🌍 Mode GLOBAL (prod) - propagation ~1h');
      data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands },
      );
    }

    console.log(`✅ ${data.length} commandes déployées avec succès !`);
  } catch (error) {
    console.error('❌ Erreur déploiement:', error);
    process.exit(1);
  }
})();
