/**
 * DD_Bot - A Discord Bot to control Docker containers
 * Docker Service to interact with Docker API
 */

const Docker = require('dockerode');

class DockerService {
  constructor(settings) {
    // Connect to Docker socket
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
    this.containers = [];
    this.updateInterval = null;
    this.settings = settings;
  }

  /**
   * Initialize the Docker service
   */
  async init() {
    await this.dockerUpdate();
    // Set up periodic updates
    this.updateInterval = setInterval(() => this.dockerUpdate(), 60000); // Update every minute
  }

  /**
   * Update container list from Docker API
   */
  async dockerUpdate() {
    try {
      this.containers = await this.docker.listContainers({ all: true });
      console.log(`Updated container list: ${this.containers.length} containers found`);
      
      // Debug first container if available
      if (this.containers.length > 0) {
        console.log(`First container details: ID=${this.containers[0].Id.substring(0, 12)}, State=${this.containers[0].State}, Status=${this.containers[0].Status}`);
      }
      
      return this.containers;
    } catch (error) {
      console.error(`Error updating containers: ${error.message}`);
      return [];
    }
  }

  /**
   * Get container by ID or name
   * @param {string} idOrName - Container ID or name
   * @returns {Object|null} Container object or null if not found
   */
  getContainer(idOrName) {
    const container = this.containers.find(c => 
      c.Id === idOrName || 
      c.Names.some(name => name.replace('/', '') === idOrName)
    );
    
    return container ? this.docker.getContainer(container.Id) : null;
  }

  /**
   * Start a container
   * @param {string} id - Container ID or name
   * @returns {Promise<boolean>} Success status
   */
  async dockerCommandStart(id) {
    try {
      console.log(`Attempting to start container: ${id}`);
      const container = this.getContainer(id);
      if (!container) {
        throw new Error(`Container '${id}' not found`);
      }
      
      // Inspect the container before starting
      const inspectData = await container.inspect();
      console.log(`Container state before start: ${JSON.stringify(inspectData.State)}`);
      
      if (inspectData.State.Running) {
        console.log(`Container ${id} is already running`);
        return true;
      }
      
      console.log(`Starting container ${id}...`);
      await container.start();
      console.log(`Start command sent to ${id}`);
      
      // Inspect the container after starting
      const afterInspect = await container.inspect();
      console.log(`Container state after start: ${JSON.stringify(afterInspect.State)}`);
      
      await this.dockerUpdate();
      return afterInspect.State.Running;
    } catch (error) {
      console.error(`Error starting container ${id}: ${error.message}`);
      return false;
    }
  }

  /**
   * Stop a container
   * @param {string} id - Container ID or name
   * @returns {Promise<boolean>} Success status
   */
  async dockerCommandStop(id) {
    try {
      const container = this.getContainer(id);
      if (!container) {
        throw new Error(`Container '${id}' not found`);
      }
      
      await container.stop();
      await this.dockerUpdate();
      return true;
    } catch (error) {
      console.error(`Error stopping container ${id}: ${error.message}`);
      return false;
    }
  }

