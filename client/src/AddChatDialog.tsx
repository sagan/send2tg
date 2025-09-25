import React, { useCallback, useEffect, useState } from 'react';
import {
	Dialog,
	DialogContent,
	DialogTitle,
	Typography,
} from "@mui/material";
import Box from '@mui/material/Box';
import { Button, TextField, List, ListItem, ListItemButton, ListItemText, ListItemIcon, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import VerifiedIcon from '@mui/icons-material/Verified';
import AddIcon from '@mui/icons-material/Add';
import Avatar from '@mui/material/Avatar';
import { deepOrange } from '@mui/material/colors';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import "./window.d"
import { UserState, serializeChat } from '@send2tg/lib';
import buildVariables from '@send2tg/lib/build_variables.json';
import { Message } from './schema';
import { authChat, updateUserState } from './common';

const useDynamicStartToken = buildVariables.PUBLIC_LEVEL !== 2;
const privateMode = buildVariables.PUBLIC_LEVEL === 0;

export default function AddChatDialog({ close, setError, userState, setUserState, setMessages }: {
	userState: UserState,
	setUserState: React.Dispatch<React.SetStateAction<UserState>>;
	setMessages: React.Dispatch<React.SetStateAction<Record<string, Message[]>>>;
	close: () => void;
	setError: (err: unknown) => void;
}) {
	const [token, setToken] = useState("");
	const [authToken, setAuthToken] = useState("");
	const [tokenOk, setTokenOk] = useState(false);
	const [botName, setBotName] = useState(buildVariables.BOT_NAME);
	const [startToken, setStartToken] = useState(useDynamicStartToken ? "" : buildVariables.START_TOKEN);
	const loginLink = botName && (!useDynamicStartToken || startToken)
		? `https://t.me/${botName}${startToken ? "?start=" + startToken : ""}` : "";
	const [selectedChatId, setSelectedChatId] = useState(userState.chats[0]?.id || 0);
	const [userStartToken, setUserStartToken] = useState(useDynamicStartToken ? "" : buildVariables.START_TOKEN);
	const [userStartTokenUser, setUserStartTokenUser] = useState(0);

	const startTokenExist = !!startToken;
	const useUserStartToken = useDynamicStartToken && selectedChatId > 0;
	const userStartTokenInvalid = useDynamicStartToken &&
		(selectedChatId <= 0 || (selectedChatId !== userStartTokenUser || !userStartToken));

	useEffect(() => {
		if (!userState.chats.length) {
			setSelectedChatId(0);
		} else if (selectedChatId && !userState.chats.find(a => a.id === selectedChatId)) {
			setSelectedChatId(userState.chats[0].id);
		}
	}, [selectedChatId, userState.chats]);

	const fetchStartToken = useCallback((signal?: AbortSignal) => {
		const body = new FormData();
		body.set("user", `${selectedChatId}`);
		if (privateMode) {
			body.set("token", token);
		}
		fetch("/api/start", { method: "POST", signal, body }).then(res => {
			if (!res.ok) {
				if (privateMode && res.status === 401) {
					setTokenOk(false);
				}
				throw new Error(`status=${res.status}`);
			}
			return res.json();
		}).then((data: any) => {
			setStartToken(data.start_token);
			setBotName(data.bot_name);
			if (data.user_start_token && data.user === selectedChatId) {
				setUserStartToken(data.user_start_token);
				setUserStartTokenUser(data.user);
			}
			if (privateMode) {
				setTokenOk(true);
			}
		}).catch(err => {
			if (err?.name === 'AbortError') {
				return;
			}
			setError(err);
		});
	}, [selectedChatId, setError, token]);


	useEffect(() => {
		if ((botName && !useDynamicStartToken) || (privateMode && !tokenOk)) {
			return;
		}
		const ac = new AbortController();
		if (!botName || !startTokenExist || (useUserStartToken && userStartTokenInvalid)) {
			fetchStartToken(ac.signal);
		}
		const intervalId = setInterval(() => fetchStartToken(ac.signal), 1000 * 300);
		return () => {
			clearInterval(intervalId);
			ac.abort();
		};
	}, [botName, fetchStartToken, userStartTokenInvalid, startTokenExist, tokenOk, useUserStartToken]);

	const handleImport = useCallback(() => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';

		input.onchange = (event: Event) => {
			const target = event.target as HTMLInputElement;
			if (target.files && target.files.length > 0) {
				const file = target.files[0];
				const reader = new FileReader();
				reader.onload = (e: ProgressEvent<FileReader>) => {
					try {
						const result = e.target?.result as string;
						if (!result) {
							return;
						}
						const importedChats = JSON.parse(result) as UserState['chats'];
						updateUserState(setUserState, ...importedChats);
						setError("chats updated");
					} catch (error) {
						setError(error);
					}
				};

				reader.readAsText(file);
			}
		};

		input.click();
	}, [setUserState, setError]);

	const handleExport = () => {
		const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(userState.chats));
		const downloadAnchorNode = document.createElement('a');
		downloadAnchorNode.setAttribute("href", dataStr);
		downloadAnchorNode.setAttribute("download", `${buildVariables.SITENAME}-chats.json`);
		document.body.appendChild(downloadAnchorNode); // required for firefox
		downloadAnchorNode.click();
		downloadAnchorNode.remove();
	};

	const chatListContent = (<List sx={{ pt: 0 }}>
		{userState.chats.map((chat) => (
			<ListItem disableGutters key={chat.id}>
				<ListItemButton selected={chat.id === selectedChatId} onClick={() => {
					if (chat.id !== selectedChatId) {
						setSelectedChatId(chat.id);
						setUserStartToken("");
						setUserStartTokenUser(0);
					}
				}}>
					<ListItemIcon>
						<Avatar sx={{ bgcolor: deepOrange[500] }} >{chat.name.slice(0, 1)}</Avatar>
					</ListItemIcon>
					<ListItemText primary={chat.name} />
					<IconButton edge="end" title="Verify chat is valid" aria-label="verify" onClick={() => {
						const body = new FormData();
						body.set("chat", serializeChat(chat));
						body.set("dry_run", "1");
						fetch("/api/send", { method: "POST", body }).then(res => {
							if (!res.ok) {
								throw new Error(`status=${res.status}`);
							}
							setError(`✓ chat to "${chat.name}" is valid`);
						}).catch(e => {
							setError(`! chat to "${chat.name}" is invalid: ${e}`);
						})
					}}><VerifiedUserIcon /></IconButton>
					<IconButton edge="end" title="rename" aria-label="rename" onClick={() => {
						const newName = prompt("Enter new name for the chat:", chat.name);
						if (!newName || newName === chat.name) {
							return;
						}
						const updatedChat = { ...chat, name: newName };
						updateUserState(setUserState, updatedChat);
						setError(`chat renamed to "${newName}"`);
					}}><DriveFileRenameOutlineIcon /></IconButton>
					<IconButton edge="end" title="delete" aria-label="delete" onClick={() => {
						if (!confirm(`Delete chat to ${chat.name} (${chat.id})?`)) {
							return;
						}
						setUserState(prevState => {
							const newUserState: UserState = { ...prevState };
							newUserState.chats = newUserState.chats.filter(c => c.id !== chat.id);
							return newUserState;
						});
						setMessages(messages => {
							const newMessages = { ...messages };
							delete newMessages[chat.id];
							return newMessages;
						})
					}}>
						<DeleteIcon />
					</IconButton>
				</ListItemButton>
			</ListItem>
		))}
	</List>);

	const startMessage = `/start${startToken ? ` ${startToken}` : ""}`;
	const groupStartMessage = !userStartTokenInvalid
		? `@${botName} /start${userStartToken ? ` ${userStartToken}` : ""}` : "";

	return <Dialog open={true} onClose={tokenOk ? undefined : close} fullWidth maxWidth="xs">
		<DialogTitle sx={{ display: "flex", justifyContent: "space-between" }}>
			<Button disabled={!loginLink} href={loginLink} target="_blank" onClick={e => {
				e.preventDefault();
				window.open(loginLink);
			}}>Add Chat by Telegram</Button>
			<IconButton title="Close" color='secondary' onClick={close}><CloseIcon /></IconButton>
		</DialogTitle>
		<DialogContent>
			{privateMode && <form>
				<Box sx={{ mt: 1 }}>
					<TextField type='password' disabled={tokenOk} value={token} onChange={e => setToken(e.target.value)}
						label={`Token${tokenOk ? " (✓ Verified)" : ""}`} fullWidth placeholder='token to verify' InputProps={{
							endAdornment:
								<IconButton
									type='submit' color='primary'
									disabled={tokenOk || !token}
									onClick={(e) => {
										e.preventDefault();
										fetchStartToken();
									}}
									title={tokenOk ? "✓ Verified" : "Verify"}
									edge="end"
								>
									{tokenOk ? <VerifiedIcon /> : <VerifiedUserIcon />}
								</IconButton>
						}} />
				</Box>
			</form>}
			<form>
				{!!loginLink && <>
					<Typography sx={{ mt: 1 }}>
						Click the above "Add Chat" button,
						or manually copy and send the below start message to Telegram bot <a href={loginLink}>@{botName}</a>.
					</Typography>
					<Box sx={{ mt: 1 }}>
						<TextField disabled label="Start Message" fullWidth value={startMessage} InputProps={{
							endAdornment:
								<IconButton
									onClick={() => void navigator.clipboard.writeText(startMessage)}
									title={`Copy`}
									edge="end"
								>
									<ContentCopyIcon />
								</IconButton>
						}} />
					</Box>
					<Box sx={{ mt: 1 }}>
						<TextField disabled label={
							`Group Start Message${useUserStartToken ?
								` (for "${userState.chats.find(a => a.id === selectedChatId)?.name || ""}")` : ""}`}
							fullWidth value={groupStartMessage || " "} InputProps={{
								endAdornment:
									<IconButton
										onClick={() => void navigator.clipboard.writeText(groupStartMessage)}
										title={`Copy`}
										disabled={!groupStartMessage}
										edge="end"
									>
										<ContentCopyIcon />
									</IconButton>
							}} />
					</Box>
				</>}
				{(!privateMode || tokenOk) && <Box sx={{ mt: 1 }}>
					<TextField type='text' label="Auth token" fullWidth placeholder='auth token to add chat'
						value={authToken} onChange={e => setAuthToken(e.target.value)} InputProps={{
							endAdornment:
								<IconButton
									type='submit' color="primary" disabled={!authToken}
									onClick={(e) => {
										e.preventDefault();
										authChat(authToken).then(chat => {
											updateUserState(setUserState, chat);
											setError(`chat to "${chat.name}" updated`);
											setAuthToken("");
										}).catch(setError);
									}}
									title="Add chat"
									edge="end"
								>
									<AddIcon />
								</IconButton>
						}} />
				</Box>}
			</form>
			<Typography sx={{ mt: 1 }} variant="h6">Manage chats</Typography>
			<Box sx={{ mt: 1 }}>
				{chatListContent}
			</Box>
			<Box sx={{ display: 'flex', gap: 1 }}>
				<Button variant="contained" color="secondary" title="Load (import) saved chats" onClick={handleImport}>
					Load
				</Button>
				<Button variant="contained" color="secondary" title="Save (export) chats" disabled={!userState.chats.length} onClick={handleExport}>
					Save
				</Button>
				<Button variant="contained" color="secondary"
					title="Set Telegram webhook and other config (for admin; only required once)"
					disabled={privateMode && !tokenOk} onClick={() => {
						const _token = privateMode ? token : prompt("Enter token to set Telegram:");
						if (!_token) {
							return;
						}
						const body = new FormData();
						body.set("token", _token);
						fetch("/api/set_telegram", { method: "POST", body }).then(res => {
							if (!res.ok) {
								throw new Error(`status=${res.status}`);
							}
							return res.json();
						}).then(data => alert(`webhook set successfully: ${JSON.stringify(data)}`)).catch(e => alert(`${e}`));
					}}>Set</Button>
			</Box>
		</DialogContent>
	</Dialog >;
}
