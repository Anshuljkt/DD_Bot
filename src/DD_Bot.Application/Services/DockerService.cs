﻿/* DD_Bot - A Discord Bot to control Docker containers*/

/*  Copyright (C) 2022 Maxim Kovac

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.

*/

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using DD_Bot.Application.Interfaces;
using DD_Bot.Domain;
using Microsoft.Extensions.Configuration;
using Docker.DotNet;
using Docker.DotNet.Models;
using Timer = System.Timers.Timer;
using System.Threading;

namespace DD_Bot.Application.Services
{
    public class DockerService : IDockerService
    {
        private readonly IConfigurationRoot _configuration;
        private IList<ContainerListResponse> _dockerResponse;
        public List<ContainerListResponse> DockerStatus { get; private set; }
        private readonly DockerClient _client = new DockerClientConfiguration(
                new Uri("unix:///var/run/docker.sock"))
            .CreateClient();

        public DockerSettings Settings => _configuration.Get<Settings>().DockerSettings;
        public DockerService(IConfigurationRoot configuration) // Initialising
        {
            _configuration = configuration;
            DockerUpdate().GetAwaiter().GetResult();
            var updateTimer = new Timer();
            updateTimer.Interval = TimeSpan.FromMinutes(5).TotalMilliseconds;
            updateTimer.Elapsed += (s, e) => DockerUpdate().GetAwaiter().GetResult();
            updateTimer.AutoReset = true;
            updateTimer.Start();
        }

     public string[] RunningDockers => DockerStatus.Where(docker => docker.Status.Contains("Up")).Select(pairs => pairs.Names[0]).ToArray();
     public string[] StoppedDockers => DockerStatus.Where(docker => !docker.Status.Contains("Up")).Select(pairs => pairs.Names[0]).ToArray();
     
        public async Task DockerUpdate() //Update
        {
            _dockerResponse = await _client.Containers.ListContainersAsync(new ContainersListParameters(){All = true});
            DockerStatus = new List<ContainerListResponse>();
            foreach (var variable in _dockerResponse)
            {
                DockerStatus.Add(variable);
            }
            
            if (DockerStatus == null) return;
            {
                foreach (var variable in DockerStatus)
                {
                    variable.Names[0] = variable.Names[0].Substring(1);
                }
            }
            DockerContainerSort();
        }

        private void DockerContainerSort()
        {
            DockerStatus.Sort((x,y)=>String.Compare(x.Names[0], y.Names[0], StringComparison.Ordinal));
        }

        public int DockerStatusLongestName()
        {
            int counter = 0;
            foreach (var item in DockerStatus)
            {
                if (item.Names[0].Length> counter)
                {
                    counter = item.Names[0].Length;
                }
            }
            return counter;
        }

        public async Task DockerCommandStart(string id)
        {
            await _client.Containers.StartContainerAsync(id, new ContainerStartParameters());
        }

        public async Task DockerCommandStop(string id)
        {
            await _client.Containers.StopContainerAsync(id, new ContainerStopParameters());
        }

        public async Task DockerCommandRestart(string id)
        {
            await _client.Containers.RestartContainerAsync(id, new ContainerRestartParameters());
        }

        public async Task<string> DockerCommandExec(string id, string command)
        {            
            var cliCommands = new ContainerExecCreateParameters(){
                AttachStderr = true,
                AttachStdin = false,
                AttachStdout = true,
                // Cmd = new string[] { "bash", "-c", "echo \"stdout: $1\" && echo \"stderr: $2\" >&2 && echo \"stdout: $1\nstderr: $2\" > test_output.txt", "bash", "param1", "param2" },
                Cmd = new string[] {"bash", "-c", command},
                // Cmd = new List<string>(){ "env", "TERM=xterm-256color", "bash" }
                // Cmd = new List<string>() {command}
                Detach = false,
                Tty = false,
                User = "root",
                Privileged = true
            };

            ContainerExecCreateResponse resp = await _client.Exec.ExecCreateContainerAsync(id, cliCommands).ConfigureAwait(false);
            
            using (var stream = await _client.Exec.StartAndAttachContainerExecAsync(resp.ID, false).ConfigureAwait(false))
            {
                var output = await stream.ReadOutputToEndAsync(CancellationToken.None);
                Console.WriteLine(output.stdout);
                return output.stdout;
            }
        }

