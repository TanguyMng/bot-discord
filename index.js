import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import http from 'http';
import dotenv from 'dotenv';

// Charger .env en premier
dotenv.config();

import trackingLp from './lpTracker/lptracker.js';
import decompte from './lpTracker/sapperGame.js';

// Fix ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validation env
const PORT = process.env.PORT || 3000;
const tokenDiscord = process.env.tokenDiscordPrinc;
const riotAPIKey = process.env.riotAPIKey;

if (!tokenDiscord) {
  console.error('❌ Variable manquante: tokenDiscordPrinc');
  process.exit(1);
}

// Serveur HTTP minimal pour Render/Railway healthcheck
// DOIT être en dehors du ready event, sinon Render timeout
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!');
}).listen(PORT, () => console.log(`🌐 Healthcheck server running on port ${PORT}`));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Nécessaire pour le jeu des mines
  ],
});

client.commands = new Collection();

// Chargement des commandes
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = await import(pathToFileURL(filePath).href);
    if ('data' in command.default && 'execute' in command.default) {
      client.commands.set(command.default.data.name, command.default);
    } else {
      console.log(`[WARNING] Commande ${filePath} manque data ou execute`);
    }
  }
}

client.once(Events.ClientReady, readyClient => {
  console.log(`✅ Ready! Logged in as ${readyClient.user.tag}`);

  // Lancer le tracker seulement si la clé Riot est présente
  if (riotAPIKey) {
    console.log('🚀 Lancement du LP Tracker...');
    trackingLp(client, riotAPIKey);
  } else {
    console.warn('⚠️ riotAPIKey manquante, LP Tracker désactivé');
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) {
    console.error(`Commande ${interaction.commandName} introuvable`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[Interaction] Erreur sur ${interaction.commandName}:`, error);
    const reply = { content: '❌ Erreur lors de l\'exécution de cette commande !', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  try {
    if (await decompte(message.channelId.toString())) {
      const member = message.member;
      if (!member) return;

      const duration = 5 * 60 * 1000; // 5 minutes
      try {
        await member.timeout(duration, 'Est tombé sur une mine');
        await message.reply(`💥 ${member.user.tag} a marché sur une mine et est timeout pendant 5 minutes !`);
      } catch (error) {
        // Manque de permissions ou rôle trop haut
        console.error('[Mine timeout] Erreur:', error.message);
        await message.reply('💥 BOOM ! Mais je n\'ai pas la permission de timeout ce membre. Vérifie mes rôles !');
      }
    }
  } catch (error) {
    console.error('[MessageCreate] Erreur:', error);
  }
});

client.login(tokenDiscord).catch(err => {
  console.error('❌ Échec login Discord:', err);
  process.exit(1);
});
