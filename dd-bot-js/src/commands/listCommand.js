/* DD_Bot - A Discord Bot to control Docker containers
   Copyright (C) 2022 Maxim Kovac - Rewritten to JS by Anshul
*/

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { DockerService } = require('../services/dockerService');
const { SettingsService } = require('../services/settingsService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('List all Docker containers')
    .addStringOption(option =>
      option
        .setName('filter')
        .setDescription('Filter containers')
        .setRequired(false)
        .addChoices(
          { name: 'Running', value: 'running' },
          { name: 'Stopped', value: 'stopped' },
          { name: 'All', value: 'all' }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Create service instances for this command execution
      const settingsService = new SettingsService();
      const settings = await settingsService.loadSettings();
      const dockerService = new DockerService(settings);
      
      // Get the filter option (default to 'all' if not provided)
      const filter = interaction.options.getString('filter') || 'all';
      
      // Update container list
      await dockerService.dockerUpdate();
      const containers = await dockerService.dockerUpdate();
      
      // Filter containers based on option
      let filteredContainers;
      if (filter === 'running') {
        filteredContainers = containers.filter(container => container.State === 'running');
      } else if (filter === 'stopped') {
        filteredContainers = containers.filter(container => container.State !== 'running');
      } else {
        filteredContainers = containers;
      }

      // Check if there are containers to display
      if (filteredContainers.length === 0) {
        await interaction.editReply(`No ${filter !== 'all' ? filter : ''} containers found.`);
        return;
      }

      // Find the longest container name for formatting
      let longestName = 0;
      filteredContainers.forEach(container => {
        const name = container.Names[0].replace('/', '');
        if (name.length > longestName) {
          longestName = name.length;
        }
      });

      // Group containers in chunks to avoid message size limit
      const containerGroups = this.chunkArray(filteredContainers, settings.DockerSettings.ContainersPerMessage);
      
      // Create and send embeds for each group
      for (let i = 0; i < containerGroups.length; i++) {
        const embed = new EmbedBuilder()
          .setTitle(`Docker Container List (${filter})`)
          .setColor(filter === 'running' ? '#00FF00' : filter === 'stopped' ? '#FF0000' : '#0099FF')
          .setTimestamp();

        let description = '```\n';
        containerGroups[i].forEach(container => {
          const name = container.Names[0].replace('/', '');
          const status = container.State;
          const statusEmoji = status === 'running' ? '✅' : '❌';
          
          // Pad the name to align the status
          const paddedName = name.padEnd(longestName + 2);
          description += `${paddedName} ${statusEmoji} ${status}\n`;
        });
        description += '```';
        
        embed.setDescription(description);
        
        if (i === 0) {
          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.followUp({ embeds: [embed] });
        }
      }
    } catch (error) {
      console.error('Error listing containers:', error);
      await interaction.editReply('An error occurred while fetching the container list.');
    }
  },

  // Helper method to chunk an array
  chunkArray(array, chunkSize) {
    const result = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      result.push(array.slice(i, i + chunkSize));
    }
    return result;
  }
};