  /**
   * Restart a container
   * @param {string} id - Container ID or name
   * @returns {Promise<boolean>} Success status
   */
  async dockerCommandRestart(id) {
    try {
      const container = this.getContainer(id);
      if (!container) {
        throw new Error(`Container '${id}' not found`);
      }
      
      await container.restart();
      await this.dockerUpdate();
      return true;
    } catch (error) {
      console.error(`Error restarting container ${id}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Execute a command inside a container
   * @param {string} id - Container ID or name
   * @param {string} command - Command to execute
   * @returns {Promise<string>} Command output
   */
  async dockerCommandExec(id, command) {
    try {
      const container = this.getContainer(id);
      if (!container) {
        throw new Error(`Container '${id}' not found`);
      }
      
      const exec = await container.exec({
        // Use bash for command execution with proper argument parsing
        Cmd: ['bash', '-c', command],
        AttachStdout: true,
        AttachStderr: true
      });
      
      const stream = await exec.start();
      
      return new Promise((resolve, reject) => {
        let stdoutOutput = '';
        let stderrOutput = '';
        
        // Handle stdout data
        stream.on('data', (chunk) => {
          stdoutOutput += chunk.toString();
        });
        
        // Handle stderr data if available
        stream.stderr?.on('data', (chunk) => {
          stderrOutput += chunk.toString();
        });
        
        // Handle stream end
        stream.on('end', () => {
          // If there's stderr output, include it in the result
          const output = stderrOutput ? 
            `STDOUT:\n${stdoutOutput}\nSTDERR:\n${stderrOutput}` : 
            stdoutOutput;
          resolve(output);
        });
        
        // Handle errors
        stream.on('error', (err) => {
          reject(err);
        });
      });
    } catch (error) {
      console.error(`Error executing command in container ${id}: ${error.message}`);
      return `Error: ${error.message}`;
    }
  }
  
  /**
   * Special command for fixing Jellyfin and related services
   * @returns {Promise<string>} Command output
   */
  async dockerCustomCommandJFFix() {
    const output = [];
    const containers = ['jellyfin', 'jellystat', 'jellystat-db'];
    
    // Stop containers
    console.log('Stopping containers...');
    output.push('Stopping containers...');
    
    for (const containerName of containers) {
      const container = this.getContainerByName(containerName);
      if (container) {
        console.log(`Stopping ${containerName}...`);
        await this.dockerCommandStop(container.Id);
      }
    }
    
    // Wait for containers to stop with retries
    console.log('Waiting for containers to stop...');
    let allStopped = false;
    
    for (let i = 0; i < this.settings.DockerSettings.Retries; i++) {
      console.log(`Retry ${i + 1}/${this.settings.DockerSettings.Retries} - Checking container status...`);
      await new Promise(resolve => setTimeout(resolve, this.settings.DockerSettings.TimeBeforeRetry * 1000));
      await this.dockerUpdate();
      
      allStopped = true;
      for (const containerName of containers) {
        const container = this.getContainerByName(containerName);
        if (container && container.State === 'running') {
          console.log(`${containerName} is still running... (State: ${container.State}, Status: ${container.Status})`);
          allStopped = false;
          break;
        }
      }
      
      if (allStopped) {
        console.log('All containers stopped successfully.');
        output.push('All containers stopped successfully.');
        break;
      }
    }
    
    // Start Jellyfin first
    console.log('Starting Jellyfin...');
    output.push('Starting Jellyfin...');
    
    const jellyfin = this.getContainerByName('jellyfin');
    if (jellyfin) {
      await this.dockerCommandStart(jellyfin.Id);
      
      // Wait for Jellyfin to start with retries
      console.log('Waiting for Jellyfin to start...');
      let jellyfinStarted = false;
      
      for (let i = 0; i < this.settings.DockerSettings.Retries; i++) {
        console.log(`Retry ${i + 1}/${this.settings.DockerSettings.Retries} - Checking Jellyfin status...`);
        await new Promise(resolve => setTimeout(resolve, this.settings.DockerSettings.TimeBeforeRetry * 1000));
        await this.dockerUpdate();
        
        const updatedJellyfin = this.getContainerByName('jellyfin');
        if (updatedJellyfin && updatedJellyfin.State === 'running') {
          console.log('Jellyfin started successfully.');
          output.push('Jellyfin started successfully.');
          jellyfinStarted = true;
          break;
        }
      }
      
      if (!jellyfinStarted) {
        console.log('Failed to start Jellyfin.');
        output.push('Failed to start Jellyfin.');
        return output.join('\n');
      }
    } else {
      console.log('Jellyfin container not found.');
      output.push('Jellyfin container not found.');
      return output.join('\n');
    }
    
    // Wait additional time for Jellyfin to fully initialize
    console.log('Waiting for Jellyfin to initialize...');
    output.push('Waiting for Jellyfin to initialize...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    
    // Start remaining containers
    console.log('Starting remaining containers...');
    output.push('Starting remaining containers...');
    
    for (const containerName of ['jellystat-db', 'jellystat']) {
      const container = this.getContainerByName(containerName);
      if (container) {
        console.log(`Starting ${containerName}...`);
        await this.dockerCommandStart(container.Id);
      }
    }
    
    // Final check
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    await this.dockerUpdate();
    
    let allRunning = true;
    for (const containerName of containers) {
      const container = this.getContainerByName(containerName);
      if (!container || container.State !== 'running') {
        console.log(`${containerName} is not running.`);
        output.push(`${containerName} is not running.`);
        allRunning = false;
      }
    }
    
    if (allRunning) {
      console.log('All containers are running successfully.');
      output.push('All containers are running successfully.');
    } else {
      console.log('Not all containers are running. JF Fix may not have succeeded completely.');
      output.push('Not all containers are running. JF Fix may not have succeeded completely.');
    }
    
    return output.join('\n');
  }
  
  /**
   * Helper to get container by name
   * @param {string} name - Container name
   * @returns {Object|null} Container object or null
   */
  /**
   * Helper to get container by name
   * @param {string} name - Container name
   * @returns {Object|null} Container object or null
   */
  getContainerByName(name) {
    return this.containers.find(container =>
      container.Names.some(containerName => containerName.replace('/', '') === name)
    );
  }

  /**
   * Get container information
   * @returns {Array<Object>} Array of container information objects
   */
  getContainerInfo() {
    return this.containers.map(container => {
      // Format container information
      const name = container.Names[0].replace('/', '');
      const state = container.State;
      const status = container.Status;
      
      return {
        id: container.Id.substring(0, 12), // Short ID
        name,
        state,
        status,
        image: container.Image
      };
    });
  }
  
  /**
   * Check if a container is running
   * @param {Object} container - Container object from dockerode
   * @returns {boolean} True if running, false otherwise
   */
  isContainerRunning(container) {
    // Possible state values: "created", "running", "paused", "restarting", "exited", "dead"
    return container.State === 'running';
  }
}

// Export the class rather than an instance to allow proper initialization with settings
module.exports = { DockerService };
