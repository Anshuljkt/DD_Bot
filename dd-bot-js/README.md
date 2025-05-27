# DD_Bot JavaScript Version

A Discord bot to control Docker containers, written in JavaScript with Discord.js.

## Features

- Start, stop, and restart Docker containers via Discord commands
- Execute commands inside containers
- List all containers with their status
- Role and user-based permissions system
- Special JF Fix command for Jellyfin-related services

## Installation

### Prerequisites

- Node.js 16.x or later
- Docker (with access to the Docker socket)
- A Discord bot token

### Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with your Discord bot token:
   ```
   DISCORD_TOKEN=your_token_here
   ```
4. Start the bot:
   ```
   node index.js
   ```

### Docker Installation

You can also run the bot in Docker:

```bash
docker build -t dd-bot-js .
docker run -v /var/run/docker.sock:/var/run/docker.sock -v $(pwd)/settings:/app/settings --env-file .env dd-bot-js
```

## Commands

- `/ping` - Test if the bot is responsive
- `/docker [container] [command]` - Control Docker containers
- `/list [filter]` - List Docker containers
- `/admin [subcommand]` - Manage bot administrators
- `/user [subcommand]` - Manage user permissions
- `/role [subcommand]` - Manage role permissions
- `/permission` - Check your permissions

## Configuration

Edit the settings in `settings/settings.json` to configure:
- Admin users
- Role and user permissions
- Docker settings

## License

GNU General Public License v3.0
