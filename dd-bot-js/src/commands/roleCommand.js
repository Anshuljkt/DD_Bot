/* DD_Bot - A Discord Bot to control Docker containers
   Copyright (C) 2022 Maxim Kovac - Rewritten to JS by Anshul
*/

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { DockerService } = require('../services/dockerService');
const { SettingsService } = require('../services/settingsService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Manage role permissions for Docker containers')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add Docker permissions for a role')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to give permissions to')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('container')
            .setDescription('The container name')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('permission')
            .setDescription('Permission type to grant')
            .setRequired(true)
            .addChoices(
              { name: 'Start', value: 'start' },
              { name: 'Stop/Restart', value: 'stop' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove Docker permissions for a role')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to remove permissions from')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('container')
            .setDescription('The container name')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('permission')
            .setDescription('Permission type to remove')
            .setRequired(true)
            .addChoices(
              { name: 'Start', value: 'start' },
              { name: 'Stop/Restart', value: 'stop' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List Docker permissions for a role')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to check permissions for')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    try {
      // Create service instances for this command execution
      const settingsService = new SettingsService();
      const dockerService = new DockerService();
      
      // Load settings
      const settings = await settingsService.loadSettings();
      
      // Get command options
      const subCommand = interaction.options.getSubcommand();
      
      switch (subCommand) {
        case 'add': {
          const role = interaction.options.getRole('role');
          const container = interaction.options.getString('container');
          const permission = interaction.options.getString('permission');
          
          // Verify the container exists
          await dockerService.dockerUpdate();
          const containers = await dockerService.dockerUpdate();
          const containerExists = containers.some(c => 
            c.Names.some(name => name.replace('/', '') === container)
          );
          
          if (!containerExists) {
            await interaction.reply(`Container "${container}" does not exist.`);
            return;
          }
          
          // Add permission to the appropriate dictionary
          await settingsService.updateRolePermissions(role.id, container, permission, 'add');
          
          await interaction.reply(`Added ${permission} permission for role ${role.name} on container ${container}.`);
          break;
        }
        
        case 'remove': {
          const role = interaction.options.getRole('role');
          const container = interaction.options.getString('container');
          const permission = interaction.options.getString('permission');
          
          // Remove permission from the appropriate dictionary
          await settingsService.updateRolePermissions(role.id, container, permission, 'remove');
          
          await interaction.reply(`Removed ${permission} permission for role ${role.name} on container ${container}.`);
          break;
        }
        
        case 'list': {
          const role = interaction.options.getRole('role');
          const roleId = role.id;
          
          const startPermissions = settings.DiscordSettings.RoleStartPermissions[roleId] || [];
          const stopPermissions = settings.DiscordSettings.RoleStopPermissions[roleId] || [];
          
          let responseMessage = `**Permissions for role ${role.name}:**\n`;
          
          if (startPermissions.length === 0 && stopPermissions.length === 0) {
            responseMessage += 'No permissions configured.';
          } else {
            if (startPermissions.length > 0) {
              responseMessage += `**Start Permissions:**\n${startPermissions.join('\n')}\n\n`;
            }
            
            if (stopPermissions.length > 0) {
              responseMessage += `**Stop/Restart Permissions:**\n${stopPermissions.join('\n')}`;
            }
          }
          
          await interaction.reply(responseMessage);
          break;
        }
      }
    } catch (error) {
      console.error('Error in role command:', error);
      await interaction.reply({ content: 'An error occurred while processing the command.', ephemeral: true });
    }
  }
};
