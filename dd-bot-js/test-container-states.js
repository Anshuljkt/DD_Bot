const Docker = require('dockerode');
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * Test script to validate container state checking
 */
async function testContainerStates() {
  try {
    console.log('Testing container state detection and manipulation...');
    
    // Get all containers
    const containers = await docker.listContainers({ all: true });
    console.log(`Found ${containers.length} containers`);
    
    if (containers.length === 0) {
      console.log('No containers found to test with.');
      return;
    }
    
    // Display all containers with their states
    console.log('\nAll container states:');
    containers.forEach(c => {
      console.log(`${c.Names[0].replace('/', '')} - State: ${c.State}, Status: ${c.Status}`);
    });
    
    // Pick the first container for detailed testing
    const testContainer = containers[0];
    const containerName = testContainer.Names[0].replace('/', '');
    console.log(`\nSelected container for testing: ${containerName}`);
    
    // Get the container object
    const container = docker.getContainer(testContainer.Id);
    
    // Inspect the container for more detailed state info
    const inspectData = await container.inspect();
    console.log('\nContainer inspection data:');
    console.log(`Name: ${containerName}`);
    console.log(`ID: ${testContainer.Id.substring(0, 12)}`);
    console.log(`State object type: ${typeof inspectData.State}`);
    console.log(`State: ${JSON.stringify(inspectData.State, null, 2)}`);
    console.log(`Running: ${inspectData.State.Running}`);
    console.log(`Status: ${inspectData.State.Status}`);
    console.log(`ExitCode: ${inspectData.State.ExitCode}`);
    
    // Compare with the basic container state from listContainers
    console.log('\nComparing with basic container state:');
    console.log(`listContainers() State: ${testContainer.State}`);
    console.log(`inspect() State.Status: ${inspectData.State.Status}`);
    
    console.log('\nCorrect way to check if a container is running:');
    console.log(`Using listContainers(): container.State === 'running' => ${testContainer.State === 'running'}`);
    console.log(`Using inspect(): container.State.Running => ${inspectData.State.Running}`);
    
  } catch (error) {
    console.error('Error during testing:', error);
  }
}

// Run the test
testContainerStates();
