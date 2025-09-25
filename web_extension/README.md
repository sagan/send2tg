# Send to Telegram Browser Extension

Send notes, links, and images directly to your Telegram chats from your browser.

This extension is the browser extension for the self-hosted [send2tg] web app. It seamlessly integrates your browser with your Telegram account, allowing you to save anything you find online with just a few clicks.

## Core Features

- Quick Send Popup: A clean and simple interface to type messages, attach files, and send them to any of your configured Telegram chats.
- Context Menu Integration: Right-click on any selected text, link, or image on a webpage to send it instantly to a specific chat. No need to copy and paste!
- Multi-Chat Support: Add and manage multiple Telegram chats (personal chats, group chats, or channels) and switch between them effortlessly.
- Message History: The popup displays your most recent sent messages for each chat, so you can keep track of what you've saved.
- File Attachments: Send local files through the popup or images directly from web pages.
- Secure & Private: The extension communicates directly with your own self-hosted send2tg server instance. Your data, API keys, and chats remain under your control.

## Getting Started

This extension requires to be used with a [send2tg] server. The server runs on Cloudflare Workers. It's recommended to setup your own server following the steps of [GitHUb][send2tg]. For test purpose, you can use our [public server](https://send2tg.sagan.me/).

1. Set Up Your Server: Deploy your own send2tg instance using the instructions from [GitHUb][send2tg].
2. Install the Extension: Add the "Send to Telegram" extension to your browser from the Chrome Web Store.
3. Configure the Extension:
   - Click the extension icon and go to Options.
   - Enter the URL of your send2tg server and save it.
   - Click "+ Add New Chat" and follow the on-screen instructions to authorize the extension with your Telegram bot. This multi-step process ensures a secure connection.

## How to Use

### Sending from the Popup

1. Click the "Send to Telegram" icon in your browser's toolbar.
2. Select the desired chat from the sidebar on the left.
3. Type a message, attach a file, or both.
4. Click Send.

### Sending from the Context Menu

1. On any webpage, select a snippet of text, or right-click on a link or an image.
2. In the right-click menu, hover over "Send to Telegram".
3. Click on the name of the chat you wish to send the content to.
4. You'll receive a browser notification confirming the message was sent. The sent message will also appear in popup page.

## Privacy Policy

Your privacy is our priority. This extension is designed with the following principles:

- No Data Collection: The extension and the send2tg server does not log, collect, store your personal data, or transmit them to third-party servers (other then sending to Telegram server on behalf of you).
- Self-Hosted Communication: All communication happens directly between this extension in your browser and your own send2tg server instance.
- Local & Sync Storage: Your server URL and chat configurations are stored securely using chrome.storage.sync, which syncs them across your devices where you are logged into your browser. Your message history and selected chat are stored in chrome.storage.local on your device only.

[send2tg]: https://github.com/sagan/seng2tg
