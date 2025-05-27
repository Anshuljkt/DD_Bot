/**
 * DD_Bot - A Discord Bot to control Docker containers
 * Settings Service to manage configuration
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');


class SettingsService {
  constructor() {
    this.settingsPath = path.resolve(process.cwd(), 'settings');
    this.settingsFile = path.join(this.settingsPath, 'settings.json');
    this.settings = null;
    this.ensureSettingsDirectory();
  }

  /**
   * Ensure the settings directory exists
   */
  ensureSettingsDirectory() {
    if (!fsSync.existsSync(this.settingsPath)) {
      fsSync.mkdirSync(this.settingsPath, { recursive: true });
      console.log(`Created settings directory: ${this.settingsPath}`);
    }

    if (!fsSync.existsSync(this.settingsFile)) {
      this.saveSettings(this.getDefaultSettings());
      console.log(`Created default settings file: ${this.settingsFile}`);
    }
  }

  /**
   * Get default settings structure
   * @returns {Object} Default settings
   */
  getDefaultSettings() {
    return {
      "LanguageSettings": {
        "Language": "en"
      },
      "DiscordSettings": {
        "Token": process.env.DISCORD_TOKEN || "<- Please Insert Token here! ->",
        "AdminIDs": [],
        "UserWhitelist": true,
        "UserIDs": [],
        "UsersCanStopContainers": false,
        "AllowedContainers": [],
        "RoleStartPermissions": {},
        "RoleStopPermissions": {},
        "UserStartPermissions": {},
        "UserStopPermissions": {}
      },
      "DockerSettings": {
        "BotName": "DD_Bot",
        "Retries": 12,
        "TimeBeforeRetry": 5,
        "ContainersPerMessage": 30
      }
    };
  }

  /**
   * Load settings from file
   * @returns {Promise<Object>} Settings object
   */
  async loadSettings() {
    try {
      if (this.settings) {
        return this.settings;
      }
      
      const data = await fs.readFile(this.settingsFile, 'utf8');
      this.settings = JSON.parse(data);
      
      console.log('Settings loaded successfully');
      return this.settings;
    } catch (error) {
      console.error(`Error loading settings: ${error.message}`);
      // If settings file doesn't exist, create default settings
      if (error.code === 'ENOENT') {
        const defaultSettings = this.getDefaultSettings();
        await this.saveSettings(defaultSettings);
        this.settings = defaultSettings;
        return defaultSettings;
      }
      throw error;
    }
  }

  /**
   * Save settings to file
   * @param {Object} settings - Settings object to write
   * @returns {Promise<void>}
   */
  async saveSettings(settings) {
    try {
      await fs.writeFile(this.settingsFile, JSON.stringify(settings, null, 2), 'utf8');
      this.settings = settings;
      console.log('Settings saved successfully');
    } catch (error) {
      console.error(`Error saving settings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update user permissions
   * @param {string} userId - User ID
   * @param {string} container - Container name
   * @param {string} permission - Permission type ('start' or 'stop')
   * @param {string} action - Action to perform ('add' or 'remove')
   * @returns {Promise<void>}
   */
  async updateUserPermissions(userId, container, permission, action) {
    const settings = await this.loadSettings();
    
    // Select the appropriate permissions dictionary
    const permKey = permission === 'start' ? 'UserStartPermissions' : 'UserStopPermissions';
    
    if (!settings.DiscordSettings[permKey][userId]) {
      settings.DiscordSettings[permKey][userId] = [];
    }
    
    if (action === 'add') {
      // Add permission if it doesn't exist
      if (!settings.DiscordSettings[permKey][userId].includes(container)) {
        settings.DiscordSettings[permKey][userId].push(container);
      }
    } else if (action === 'remove') {
      // Remove permission if it exists
      settings.DiscordSettings[permKey][userId] = settings.DiscordSettings[permKey][userId].filter(c => c !== container);
      
      // Clean up empty arrays
      if (settings.DiscordSettings[permKey][userId].length === 0) {
        delete settings.DiscordSettings[permKey][userId];
      }
    }
    
    await this.saveSettings(settings);
  }

  /**
   * Update role permissions
   * @param {string} roleId - Role ID
   * @param {string} container - Container name
   * @param {string} permission - Permission type ('start' or 'stop')
   * @param {string} action - Action to perform ('add' or 'remove')
   * @returns {Promise<void>}
   */
  async updateRolePermissions(roleId, container, permission, action) {
    const settings = await this.loadSettings();
    
    // Select the appropriate permissions dictionary
    const permKey = permission === 'start' ? 'RoleStartPermissions' : 'RoleStopPermissions';
    
    if (!settings.DiscordSettings[permKey][roleId]) {
      settings.DiscordSettings[permKey][roleId] = [];
    }
    
    if (action === 'add') {
      // Add permission if it doesn't exist
      if (!settings.DiscordSettings[permKey][roleId].includes(container)) {
        settings.DiscordSettings[permKey][roleId].push(container);
      }
    } else if (action === 'remove') {
      // Remove permission if it exists
      settings.DiscordSettings[permKey][roleId] = settings.DiscordSettings[permKey][roleId].filter(c => c !== container);
      
      // Clean up empty arrays
      if (settings.DiscordSettings[permKey][roleId].length === 0) {
        delete settings.DiscordSettings[permKey][roleId];
      }
    }
    
    await this.saveSettings(settings);
  }
}

// Export the class rather than an instance
module.exports = { SettingsService };
