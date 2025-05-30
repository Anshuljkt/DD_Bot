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
using Discord;
using Discord.WebSocket;
using DD_Bot.Application.Services;
using System.Linq;
using System.Threading;
using DD_Bot.Domain;
using System.Threading.Tasks;

namespace DD_Bot.Application.Commands
{
    public class DockerCommand
    {
        private DiscordSocketClient _discord;

        public DockerCommand(DiscordSocketClient discord)
        {
            _discord=discord;
        }

        #region CreateCommand

        public static ApplicationCommandProperties Create() //Create-Methode mit 3 Auswahlmöglichkeiten für den Reiter Command
        {
            var builder = new SlashCommandBuilder()
            {
                Name = "docker",
                Description = "Issue a command to Docker"
            };

            builder.AddOption("dockername",
                ApplicationCommandOptionType.String,
                    "choose a container",
                    true);

            builder.AddOption(new SlashCommandOptionBuilder()
                .WithName("command")
                .WithDescription("choose a command")
                .WithType(ApplicationCommandOptionType.String)
                .WithRequired(true)
                .AddChoice("start", "start")
                .AddChoice("stop", "stop")
                .AddChoice("restart", "restart")
                .AddChoice("exec", "exec")
                .AddChoice("jfFix", "jfFix")
            );

            // Add cli parameter that's only required when command is "exec"
            builder.AddOption("cli",
                ApplicationCommandOptionType.String,
                "command to execute in the container",
                isRequired: false);

            return builder.Build();
        }

        #endregion

        #region ExecuteCommand