        public async Task<string> DockerCustomCommandJFFix() {
            var output = new System.Text.StringBuilder();
            
            // Define container names
            var containers = new[] { "jellyfin", "jellystat", "jellystat-db" };
            
            // Stop containers
            Console.WriteLine("Stopping containers...");
            output.AppendLine("Stopping containers...");
            foreach (var container in containers)
            {
                var docker = DockerStatus.FirstOrDefault(d => d.Names[0] == container);
                if (docker != null)
                {
                    Console.WriteLine($"Stopping {container}...");
                    await DockerCommandStop(docker.ID);
                }
            }
            
            // Wait for containers to stop with retries
            Console.WriteLine("Waiting for containers to stop...");
            for (int i = 0; i < Settings.Retries; i++)
            {
                Console.WriteLine($"Retry {i + 1}/{Settings.Retries} - Checking container status...");
                await Task.Delay(TimeSpan.FromSeconds(Settings.TimeBeforeRetry));
                await DockerUpdate();
                
                bool allStopped = true;
                foreach (var container in containers)
                {
                    if (RunningDockers.Contains(container))
                    {
                        Console.WriteLine($"{container} is still running...");
                        allStopped = false;
                        break;
                    }
                }
                
                if (allStopped)
                {
                    Console.WriteLine("All containers stopped successfully.");
                    output.AppendLine("All containers stopped successfully.");
                    break;
                }
            }
            
            // Start Jellyfin first
            Console.WriteLine("Starting Jellyfin...");
            output.AppendLine("Starting Jellyfin...");
            var jellyfin = DockerStatus.FirstOrDefault(d => d.Names[0] == "jellyfin");
            if (jellyfin != null)
            {
                await DockerCommandStart(jellyfin.ID);
                
                // Wait for Jellyfin to start with retries
                Console.WriteLine("Waiting for Jellyfin to start...");
                for (int i = 0; i < Settings.Retries; i++)
                {
                    Console.WriteLine($"Retry {i + 1}/{Settings.Retries} - Checking Jellyfin status...");
                    await Task.Delay(TimeSpan.FromSeconds(Settings.TimeBeforeRetry));
                    await DockerUpdate();
                    
                    if (RunningDockers.Contains("jellyfin"))
                    {
                        Console.WriteLine("Jellyfin started successfully.");
                        output.AppendLine("Jellyfin started successfully.");
                        break;
                    }
                }
            }
            
            // Start Jellystat and Jellystat-db
            Console.WriteLine("Starting Jellystat and Jellystat-db...");
            output.AppendLine("Starting Jellystat and Jellystat-db...");
            var jellystat = DockerStatus.FirstOrDefault(d => d.Names[0] == "jellystat");
            var jellystatDb = DockerStatus.FirstOrDefault(d => d.Names[0] == "jellystat-db");
            
            if (jellystat != null) 
            {
                Console.WriteLine("Starting Jellystat...");
                await DockerCommandStart(jellystat.ID);
            }
            if (jellystatDb != null) 
            {
                Console.WriteLine("Starting Jellystat-db...");
                await DockerCommandStart(jellystatDb.ID);
            }
            
            // Wait for Jellystat and Jellystat-db to start with retries
            Console.WriteLine("Waiting for Jellystat and Jellystat-db to start...");
            for (int i = 0; i < Settings.Retries; i++)
            {
                Console.WriteLine($"Retry {i + 1}/{Settings.Retries} - Checking Jellystat and Jellystat-db status...");
                await Task.Delay(TimeSpan.FromSeconds(Settings.TimeBeforeRetry));
                await DockerUpdate();
                
                bool allStarted = true;
                if (jellystat != null && !RunningDockers.Contains("jellystat")) 
                {
                    Console.WriteLine("Jellystat is not running yet...");
                    allStarted = false;
                }
                if (jellystatDb != null && !RunningDockers.Contains("jellystat-db")) 
                {
                    Console.WriteLine("Jellystat-db is not running yet...");
                    allStarted = false;
                }
                
                if (allStarted)
                {
                    Console.WriteLine("Jellystat and Jellystat-db started successfully.");
                    output.AppendLine("Jellystat and Jellystat-db started successfully.");
                    break;
                }
            }
            
            // Restart Promtail
            Console.WriteLine("Restarting Promtail...");
            output.AppendLine("Restarting Promtail...");
            var promtail = DockerStatus.FirstOrDefault(d => d.Names[0] == "promtail");
            if (promtail != null)
            {
                await DockerCommandRestart(promtail.ID);
                
                // Wait for Promtail to restart with retries
                Console.WriteLine("Waiting for Promtail to restart...");
                for (int i = 0; i < Settings.Retries; i++)
                {
                    Console.WriteLine($"Retry {i + 1}/{Settings.Retries} - Checking Promtail status...");
                    await Task.Delay(TimeSpan.FromSeconds(Settings.TimeBeforeRetry));
                    await DockerUpdate();
                    
                    if (RunningDockers.Contains("promtail"))
                    {
                        Console.WriteLine("Promtail restarted successfully.");
                        output.AppendLine("Promtail restarted successfully.");
                        break;
                    }
                }
            }
            
            Console.WriteLine("All operations completed.");
            output.AppendLine("All operations completed.");
            return output.ToString();
        }

        public async Task Start()
        {
            await DockerUpdate();
            Console.WriteLine("DockerService started");
        }
    }
}
