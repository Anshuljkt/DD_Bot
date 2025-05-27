/**
 * This script can be used to register slash commands during development
 */

require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('fs');
const path = require('path');
const { SettingsService } = require('./services/settingsService');

// Immediately-invoked async function to allow use of await
(async () => {
  try {
    // Initialize settings service
    const settingsService = new SettingsService();
    const settings = await settingsService.loadSettings();
    
    const token = settings.DiscordSettings.Token;
    
    if (!token) {
      console.error('Bot token not found. Make sure your .env file or settings.json has a valid token.');
      process.exit(1);
    }
    
    // Get client ID from the token
    const rest = new REST({ version: '10' }).setToken(token);
    const clientId = Buffer.from(token.split('.')[0], 'base64').toString();
    
    console.log('Loading commands...');
    
    // Load command files
    const commands = [];
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      if ('data' in command) {
        commands.push(command.data.toJSON());
        console.log(`Loaded command: ${command.data.name}`);
      } else {
        console.warn(`The command at ${filePath} is missing the required data property.`);
      }
    }
    
    console.log(`Found ${commands.length} commands to register.`);
    
    // Check if a guild ID is provided for per-guild command registration
    const guildId = process.env.GUILD_ID;
    if (guildId) {
      console.log(`Registering commands for guild ${guildId}...`);
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log('Commands registered successfully in the specified guild.');
    } else {
      console.log('Registering global commands (this may take up to 1 hour to propagate)...');
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log('Global commands registered successfully.');
    }
  } catch (error) {
    console.error('Error registering commands:', error);
    process.exit(1);
  }
})();
