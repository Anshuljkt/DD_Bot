const Docker = require('dockerode');
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Function to test container properties
async function testContainerProperties() {
  try {
    console.log('Fetching all containers...');
    const containers = await docker.listContainers({ all: true });
    console.log(`Found ${containers.length} containers`);
    
    if (containers.length > 0) {
      console.log('\nSample container properties:');
      console.log(JSON.stringify(containers[0], null, 2));
      
      // Get detailed container info
      const container = docker.getContainer(containers[0].Id);
      console.log('\nDetailed container inspection:');
      const info = await container.inspect();
      console.log('Container State:', info.State);
      console.log('Container State Type:', typeof info.State);
      console.log('State Running:', info.State.Running);
      console.log('State Status:', info.State.Status);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testContainerProperties();
