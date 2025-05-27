/* DD_Bot - A Discord Bot to control Docker containers
   Copyright (C) 2022 Maxim Kovac - Rewritten to JS by Anshul
*/

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { DockerService } = require('../services/dockerService');
const { SettingsService } = require('../services/settingsService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('docker')
    .setDescription('Issue a command to Docker')
    .addStringOption(option =>
      option
        .setName('dockername')
        .setDescription('Choose a container')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('command')
        .setDescription('Choose a command')
        .setRequired(true)
        .addChoices(
          { name: 'Start', value: 'start' },
          { name: 'Stop', value: 'stop' },
          { name: 'Restart', value: 'restart' },
          { name: 'Execute', value: 'exec' },
          { name: 'JF Fix', value: 'jfFix' }
        )
    )
    .addStringOption(option =>
      option
        .setName('cli')
        .setDescription('Command to execute in the container')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    
    // Create service instances for this command execution
    const settingsService = new SettingsService();
    const settings = await settingsService.loadSettings();
    const dockerService = new DockerService(settings);
    
    await dockerService.dockerUpdate();

    const command = interaction.options.getString('command');
    let dockerName = interaction.options.getString('dockername');
    const cliCommand = interaction.options.getString('cli');

    // Special case for jfFix command
    if (command === 'jfFix') {
      dockerName = 'jellyfin';
    }

    // Check authorization
    if (!await this.checkAuthorization(interaction, command, dockerName)) {
      await interaction.editReply('You are not allowed to use this command');
      return;
    }

    // Find the container
    const containers = await dockerService.dockerUpdate();
    const docker = containers.find(container => 
      container.Names.some(name => name.replace('/', '') === dockerName)
    );

    if (!docker) {
      await interaction.editReply('Container doesn\'t exist!');
      return;
    }

    const dockerId = docker.Id;

    // Check container status before executing command
    const isRunning = docker.State === 'running';
    console.log(`Container ${dockerName} state: ${docker.State}, Status: ${docker.Status}`);
    
    if (command === 'start' && isRunning) {
      await interaction.editReply(`${dockerName} is already running`);
      return;
    }
    
    if ((command === 'stop' || command === 'restart') && !isRunning) {
      await interaction.editReply(`${dockerName} is already stopped`);
      return;
    }

    // Handle the jfFix command separately with non-blocking execution
    if (command === 'jfFix') {
      await interaction.editReply('Starting JF Fix process. This may take several minutes...');
      
      // Run the long operation in a background task
      dockerService.dockerCustomCommandJFFix()
        .then(result => {
          interaction.followUp(`JF Fix completed:\n\`\`\`\n${result}\n\`\`\``);
        })
        .catch(error => {
          interaction.followUp(`Error during JF Fix: ${error.message}`);
        });
      
      return;
    }

    // Execute the command
    try {
      switch (command) {
        case 'start':
          await dockerService.dockerCommandStart(dockerId);
          break;
        case 'stop':
          await dockerService.dockerCommandStop(dockerId);
          break;
        case 'restart':
          await dockerService.dockerCommandRestart(dockerId);
          break;
        case 'exec':
          if (!cliCommand) {
            await interaction.editReply('CLI command is required for exec operation');
            return;
          }
          const result = await dockerService.dockerCommandExec(dockerId, cliCommand);
          await interaction.editReply(`${interaction.user} Response from Script (Stdout): \n${result}`);
          return;
      }

      await interaction.editReply(`Command has been sent. Awaiting response. This will take up to ${settings.DockerSettings.Retries * settings.DockerSettings.TimeBeforeRetry} seconds.`);

      // Poll for container status change
      for (let i = 0; i < settings.DockerSettings.Retries; i++) {
        await new Promise(resolve => setTimeout(resolve, settings.DockerSettings.TimeBeforeRetry * 1000));
        await dockerService.dockerUpdate();
        
        const updatedContainers = await dockerService.dockerUpdate();
        const updatedContainer = updatedContainers.find(c => 
          c.Id === dockerId
        );
        
        if (!updatedContainer) {
          console.log(`Cannot find container ${dockerId} after update`);
          continue;
        }
        
        console.log(`Updated container state: ${updatedContainer.State}, Status: ${updatedContainer.Status}`);
        const newStatus = updatedContainer.State === 'running';
        
        if ((command === 'start' || command === 'restart') && newStatus) {
          await interaction.editReply(`${interaction.user} ${dockerName} has been ${command === 'start' ? 'started' : 'restarted'}`);
          return;
        } else if (command === 'stop' && !newStatus) {
          await interaction.editReply(`${interaction.user} ${dockerName} has been stopped`);
          return;
        }
      }
      
      // Final check after all retries
      await dockerService.dockerUpdate();
      const finalContainers = await dockerService.dockerUpdate();
      const finalContainer = finalContainers.find(c => c.Id === dockerId);
      
      if (finalContainer) {
        const finalStatus = finalContainer.State === 'running';
        
        if ((command === 'start' || command === 'restart') && finalStatus) {
          await interaction.editReply(`${interaction.user} ${dockerName} has been ${command === 'start' ? 'started' : 'restarted'}`);
        } else if (command === 'stop' && !finalStatus) {
          await interaction.editReply(`${interaction.user} ${dockerName} has been stopped`);
        } else {
          await interaction.editReply(`${interaction.user} ${dockerName} could not be ${command}ed`);
        }
      } else {
        await interaction.editReply(`${interaction.user} ${dockerName} could not be found after command execution`);
      }
    } catch (error) {
      console.error(`Error executing docker command:`, error);
      await interaction.editReply(`Error executing command: ${error.message}`);
    }
  },

  async checkAuthorization(interaction, command, dockerName) {
    // Create settings service for authorization check
    const settingsService = new SettingsService();
    const settings = await settingsService.loadSettings();
    
    // Check if user is admin
    if (settings.DiscordSettings.AdminIDs.includes(interaction.user.id)) {
      return true;
    }
    
    // Check if user is in the admin list
    if (settings.DiscordSettings.AdminIDs.includes(interaction.user.id)) {
      return true;
    }

    if (!interaction.member) {
      return false;
    }

    // Check user permissions
    const userId = interaction.user.id;
    if (['start'].includes(command)) {
      if (settings.DiscordSettings.UserStartPermissions[userId] && 
          settings.DiscordSettings.UserStartPermissions[userId].includes(dockerName)) {
        return true;
      }
    } else if (['stop', 'restart', 'exec', 'jfFix'].includes(command)) {
      if (settings.DiscordSettings.UserStopPermissions[userId] &&
          settings.DiscordSettings.UserStopPermissions[userId].includes(dockerName)) {
        return true;
      }
    }

    // Check role permissions
    const userRoles = interaction.member.roles.cache;
    
    if (['start'].includes(command)) {
      for (const [roleId, containers] of Object.entries(settings.DiscordSettings.RoleStartPermissions)) {
        if (userRoles.has(roleId) && containers.includes(dockerName)) {
          return true;
        }
      }
    } else if (['stop', 'restart', 'exec', 'jfFix'].includes(command)) {
      for (const [roleId, containers] of Object.entries(settings.DiscordSettings.RoleStopPermissions)) {
        if (userRoles.has(roleId) && containers.includes(dockerName)) {
          return true;
        }
      }
    }

    return false;
  }
};
