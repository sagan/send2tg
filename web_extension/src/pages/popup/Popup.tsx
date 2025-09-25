import React, { useState, useEffect, useCallback, useRef } from 'react';
import { serializeChat, UserStateChat } from '@send2tg/lib';
// Import the stylesheet that now contains our component classes
import '@pages/popup/Popup.css';
import { Message } from '@src/common';

export default function Popup() {
	// --- State Management ---
	const [serverUrl, setServerUrl] = useState<string>('');
	const [chats, setChats] = useState<UserStateChat[]>([]);
	const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
	const [recentMessages, setRecentMessages] = useState<Message[]>([]);

	// Form State
	const [text, setText] = useState<string>('');
	const [file, setFile] = useState<File | null>(null);

	// UI State
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isSending, setIsSending] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// --- Effects ---
	// Load data from storage on initial render
	useEffect(() => {
		Promise.all([
			chrome.storage.sync.get(['serverUrl', 'chats']),
			chrome.storage.local.get(['selectedChatId', 'recentMessages'])
		]).then(([syncData, localData]) => {
			setServerUrl(syncData.serverUrl || '');
			const loadedChats: UserStateChat[] = syncData.chats || [];
			setChats(loadedChats);

			if (localData.selectedChatId && loadedChats.some((c) => c.id === localData.selectedChatId)) {
				setSelectedChatId(localData.selectedChatId);
			} else if (loadedChats.length > 0) {
				// Default to the first chat if the saved one is invalid or not set
				setSelectedChatId(loadedChats[0].id);
			}

			setRecentMessages(localData.recentMessages || []);
			setIsLoading(false);
		});
	}, []);

	// Scroll to the bottom of messages when new ones are added
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [recentMessages]);


	// --- Callbacks ---
	const handleSelectChat = (chatId: number) => {
		setSelectedChatId(chatId);
		chrome.storage.local.set({ selectedChatId: chatId });
	};

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		if (event.target.files && event.target.files[0]) {
			setFile(event.target.files[0]);
		}
	};

	const openOptionsPage = () => {
		chrome.runtime.openOptionsPage();
	};

	const handleClearHistory = () => {
		if (selectedChatId) {
			const updatedMessages = recentMessages.filter(msg => msg.chatId !== selectedChatId);
			setRecentMessages(updatedMessages);
			chrome.storage.local.set({ recentMessages: updatedMessages });
		} else {
			setError('No chat selected. Please select a chat from the sidebar.');
		}
	};


	const handleSend = async () => {
		// Do not send if the message is just whitespace or no file is attached
		if (!text.trim() && !file) return;
		if (!selectedChatId) {
			setError('No chat selected. Please select a chat from the sidebar.');
			return;
		}

		const selectedChat = chats.find(c => c.id === selectedChatId);
		if (!selectedChat) {
			setError('Selected chat is missing');
			return;
		}
		setIsSending(true);
		setError(null);

		const formData = new FormData();
		formData.append('chat', serializeChat(selectedChat));
		if (text) {
			formData.append('text', text);
		}
		if (file) {
			formData.append('file', file);
		}

		try {
			const response = await fetch(`${serverUrl}/api/send`, {
				method: 'POST',
				body: formData,
			});

			if (!response.ok) {
				throw new Error(`Server returned an error: ${response.status}`);
			}

			// Success, add to recent messages
			const newMessage: Message = {
				id: `${Date.now()}-${Math.random()}`,
				chatId: selectedChatId,
				text,
				fileName: file?.name,
				timestamp: Date.now(),
			};
			const updatedMessages = [...recentMessages, newMessage].slice(-50); // Keep last 50
			setRecentMessages(updatedMessages);
			chrome.storage.local.set({ recentMessages: updatedMessages });

			// Clear form
			setText('');
			setFile(null);
			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}
		} catch (e: any) {
			setError(`Failed to send message: ${e.message}`);
		} finally {
			setIsSending(false);
		}
	};

	/**
	 * Handles form submission via button click.
	 */
	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		handleSend();
	};

	/**
	 * Handles key presses in the textarea.
	 * Submits on "Enter", adds a new line on "Shift + Enter".
	 */
	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault(); // Prevent new line on simple Enter
			handleSend();
		}
		// "Shift + Enter" will proceed with its default behavior (adding a new line)
	};


	// --- Render Logic ---
	if (isLoading) {
		return <div className="popup-container justify-center items-center">Loading...</div>;
	}

	return (
		<div className="popup-container">
			{/* --- Sidebar --- */}
			<aside className="sidebar">
				<h2 className="sidebar-title">Chats</h2>
				<ul className="chat-list">
					{chats.map(chat => (
						<li
							key={chat.id}
							className={`chat-item ${selectedChatId === chat.id ? 'active' : ''}`}
							onClick={() => handleSelectChat(chat.id)}
						>
							{chat.name || `Chat ${chat.id}`}
						</li>
					))}
					{chats.length === 0 && (
						<p className="no-chats-message">No chats configured.</p>
					)}
				</ul>
				<button className="options-button inline-flex" onClick={e => {
					chrome.windows.create({
						url: chrome.runtime.getURL("src/pages/popup/index.html"),
						type: "popup", // or "normal" for a full browser window
						width: 800,
						height: 600
					});
				}}>
					<PopupInNewIcon />
					<span className='truncate'>Open new window</span>
				</button>
				<button
					disabled={!selectedChatId}
					onClick={handleClearHistory}
					className="options-button disabled:opacity-50"
				>
					Clear Current Chat
				</button>
				<button
					onClick={openOptionsPage}
					className="options-button"
				>
					Manage Chats
				</button>
			</aside>

			{/* --- Main Content --- */}
			<main className="main-content">
				{chats.length === 0 ? (
					<div className="empty-state">
						<h3 className="text-lg font-semibold mb-2">Welcome to Send2Tg!</h3>
						<p className="text-gray-600 mb-4">You don't have any chats configured yet.</p>
						<button
							onClick={openOptionsPage}
							className="btn-primary"
						>
							Go to Options to Add a Chat
						</button>
					</div>
				) : (
					<>
						<div className="messages-area">
							{recentMessages.filter(m => m.chatId === selectedChatId).map(msg => (
								<div key={msg.id} className="message-bubble">
									{msg.text && <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{msg.text}</p>}
									{msg.fileName && (
										<div className="attachment-info">
											<PaperclipIcon />
											<span className="truncate">{msg.fileName}</span>
										</div>
									)}
									<time className="message-time">{new Date(msg.timestamp).toISOString()}</time>
								</div>
							))}
							<div ref={messagesEndRef} />
						</div>
						<div className="composer-area">
							{error && <p className="error-message">{error}</p>}
							{file && (
								<div className="file-preview">
									<span className="truncate">{file.name}</span>
									<button onClick={() => {
										setFile(null);
										if (fileInputRef.current) fileInputRef.current.value = '';
									}}>&times;</button>
								</div>
							)}
							<form onSubmit={handleSubmit}>
								<textarea
									value={text}
									autoFocus
									onChange={(e) => setText(e.target.value)}
									onKeyDown={handleKeyDown} // Added this handler
									placeholder={`Message to ${chats.find(c => c.id === selectedChatId)?.name || '...'
										}. Press enter to send, shift+enter for new line`}
									className="text-input"
									rows={3}
									disabled={isSending}
								/>
								<div className="composer-actions">
									<button
										type="button" // Change to "button" to prevent form submission
										onClick={() => fileInputRef.current?.click()}
										className="btn-secondary"
										disabled={isSending}
									>
										<PaperclipIcon /> Attach
									</button>
									<input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
									<button
										type='submit' // This now submits the form
										className="btn-primary"
										disabled={isSending || (!text.trim() && !file)}
									>
										{isSending ? 'Sending...' : 'Send'}
									</button>
								</div>
							</form>
						</div>
					</>
				)}
			</main>
		</div>
	);
}

// --- Helper Icon Component ---
const PaperclipIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
	</svg>
);

const PopupInNewIcon = () => (
	<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4 mr-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
		<polyline points="15 3 21 3 21 9"></polyline>
		<line x1="10" y1="14" x2="21" y2="3"></line>
	</svg>

)
