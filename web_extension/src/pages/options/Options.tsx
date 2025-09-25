import React, { useState, useEffect, useCallback } from 'react';
import { GITHUB_URL, UserStateChat, parseChat, serializeChat } from '@send2tg/lib';
import '@pages/options/Options.css';
import { Message } from '@src/common';
import packageJson from '@src/../package.json';

const PREDEFINED_SERVERS = [
	{ name: 'Official Public Server', url: 'https://send2tg.sagan.me' },
	// Add other public servers here if needed
];

export default function Options() {
	// --- State Management ---
	const [serverUrl, setServerUrl] = useState<string>('');
	const [inputServerUrl, setInputServerUrl] = useState<string>('');
	const [chats, setChats] = useState<UserStateChat[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);

	// Add Chat Wizard State
	const [isAddingChat, setIsAddingChat] = useState<boolean>(false);
	const [addChatStep, setAddChatStep] = useState<'initial' | 'need_token' | 'show_start'>('initial');
	const [privateToken, setPrivateToken] = useState<string>('');
	const [startInfo, setStartInfo] = useState<{ bot_name: string; start_token: string } | null>(null);
	const [authToken, setAuthToken] = useState<string>('');

	// --- Effects ---
	useEffect(() => {
		// Load saved data from sync storage on initial render
		chrome.storage.sync.get(['serverUrl', 'chats'], (result) => {
			if (result.serverUrl) {
				setServerUrl(result.serverUrl);
				setInputServerUrl(result.serverUrl);
			} else if (PREDEFINED_SERVERS.length > 0) {
				// Default to the first predefined server if none is set
				setInputServerUrl(PREDEFINED_SERVERS[0].url);
			}
			if (result.chats) {
				setChats(result.chats);
			}
			setIsLoading(false);
		});
	}, []);

	// --- Data Persistence Callbacks ---
	const handleSaveServerUrl = useCallback(() => {
		const newUrl = inputServerUrl.trim().replace(/\/+$/, ''); // Trim and remove trailing slash
		if (!newUrl) {
			setError('Server URL cannot be empty.');
			return;
		}
		try {
			new URL(newUrl);
		} catch {
			setError('Invalid URL format.');
			return;
		}
		if (newUrl === serverUrl) {
			return;
		}
		fetch(`${newUrl}/api/start`).then(_res => {
			if (chats.length && !window.confirm(`Changing the server URL will to ${newUrl}? It will clear all your saved chats`)) {
				return;
			}
			setChats([]);
			setServerUrl(newUrl);
			setInputServerUrl(newUrl);
			setError(null);
			chrome.storage.sync.remove("chats");
			chrome.storage.sync.set({ serverUrl: newUrl });
			chrome.storage.local.remove(["selectedChatId", "recentMessages"]);
			alert('Server URL saved!');
		}).catch(e => alert(`server is invalid: ${e}`));
	}, [inputServerUrl, serverUrl]);

	const saveChats = useCallback((newChats: UserStateChat[]) => {
		setChats(newChats);
		chrome.storage.sync.set({ chats: newChats });
	}, []);


	// --- "Add Chat" Wizard Logic ---
	const resetAddChatWizard = () => {
		setIsAddingChat(false);
		setAddChatStep('initial');
		setPrivateToken('');
		setStartInfo(null);
		setAuthToken('');
		setError(null);
	};

	const handleStartAddChat = async () => {
		setIsLoading(true);
		setError(null);
		const formData = new FormData();
		if (addChatStep === 'need_token') {
			if (!privateToken) {
				setError('Token is required for private servers.');
				setIsLoading(false);
				return;
			}
			formData.append('token', privateToken);
		}

		try {
			const response = await fetch(`${serverUrl}/api/start`, {
				method: 'POST',
				body: formData,
			});

			if (response.status === 401) {
				setAddChatStep('need_token');
				setError('This server is private. Please provide an access token.');
			} else if (response.ok) {
				const data = await response.json();
				setStartInfo({ bot_name: data.bot_name, start_token: data.start_token });
				setAddChatStep('show_start');
			} else {
				throw new Error(`Server returned status ${response.status}`);
			}
		} catch (e: any) {
			setError(`Failed to contact server: ${e.message}`);
		} finally {
			setIsLoading(false);
		}
	};

	const handleAuthTokenSubmit = async () => {
		if (!authToken) {
			setError('Auth Token cannot be empty.');
			return;
		}
		setIsLoading(true);
		setError(null);

		const formData = new FormData();
		formData.append('auth_token', authToken);

		try {
			const response = await fetch(`${serverUrl}/api/auth`, {
				method: 'POST',
				body: formData,
			});

			if (response.ok) {
				const data = await response.json();
				const chatToken = data.chat_token;
				const newChat: UserStateChat = parseChat(chatToken);
				const newChats = chats.slice();
				const index = newChats.findIndex(c => c.id === newChat.id);
				if (index != -1) {
					newChats.splice(index, 1);
				}
				newChats.push(newChat);
				saveChats(newChats);
				resetAddChatWizard();
			} else {
				throw new Error('Invalid or expired Auth Token.');
			}
		} catch (e: any) {
			setError(`Authentication failed: ${e.message}`);
		} finally {
			setIsLoading(false);
		}
	};

	// --- Chat Management Logic ---
	const handleDeleteChat = (chatId: number) => {
		if (!window.confirm('Are you sure you want to delete this chat?')) {
			return;
		}
		saveChats(chats.filter(chat => chat.id !== chatId));
		// delete chat messages too
		chrome.storage.local.get(['recentMessages'], (result) => {
			const recentMessages: Message[] = result.recentMessages || [];
			const updatedMessages = recentMessages.filter((msg) => msg.chatId !== chatId);
			chrome.storage.local.set({ recentMessages: updatedMessages });
		});
	};

	const handleRenameChat = (chatId: number) => {
		const chat = chats.find(c => c.id === chatId);
		const newName = prompt('Enter new name for the chat:', chat?.name || '');
		if (newName !== null) {
			saveChats(chats.map(c => c.id === chatId ? { ...c, name: newName.trim() } : c));
		}
	};

	const handleVerifyChat = async (chat: UserStateChat) => {
		setIsLoading(true);
		const formData = new FormData();
		formData.append('chat', serializeChat(chat));
		formData.append('dry_run', '1');

		try {
			const response = await fetch(`${serverUrl}/api/send`, {
				method: 'POST',
				body: formData,
			});
			if (response.ok) {
				alert(`Chat "${chat.name || chat.id}" is valid!`);
			} else if (response.status === 401) {
				alert(`Chat "${chat.name || chat.id}" is invalid or has expired/been revoked.`);
			} else {
				throw new Error(`Server returned status ${response.status}`)
			}
		} catch (e: any) {
			alert(`Verification failed: ${e.message}`);
		} finally {
			setIsLoading(false);
		}
	};

	// --- Render Logic ---
	if (isLoading && !serverUrl) {
		return <div className="container p-8">Loading...</div>;
	}

	return (
		<div className="container p-6 bg-gray-50 min-h-screen font-sans">
			<h1 className="text-3xl font-bold text-gray-800 mb-6">
				Send to Telegram v{packageJson.version} (<a href={GITHUB_URL} className='text-blue-500'>GitHub</a>) Options
			</h1>

			{error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md relative mb-6" role="alert">{error}</div>}

			{/* --- Server Configuration --- */}
			<div className="card">
				<h2 className="card-title">Server Configuration</h2>
				<p className="text-sm text-gray-600 mb-4">Select a public server or enter the URL of your self-hosted instance.</p>

				<div className="mb-2">
					<label htmlFor="server-select" className="block text-sm font-medium text-gray-700 mb-1">Choose a server:</label>
					<select
						id="server-select"
						className="input-field w-full"
						value={PREDEFINED_SERVERS.find(s => s.url === inputServerUrl)?.url || ''}
						onChange={(e) => setInputServerUrl(e.target.value || '')}
					>
						<option value="">-- Custom URL --</option>
						{PREDEFINED_SERVERS.map(server => (
							<option key={server.url} value={server.url}>
								{server.name} ({server.url})
							</option>
						))}
					</select>
				</div>

				<div className="flex items-center space-x-2">
					<input
						type="url"
						value={inputServerUrl}
						onChange={(e) => setInputServerUrl(e.target.value)}
						placeholder="https://my-send2tg.workers.dev"
						className="input-field flex-grow"
					/>
					<button disabled={!inputServerUrl || serverUrl === inputServerUrl}
						onClick={handleSaveServerUrl} className="btn btn-primary disabled:opacity-50">Save</button>
				</div>
				<p className="text-sm text-gray-600 mt-1">
					Current server: <a className='text-blue-500' href={serverUrl}>{serverUrl}</a>
				</p>
				<p className="text-sm text-gray-600 mt-1">
					Send To Telegram (<a className='text-blue-500' href={GITHUB_URL}>send2tg</a>) is a free and open source software.
					The server runs on Cloudflare Workers and is completely stateless.
					It does not log, collect or store any data of any kind.
					There is not any analytic or telemetry hooks in its client or server code.
					Check <a className='text-blue-500' href={GITHUB_URL}>GitHub</a> for how to deploy your own server.
				</p>
			</div>

			{/* --- Chat Management --- */}
			{serverUrl && (
				<div className="card mt-6">
					<div className="flex justify-between items-center mb-4">
						<h2 className="card-title">Managed Chats</h2>
						<span className='space-x-1'>
							<button className="btn btn-secondary" onClick={() => {
								// import from json. Override existing chats if chat id is the same
								const input = document.createElement('input');
								input.type = 'file';
								input.accept = 'application/json';
								input.onchange = e => {
									const file = (e.target as HTMLInputElement).files?.[0];
									if (!file) {
										return;
									}
									const reader = new FileReader();
									reader.onload = evt => {
										try {
											const data = JSON.parse(evt.target?.result as string);
											let importedChats: UserStateChat[];
											if (Array.isArray(data)) {
												importedChats = data;
											} else {
												if (data.serverUrl !== serverUrl) {
													throw new Error(`The imported chats are for another server ${data.serverUrl}`);
												}
												importedChats = data.chats;
											}
											if (!Array.isArray(importedChats) || !importedChats.every(c => c.id && c.sign)) {
												throw new Error('Invalid chat data format.');
											}
											const mergedChats = [...chats];
											importedChats.forEach(ic => {
												const index = mergedChats.findIndex(c => c.id === ic.id);
												if (index >= 0) {
													mergedChats[index] = ic; // override existing
												} else {
													mergedChats.push(ic); // add new
												}
											});
											saveChats(mergedChats);
											alert(`Imported ${importedChats.length} chats successfully.`);
										} catch (err) {
											alert(`Failed to import chats: ${(err as Error).message}`);
										}
									};
									reader.readAsText(file);
								};
								input.click();

							}}>Import</button>
							<button disabled={!chats.length} className="btn btn-secondary disabled:opacity-50" onClick={() => {
								// exports chats to json file
								const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ serverUrl, chats }));
								const dlAnchorElem = document.createElement('a');
								dlAnchorElem.setAttribute("href", dataStr);
								dlAnchorElem.setAttribute("download", "send2tg-chats.json");
								dlAnchorElem.click();
							}}>Export</button>
							<button onClick={() => { setIsAddingChat(true); handleStartAddChat(); }} className="btn btn-primary">
								+ Add New Chat
							</button>
						</span>
					</div>

					{chats.length > 0 ? (
						<ul className="space-y-3">
							{chats.map(chat => (
								<li key={chat.id} className="flex items-center justify-between bg-gray-100 p-3 rounded-md">
									<div>
										<p className="font-semibold text-gray-800">{chat.name || 'Unnamed Chat'}</p>
										<p className="text-xs text-gray-500 font-mono">ID: {chat.id}</p>
									</div>
									<div className="flex items-center space-x-1">
										<button onClick={() => handleVerifyChat(chat)} className="btn btn-secondary">Verify</button>
										<button onClick={() => handleRenameChat(chat.id)} className="btn btn-secondary">Rename</button>
										<button onClick={() => handleDeleteChat(chat.id)} className="btn btn-danger">Delete</button>
									</div>
								</li>
							))}
						</ul>
					) : (
						<p className="text-gray-500 text-center py-4">No chats added yet. Click "Add New Chat" to get started.</p>
					)}
				</div>
			)}

			{/* --- Add Chat Wizard Modal --- */}
			{isAddingChat && (
				<div className="modal-backdrop">
					<div className="modal-content">
						<h3 className="text-xl font-bold mb-4">Add a New Telegram Chat</h3>
						{isLoading && <div className="text-center p-4">Loading...</div>}

						{!isLoading && addChatStep === 'need_token' && (
							<div>
								<p className="mb-2">This server is private. Please enter the correct access token to proceed.</p>
								<input
									type="password"
									value={privateToken}
									onChange={(e) => setPrivateToken(e.target.value)}
									className="input-field w-full mb-4"
									placeholder="Enter server token"
								/>
								<div className="flex justify-end space-x-2">
									<button onClick={resetAddChatWizard} className="btn btn-secondary">Cancel</button>
									<button onClick={handleStartAddChat} className="btn btn-primary">Continue</button>
								</div>
							</div>
						)}

						{!isLoading && addChatStep === 'show_start' && startInfo && (
							<div>
								<p className="mb-2"><strong>Step 1:</strong> Send the start command to your bot.</p>
								<p className="mb-3">
									<a href={`https://t.me/${startInfo.bot_name}${startInfo.start_token ? `?start=${startInfo.start_token}` : ""}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-full text-center mb-4">
										Open Telegram Bot: @{startInfo.bot_name}
									</a>
								</p>
								<p className="text-xs text-gray-500 mb-3 text-left">
									Or, manually send: <code className="bg-gray-200 p-1 rounded break-all">/start{startInfo.start_token ? ` ${startInfo.start_token}` : ""}</code>
								</p>
								<p className="mb-1">
									<button className="btn btn-secondary" onClick={e => void navigator.clipboard.writeText(`/start${startInfo.start_token ? ` ${startInfo.start_token}` : ""}`)}>Copy</button>
								</p>
								<hr className="my-4" />
								<p className="mb-2"><strong>Step 2:</strong> Your bot will reply with an "Auth Token". Paste it here.</p>
								<textarea value={authToken} onChange={(e) => setAuthToken(e.target.value)} className="input-field w-full h-24 font-mono" placeholder="Paste the Auth Token from Telegram here..."></textarea>
								<div className="flex justify-end space-x-2 mt-4">
									<button onClick={resetAddChatWizard} className="btn btn-secondary">Cancel</button>
									<button onClick={handleAuthTokenSubmit} className="btn btn-primary">Add Chat</button>
								</div>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
