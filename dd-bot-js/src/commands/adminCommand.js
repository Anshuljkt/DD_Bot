/* DD_Bot - A Discord Bot to control Docker containers
   Copyright (C) 2022 Maxim Kovac - Rewritten to JS by Anshul
*/

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const { SettingsService } = require('../services/settingsService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Manage bot admin permissions')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add an admin')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to add as an admin')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove an admin')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to remove from admins')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all admins')
    ),

  async execute(interaction) {
    try {
      // Create a new settings service instance
      const settingsService = new SettingsService();
      
      // Load settings
      const settings = await settingsService.loadSettings();
      
      // Handle different sub-commands
      const subCommand = interaction.options.getSubcommand();
      
      switch (subCommand) {
        case 'add': {
          const user = interaction.options.getUser('user');
          const userId = user.id;
          
          // Check if user is already an admin
          if (settings.DiscordSettings.AdminIDs.includes(userId)) {
            await interaction.reply(`User ${user.tag} is already an admin.`);
            return;
          }
          
          // Add user to admin list
          settings.DiscordSettings.AdminIDs.push(userId);
          await settingsService.saveSettings(settings);
          
          await interaction.reply(`Added ${user.tag} to admin list successfully.`);
          break;
        }
        
        case 'remove': {
          const user = interaction.options.getUser('user');
          const userId = user.id;
          
          // Check if user is an admin
          if (!settings.DiscordSettings.AdminIDs.includes(userId)) {
            await interaction.reply(`User ${user.tag} is not an admin.`);
            return;
          }
          
          // Remove user from admin list
          settings.DiscordSettings.AdminIDs = settings.DiscordSettings.AdminIDs.filter(id => id !== userId);
          await settingsService.saveSettings(settings);
          
          await interaction.reply(`Removed ${user.tag} from admin list successfully.`);
          break;
        }
        
        case 'list': {
          if (settings.DiscordSettings.AdminIDs.length === 0) {
            await interaction.reply('No admins are configured.');
            return;
          }
          
          // Fetch usernames for all admin IDs
          const adminUsers = [];
          for (const adminId of settings.DiscordSettings.AdminIDs) {
            try {
              const user = await interaction.client.users.fetch(adminId);
              adminUsers.push(`${user.tag} (${adminId})`);
            } catch (error) {
              adminUsers.push(`Unknown user (${adminId})`);
            }
          }
          
          await interaction.reply(`**Admin Users:**\n${adminUsers.join('\n')}`);
          break;
        }
      }
    } catch (error) {
      console.error('Error in admin command:', error);
      await interaction.reply({ content: 'An error occurred while processing the command.', ephemeral: true });
    }
  }
};
