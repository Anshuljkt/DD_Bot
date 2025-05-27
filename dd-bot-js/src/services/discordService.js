/**
 * DD_Bot - A Discord Bot to control Docker containers
 * Discord Service to manage bot interactions
 */

const { Client, GatewayIntentBits, Collection, REST, Routes, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { DockerService } = require('./dockerService');
const { SettingsService } = require('./settingsService');

class DiscordService {
  constructor(settings, dockerService, settingsService) {
    this.client = new Client({ 
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ] 
    });
    
    this.settings = settings;
    this.dockerService = dockerService || new DockerService(settings);
    this.settingsService = settingsService || new SettingsService();
    
    this.commands = new Collection();
    this.commandsData = [];
  }

  /**
   * Start the Discord bot service
   */
  async start() {
    // Register event handlers
    this.registerEvents();
    
    // Load commands
    await this.loadCommands();
    
    // Log in
    try {
      console.log('Logging into Discord...');
      await this.client.login(this.settings.DiscordSettings.Token);
      console.log(`Bot logged in as ${this.client.user.tag}`);
    } catch (error) {
      console.error(`Error logging in: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Register Discord.js event handlers
   */
  registerEvents() {
    this.client.once('ready', () => {
      console.log(`Bot logged in as ${this.client.user.tag}`);
      this.registerSlashCommands();
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isCommand()) return;

      const command = this.commands.get(interaction.commandName);
      if (!command) return;

      try {
        // Start a non-blocking async job for commands that take longer
        const startTime = Date.now();
        
        await command.execute(interaction);
        
        const executionTime = Date.now() - startTime;
        if (executionTime > 2000) {
          console.warn(`Command "${interaction.commandName}" took ${executionTime}ms to execute, which may block the gateway task.`);
        }
      } catch (error) {
        console.error(`Error executing command ${interaction.commandName}:`, error);
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'There was an error executing this command', ephemeral: true });
        } else {
          await interaction.reply({ content: 'There was an error executing this command', ephemeral: true });
        }
      }
    });
  }

  /**
   * Load command files from the commands directory
   */
  async loadCommands() {
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);

      // Set a new item in the Collection
      if ('data' in command && 'execute' in command) {
        this.commands.set(command.data.name, command);
        this.commandsData.push(command.data.toJSON());
        console.log(`Loaded command: ${command.data.name}`);
      } else {
        console.warn(`The command at ${filePath} is missing required properties.`);
      }
    }
  }

  /**
   * Register slash commands with Discord API
   */
  async registerSlashCommands() {
    if (!this.client.application) return;

    try {
      const rest = new REST({ version: '10' }).setToken(this.settings.DiscordSettings.Token);
      
      console.log(`Started refreshing ${this.commandsData.length} application (/) commands.`);

      await rest.put(
        Routes.applicationCommands(this.client.user.id),
        { body: this.commandsData },
      );

      console.log('Successfully registered application commands with Discord.');
    } catch (error) {
      console.error('Error registering commands:', error);
    }
  }

  /**
   * Check if a user has admin permissions
   * @param {string} userId - Discord User ID
   * @returns {boolean} Whether the user is an admin
   */
  isAdmin(userId) {
    // Check if the user ID is in the admin IDs array
    return this.settings.DiscordSettings.AdminIDs.includes(userId);
  }

  /**
   * Check if a user has permission for a container
   * @param {string} userId - Discord User ID
   * @param {Array<string>} userRoles - Array of role IDs the user has
   * @param {string} containerId - Container ID
   * @param {string} operation - Operation type ('start' or 'stop')
   * @returns {boolean} Whether the user has permission
   */
  hasContainerPermission(userId, userRoles, containerId, operation) {
    // Admins always have permission
    if (this.isAdmin(userId)) return true;

    // Check user permissions based on operation type
    if (operation === 'start') {
      // Check user start permissions
      if (this.settings.DiscordSettings.UserStartPermissions[userId] && 
          this.settings.DiscordSettings.UserStartPermissions[userId].includes(containerId)) {
        return true;
      }
    } else if (operation === 'stop' || operation === 'restart') {
      // Check user stop permissions
      if (this.settings.DiscordSettings.UserStopPermissions[userId] && 
          this.settings.DiscordSettings.UserStopPermissions[userId].includes(containerId)) {
        return true;
      }
    }

    // Check role permissions based on operation type
    if (userRoles && userRoles.length > 0) {
      if (operation === 'start') {
        // Check role start permissions
        for (const [roleId, containers] of Object.entries(this.settings.DiscordSettings.RoleStartPermissions)) {
          if (userRoles.includes(roleId) && containers.includes(containerId)) {
            return true;
          }
        }
      } else if (operation === 'stop' || operation === 'restart') {
        // Check role stop permissions
        for (const [roleId, containers] of Object.entries(this.settings.DiscordSettings.RoleStopPermissions)) {
          if (userRoles.includes(roleId) && containers.includes(containerId)) {
            return true;
          }
        }
      }
    }

    return false;
  }
}

// Export the class rather than an instance to allow proper initialization with settings
module.exports = { DiscordService };
