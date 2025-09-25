import { serializeChat, UserStateChat } from '@send2tg/lib';

// --- Type Definition for a message record ---
interface RecentMessage {
	id: string;
	chatId: number;
	text: string;
	fileName?: string;
	timestamp: number;
}

// --- Globals to cache storage data ---
// This avoids hitting chrome.storage on every single click event.
// The service worker can be terminated, so these are refreshed when needed.
let serverUrl: string | null = null;
let chats: (UserStateChat & { chat_token?: string })[] = [];

/**
 * Reads settings from chrome.storage.sync and rebuilds the context menus.
 */
async function updateContextMenus() {
	// First, remove all existing context menus created by this extension
	// to prevent duplicates when updating.
	await chrome.contextMenus.removeAll();

	// Load the latest data from storage
	const storage = await chrome.storage.sync.get(['serverUrl', 'chats']);
	const loadedChats = storage.chats || [];
	const loadedServerUrl = storage.serverUrl || null;

	// Update the cached globals
	serverUrl = loadedServerUrl;
	chats = loadedChats;

	// If the server isn't configured or there are no chats, we don't need a menu.
	if (!serverUrl || chats.length === 0) {
		console.log('Send2Tg: No server or chats configured. Context menu not created.');
		return;
	}

	// Create the main parent context menu item
	chrome.contextMenus.create({
		id: 'send2tg_parent',
		title: 'Send to Telegram',
		contexts: ['selection', 'link', 'image'],
	});

	// Create a sub-menu item for each saved chat
	for (const chat of chats) {
		chrome.contextMenus.create({
			id: String(chat.id), // Context menu ID must be a string
			parentId: 'send2tg_parent',
			title: chat.name || `Chat ${chat.id}`,
			contexts: ['selection', 'link', 'image'],
		});
	}
	console.log('Send2Tg: Context menus updated.');
}

/**
 * Saves a record of a sent message to local storage.
 * @param chatId The ID of the chat the message was sent to.
 * @param text The text content of the message.
 * @param fileName The name of the file, if any.
 */
async function saveMessageToHistory(chatId: number, text: string, fileName?: string) {
	const newMessage: RecentMessage = {
		id: `${Date.now()}-${Math.random()}`,
		chatId,
		text,
		fileName,
		timestamp: Date.now(),
	};

	const { recentMessages = [] } = await chrome.storage.local.get('recentMessages');
	const updatedMessages = [...recentMessages, newMessage].slice(-50); // Keep the last 50 messages
	await chrome.storage.local.set({ recentMessages: updatedMessages });
}

/**
 * Handles the click event from any of our context menus.
 * @param info Information about the clicked menu item and the context.
 */
async function handleContextMenuClick(info: chrome.contextMenus.OnClickData) {
	if (!serverUrl || chats.length === 0) {
		console.error('Send2Tg: Cannot send, server or chats not configured.');
		return;
	}

	const chatId = Number(info.menuItemId);
	const chat = chats.find((c) => c.id === chatId);

	if (!chat) {
		console.error(`Send2Tg: Chat with ID ${chatId} not found`);
		return;
	}

	const formData = new FormData();
	formData.append('chat', serializeChat(chat));
	let contentFound = false;

	let sentText = '';
	let sentFileName: string | undefined;

	// Append data to the form based on what was right-clicked
	if (info.selectionText) {
		sentText = info.selectionText;
		formData.append('text', sentText);
		contentFound = true;
	} else if (info.linkUrl) {
		sentText = info.linkUrl;
		formData.append('text', sentText);
		contentFound = true;
	} else if (info.mediaType === 'image' && info.srcUrl) {
		try {
			// For images, we need to fetch the image data first
			const response = await fetch(info.srcUrl);
			const blob = await response.blob();
			const filename = info.srcUrl.substring(info.srcUrl.lastIndexOf('/') + 1) || 'image.png';
			sentFileName = filename;
			formData.append('file', blob, filename);

			// We can also send the page URL as a caption
			if (info.pageUrl) {
				sentText = `Image from: ${info.pageUrl}`;
				formData.append('text', sentText);
			}
			contentFound = true;
		} catch (e) {
			console.error('Send2Tg: Failed to fetch image.', e);
			// Notify the user about the failure
			chrome.notifications.create({
				type: 'basic',
				iconUrl: 'logo.png',
				title: 'Send to Telegram',
				message: 'Failed to fetch the image data.',
			});
			return;
		}
	}

	if (!contentFound) return;

	// Send the data to the server
	try {
		const sendResponse = await fetch(`${serverUrl}/api/send`, {
			method: 'POST',
			body: formData,
		});

		if (!sendResponse.ok) {
			throw new Error(`Server responded with status ${sendResponse.status}`);
		}

		// On success, save the message to history and notify the user
		await saveMessageToHistory(chat.id, sentText, sentFileName);

		chrome.notifications.create({
			type: 'basic',
			iconUrl: 'logo.png',
			title: 'Send to Telegram',
			message: `Sent to "${chat.name || chat.id}" successfully!`,
		});
	} catch (e) {
		console.error('Send2Tg: Failed to send message.', e);
		// Notify user of failure
		chrome.notifications.create({
			type: 'basic',
			iconUrl: 'logo.png',
			title: 'Send to Telegram',
			message: `Error sending to "${chat.name || chat.id}".`,
		});
	}
}

// --- Event Listeners ---

// Fired when the extension is first installed or updated.
chrome.runtime.onInstalled.addListener(() => {
	console.log('Send2Tg: Extension installed/updated. Initializing context menus.');
	updateContextMenus();
});

// Fired when a context menu item is clicked.
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

// Fired when data in chrome.storage.sync changes.
chrome.storage.onChanged.addListener((changes, namespace) => {
	// If our server or chat configuration has changed, rebuild the context menus.
	if (namespace === 'sync' && (changes.chats || changes.serverUrl)) {
		console.log('Send2Tg: Settings changed. Rebuilding context menus.');
		updateContextMenus();
	}
});
