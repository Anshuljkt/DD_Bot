/* DD_Bot - A Discord Bot to control Docker containers
   Copyright (C) 2022 Maxim Kovac - Rewritten to JS by Anshul
*/

const { SlashCommandBuilder } = require('discord.js');
const { DockerService } = require('../services/dockerService');
const { SettingsService } = require('../services/settingsService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('permission')
    .setDescription('Check your Docker container permissions'),

  async execute(interaction) {
    try {
      // Create service instances for this command execution
      const settingsService = new SettingsService();
      const dockerService = new DockerService();
      
      // Load settings
      const settings = await settingsService.loadSettings();
      
      const userId = interaction.user.id;
      const isAdmin = settings.DiscordSettings.AdminIDs.includes(userId);
      
      // Get user and role permissions
      const userStartPermissions = settings.DiscordSettings.UserStartPermissions[userId] || [];
      const userStopPermissions = settings.DiscordSettings.UserStopPermissions[userId] || [];
      
      // Get role-based permissions
      let roleStartPermissions = [];
      let roleStopPermissions = [];
      
      if (interaction.member) {
        const memberRoles = interaction.member.roles.cache;
        
        for (const [roleId, containers] of Object.entries(settings.DiscordSettings.RoleStartPermissions)) {
          if (memberRoles.has(roleId)) {
            roleStartPermissions = roleStartPermissions.concat(containers);
          }
        }
        
        for (const [roleId, containers] of Object.entries(settings.DiscordSettings.RoleStopPermissions)) {
          if (memberRoles.has(roleId)) {
            roleStopPermissions = roleStopPermissions.concat(containers);
          }
        }
      }
      
      // Remove duplicates
      roleStartPermissions = [...new Set(roleStartPermissions)];
      roleStopPermissions = [...new Set(roleStopPermissions)];
      
      // Combine permissions
      const allStartPermissions = [...new Set([...userStartPermissions, ...roleStartPermissions])];
      const allStopPermissions = [...new Set([...userStopPermissions, ...roleStopPermissions])];
      
      // Get container list
      await dockerService.dockerUpdate();
      const containers = await dockerService.dockerUpdate();
      const containerNames = containers.map(c => c.Names[0].replace('/', ''));
      
      let responseMessage = `**Your Docker Container Permissions:**\n`;
      
      if (isAdmin) {
        responseMessage += '**You are an admin!** You have full access to all containers.\n\n';
        responseMessage += `**Available Containers:**\n${containerNames.join('\n')}`;
      } else {
        if (allStartPermissions.length === 0 && allStopPermissions.length === 0) {
          responseMessage += 'You do not have any permissions set.';
        } else {
          if (allStartPermissions.length > 0) {
            responseMessage += `**Start Permissions:**\n${allStartPermissions.join('\n')}\n\n`;
          }
          
          if (allStopPermissions.length > 0) {
            responseMessage += `**Stop/Restart Permissions:**\n${allStopPermissions.join('\n')}`;
          }
        }
      }
      
      await interaction.reply({ content: responseMessage, ephemeral: true });
    } catch (error) {
      console.error('Error in permission command:', error);
      await interaction.reply({ content: 'An error occurred while processing the command.', ephemeral: true });
    }
  }
};