        public static async Task Execute(SocketSlashCommand arg, DockerService dockerService, DiscordSettings settings)
        {
            await arg.DeferAsync();
            await dockerService.DockerUpdate();
            
            string command = arg.Data.Options.FirstOrDefault(option => option.Name == "command")?.Value as string;
            string dockerName = arg.Data.Options.FirstOrDefault(option => option.Name == "dockername")?.Value as string;
            string cliCommand = arg.Data.Options.FirstOrDefault(option => option.Name == "cli")?.Value as string;
            Task<string> execOutput = null;

            if (command.Equals("jfFix")) {
                command = "jfFix";
                dockerName = "jellyfin";
            }

            #region authCheck

            bool authorized = true;
            
            if (!settings.AdminIDs.Contains(arg.User.Id)) //Auth Checks
            {
                authorized = false;
                var socketUser = arg.User as SocketGuildUser;
                var guild = socketUser.Guild;
                var socketGuildUser = guild.GetUser(socketUser.Id);
                var userRoles = socketGuildUser.Roles;

                switch (command)
                {
                    case "start":
                        if (settings.UserStartPermissions.ContainsKey(arg.User.Id))
                        {
                            if (settings.UserStartPermissions[arg.User.Id].Contains(dockerName))
                            {
                                authorized = true;
                            }
                        }
                        foreach (var role in userRoles)
                        {
                            if (settings.RoleStartPermissions.ContainsKey(role.Id))
                            {
                                if (settings.RoleStartPermissions[role.Id].Contains(dockerName))
                                {
                                    authorized = true;
                                }
                            }
                        }
                        break;
                    case "stop":
                    case "restart":
                    case "exec":
                    case "jfFix":
                        if (settings.UserStopPermissions.ContainsKey(arg.User.Id))
                        {
                            if (settings.UserStopPermissions[arg.User.Id].Contains(dockerName))
                            {
                                authorized = true;
                            }
                        }
                        foreach (var role in userRoles)
                        {
                            if (settings.RoleStopPermissions.ContainsKey(role.Id))
                            {
                                if (settings.RoleStopPermissions[role.Id].Contains(dockerName))
                                {
                                    authorized = true;
                                }
                            }
                        }
                        break;
                }

                if (!authorized)
                {
                    await arg.ModifyOriginalResponseAsync(edit =>
                        edit.Content = "You are not allowed to use this command");
                    return;
                }
            }

            #endregion

            if (string.IsNullOrEmpty(dockerName)) //Schaut ob ein Name für den Docker eingegeben wurde
            {
                await arg.ModifyOriginalResponseAsync(edit => edit.Content = "No container has been specified");
                return;
            }


            var docker = dockerService.DockerStatus.FirstOrDefault(docker => docker.Names[0] == dockerName);

            if (docker == null) //Schaut ob gesuchter Docker Existiert
            {
                await arg.ModifyOriginalResponseAsync(edit => edit.Content = "Container doesn't exist!");
                return;
            }

            var dockerId = docker.ID;

            switch (command)
            {
                case "start":
                    if (dockerService.RunningDockers.Contains(dockerName))
                    {
                        await arg.ModifyOriginalResponseAsync(edit => edit.Content = string.Format(dockerName + " is already running"));
                        return;
                    }
                    break;
                case "stop":
                case "restart":
                    if (dockerService.StoppedDockers.Contains(dockerName))
                    {
                        await arg.ModifyOriginalResponseAsync(edit => edit.Content = string.Format(dockerName + " is already stopped"));
                        return;
                    }
                    break;
            }

            switch (command)
            {
               case "start":
                   await dockerService.DockerCommandStart(dockerId);
                    return;
               case "stop":
                   await dockerService.DockerCommandStop(dockerId);
                    return;
               case "restart":
                   await dockerService.DockerCommandRestart(dockerId);
                    return;
               case "exec": 
                   execOutput = dockerService.DockerCommandExec(dockerId, cliCommand);
                    return;
               case "jfFix":
                    // Respond immediately
                    await arg.ModifyOriginalResponseAsync(edit => 
                        edit.Content = "Starting JF Fix process. This may take several minutes...");
                        
                    // Run the long operation in a background task
                    _ = Task.Run(async () => {
                        try {
                            string result = await dockerService.DockerCustomCommandJFFix();
                            // Send a follow-up message when complete
                            await arg.FollowupAsync($"JF Fix completed:\n```\n{result}\n```");
                        }
                        catch (Exception ex) {
                            await arg.FollowupAsync($"Error during JF Fix: {ex.Message}");
                        }
                    });
                    return; // Return early, don't wait for the operation to complete
            }

            await arg.ModifyOriginalResponseAsync(edit =>
                edit.Content = "Command has been sent. Awaiting response. This will take up to " + dockerService.Settings.Retries * dockerService.Settings.TimeBeforeRetry + " Seconds.");

            for (int i = 0; i < dockerService.Settings.Retries; i++)
            {
                await Task.Delay(TimeSpan.FromSeconds(dockerService.Settings.TimeBeforeRetry));
                await dockerService.DockerUpdate();
                
                switch (command)
                {
                    case "start":
                        if (dockerService.RunningDockers.Contains(dockerName))
                        {
                            await arg.ModifyOriginalResponseAsync(edit => edit.Content = arg.User.Mention+ " " + dockerName + " has been started");
                            return;
                        }
                        else
                        {
                            break;
                        }
                    case "stop":
                        if (dockerService.StoppedDockers.Contains(dockerName))
                        {
                            await arg.ModifyOriginalResponseAsync(edit => edit.Content = arg.User.Mention + " " + dockerName + " has been stopped");
                            return;
                        }
                        else
                        {
                            break;
                        }
                    case "restart":
                        if (dockerService.RunningDockers.Contains(dockerName))
                        {
                            await arg.ModifyOriginalResponseAsync(edit => edit.Content = arg.User.Mention + " " + dockerName +  " has been restarted");
                            return;
                        }
                        else
                        {
                            break;
                        }
                    case "exec":
                    case "jfFix":
                        if (execOutput != null && execOutput.IsCompleted) 
                        {
                            await arg.ModifyOriginalResponseAsync(edit => edit.Content = arg.User.Mention + " Response from Script (Stdout): \n" + execOutput.Result);
                            return;
                        }
                        else 
                        {
                            break;
                        }                    
                }
            }
            
            
            await dockerService.DockerUpdate();

            switch (command)
            {
                case "start":
                    if (dockerService.RunningDockers.Contains(dockerName))
                    {
                        await arg.ModifyOriginalResponseAsync(edit => edit.Content = arg.User.Mention+ " " + dockerName + " has been started");
                        return;
                    }
                    else
                    {
                        await arg.ModifyOriginalResponseAsync(edit => edit.Content = arg.User.Mention + " " + dockerName + " could not be started");
                        return;
                    }
                case "stop":
                    if (dockerService.StoppedDockers.Contains(dockerName))
                    {
                        await arg.ModifyOriginalResponseAsync(edit => edit.Content = arg.User.Mention + " " + dockerName + " has been stopped");
                        return;
                    }
                    else
                    {

                        await arg.ModifyOriginalResponseAsync(edit => edit.Content = arg.User.Mention + " " + dockerName +  " could not be stopped");

                        return;
                    }
                case "restart":
                    if (dockerService.RunningDockers.Contains(dockerName))
                    {
                        await arg.ModifyOriginalResponseAsync(edit => edit.Content = arg.User.Mention + " " + dockerName +  " has been restarted");
                        return;
                    }
                    else
                    {
                        await arg.ModifyOriginalResponseAsync(edit => edit.Content = arg.User.Mention + " " + dockerName +  " could not be restarted");
                        return;
                    }
            }
        }

        #endregion
    }
}