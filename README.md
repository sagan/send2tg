**send2tg** is a completely stateless, self-hosting service that allows you to send notes, links, files, and images directly to your Telegram chats. It runs on the Cloudflare Workers serverless platform, making it fast, secure, and cost-effective.

This repository contains the core Cloudflare Worker backend, a web client, and a browser extension.

[Demo server](https://send2tg.sagan.me/)

- [Project Structure](#project-structure)
- [Core Features](#core-features)
- [Deployment Guide](#deployment-guide)
	- [Step 1: Prerequisites](#step-1-prerequisites)
	- [Step 2: Fork and Connect to Cloudflare](#step-2-fork-and-connect-to-cloudflare)
	- [Step 3: Configure Variables](#step-3-configure-variables)
	- [Step 4: Set Telegram Webhook](#step-4-set-telegram-webhook)
- [Local Development](#local-development)
	- [Step 1: Clone and Install](#step-1-clone-and-install)
	- [Step 2: Configure Local Environment](#step-2-configure-local-environment)
	- [Step 3: Run the Development Server](#step-3-run-the-development-server)
	- [Browser Extension Development](#browser-extension-development)
	- [Web app Development](#web-app-development)


## Project Structure

This project is a monorepo managed with npm workspaces. It is organized as follows:

- `/` (root): The core Cloudflare Worker project that handles the API logic.
- `/client`: A React-based web application that provides a user interface for sending messages. It is deployed as a static asset alongside the worker.
- `/web_extension`: A browser extension (for Chrome/Firefox) that allows sending content via a popup and a right-click context menu.
- `/lib`: A shared library containing common code (types, auth logic, etc.) used across the other projects.

## Core Features

- **Completely Stateless:** No database required. Authorization is handled securely via signed tokens.
- **Self-Hosted & Secure:** You control your data. The service runs on your own Cloudflare account.
- **Multiple Clients:** Use the included web app or the powerful browser extension.
- **Versatile Sending:** Send selected text, links, images from context menus, or type messages and attach local files.
- **Multi-Chat Support:** Configure and send messages to any number of personal chats, groups, or channels.
- **Private & Public Modes:** Can be configured to be a private service for personal use or opened up for others.
- **Privacy keeped**: The server / web client / browser extension do NOT log, collect or store any data of any kind. There is not any analytic or telemetry hooks in code.

## Deployment Guide

The recommended way to deploy `send2tg` is by connecting your own fork of this repository to Cloudflare.

### Step 1: Prerequisites

- A [GitHub](https://github.com/) account.
- A [Cloudflare](https://www.cloudflare.com/) account.
- A Telegram Bot. You can create one by talking to [@BotFather](https://t.me/BotFather) on Telegram.

### Step 2: Fork and Connect to Cloudflare

1. **Fork this repository** on GitHub.
2. Log in to your Cloudflare dashboard.
3. Navigate to **Workers & Pages** -> **Create application** -> **Connect to Git**.
4. Select your newly forked repository.
5. In the **Build settings** section, configure your project:
    - **Root directory**: `/`
    - **Build command**: `npm run build:all`
    - The building process will generate the `wrangler.jsonc` file dynamically based on `wrangler.example.jsonc`. Cloudflare will handle the output directory and asset configuration automatically using `wrangler.jsonc`.

### Step 3: Configure Variables

In your new application's settings, navigate to **Settings**, add the following variables for your production deployment.

**Variables and Secrets** (runtime variables):

Any change takes effect immediately.

- `BOT_TOKEN`: The token for your Telegram bot, obtained from `@BotFather`.
- `BOT_NAME`: Your bot's username (e.g., `my_send_bot`), without the `@` prefix.
- `TOKEN` (optional but recommended to set): A private access token for your `send2tg` instance. This prevents unauthorized users from using your service. If not set, the `BOT_TOKEN` value is used as `TOKEN`.

To generate secure random values for `TOKEN`, you can use the following commands:

- **Linux/macOS:** `tr -dc A-Za-z0-9 </dev/urandom | head -c 32 ; echo ''`
- **Windows PowerShell:** `Add-Type -AssemblyName System.Web; ([System.Web.Security.Membership]::GeneratePassword(64, 0) -replace '[^a-zA-Z0-9]')[0..31] -join ''`

**Build - Variables and secrets** (build time variables):

All these variables are optional. Any changes requires re-deployment to take effect.

- `SITENAME`: The name of your application, which will be displayed in the web app's title. (Default: `Send2Tg`)
- `FAVICON_URL`: Custom site favicon (icon) image url. It's recommended to use an .png image of 512x512 size.
- `PUBLIC_LEVEL`: Controls the access level of your service.
    - `0` (Private - Default): The service is completely private. Only an admin with the `TOKEN` can authorize new chats.
    - `1` (Public Bot): Anyone can use the Telegram bot, but they must first visit the web app to get a dynamically generated `start_token`.
    - `2` (Fully Public): Anyone can use the web app and bot.

### Step 4: Set Telegram Webhook

After your first successful deployment, you need to setup the Telegram bot Webhook. Open the deployed Worker url (e.g. `https://example.worker.dev`), in "New Chat" dialog, enter your token to authorize, then click `SET` button.

This action is only required once. Your `send2tg` instance is now live and ready to use.

## Local Development

To run the project locally in development environment, follow these steps.

### Step 1: Clone and Install

Clone the repository and install all dependencies using npm workspaces.

```
git clone https://github.com/sagan/send2tg.git
cd send2tg
npm install
```

### Step 2: Configure Local Environment

Copy the example configuration files. These files are for local development and are ignored by Git.

```
# For the backend worker configuration
cp wrangler.example.jsonc wrangler.jsonc

# For the frontend build configuration
cp lib/.env.example lib/.env.local
```

Now, open `wrangler.jsonc` and `lib/.env.local` and fill in the variables as described in the "Deployment Guide".

### Step 3: Run the Development Server

To run the worker and web client locally, use the `cfdev` command. This starts a local server that simulates the Cloudflare environment.

```
# Run the local development server
npm run cfdev
```

The web client will be available at the local URL provided by Wrangler (usually `http://localhost:8787`).


### Web app Development

Run `npm start` in root folder, then open `http://localhost:5173/` in browser.

Please note that Telegram webhook requires a `https` url. So you need a reverse proxy to make it work.

### Browser Extension Development

To work on the browser extension, run its specific development script. This will start Vite in watch mode.

```
# Build the extension in development mode and watch for changes
npm run dev:chrome
```

Then, load the `web_extension/dist_chrome` directory as an unpacked extension in Chrome's developer mode.

