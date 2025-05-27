/* DD_Bot - A Discord Bot to control Docker containers
   Copyright (C) 2022 Maxim Kovac - Rewritten to JS by Anshul

   This program is free software: you can redistribute it and/or modify
   it under the terms of the GNU General Public License as published by
   the Free Software Foundation, either version 3 of the License, or
   (at your option) any later version.
*/

require('dotenv').config();
const { SettingsService } = require('./src/services/settingsService');
const { DockerService } = require('./src/services/dockerService');
const { DiscordService } = require('./src/services/discordService');

async function main() {
  try {
    // Initialize services
    const settingsService = new SettingsService();
    const settings = await settingsService.loadSettings();
    
    const dockerService = new DockerService(settings);
    await dockerService.dockerUpdate();
    
    const discordService = new DiscordService(settings, dockerService, settingsService);
    await discordService.start();
    
    console.log('Bot is running!');
  } catch (error) {
    console.error('Error starting the bot:', error);
    process.exit(1);
  }
}

main();
