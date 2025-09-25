import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import {
	BrowserRouter,
	Routes,
	Route,
	Outlet,
	useParams,
	Link as RouterLink,
	useLocation,
	useNavigate,
	useOutletContext,
} from 'react-router-dom';
import { useLocalStorage } from '@uidotdev/usehooks';
import {
	Box, CssBaseline, List, ListItem, ListItemButton, ListItemText,
	Paper, TextField, IconButton, CircularProgress, Alert,
	AppBar, Toolbar, Typography, Drawer, Button, useTheme, useMediaQuery,
	ListItemIcon,
	Divider,
	MenuItem,
	Menu,
	Snackbar
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import GitHubIcon from '@mui/icons-material/GitHub';
import AddIcon from '@mui/icons-material/Add';
import MenuIcon from '@mui/icons-material/Menu';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import Avatar from '@mui/material/Avatar';
import { deepOrange, deepPurple } from '@mui/material/colors';
import {
	GITHUB_URL, HASH_AUTH_PREFIX,
	parseStrictInt, UserState, UserStateChat, UserStateSchema, serializeChat
} from '@send2tg/lib';
import AddChatDialog from "./AddChatDialog";
import { type Message, type AppContextType } from './schema';
import buildVariables from '@send2tg/lib/build_variables.json';
import { authChat, updateUserState } from './common';


const SIDEBAR_WIDTH = 280;
const MINI_SIDEBAR_WIDTH = 72;

// --- Main App Component: Sets up the Router (Unchanged) ---
export default function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<Layout />}>
					<Route index element={<WelcomePage />} />
					<Route path="chat/:chatId" element={<ChatPage />} />
					<Route path="*" element={<NotFoundPage />} />
				</Route>
			</Routes>
		</BrowserRouter>
	);
}

function Layout() {
	const [isSidebarOpen, setSidebarOpen] = useState(true);
	const { chatId } = useParams<{ chatId: string }>();
	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
	const [error, setError] = useState<unknown>(null);
	const location = useLocation();
	const navigate = useNavigate();

	const [userState, setUserState] = useLocalStorage<UserState>("user_state", UserStateSchema.parse({}));
	const signed = userState.chats.length > 0;
	const chats = userState.chats;
	const [showAddChatDialog, setShowSetChatDialog] = useState(!signed);
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
	const [messages, setMessages] = useState<Record<string, Message[]>>({});
	const currentChat = getChat(chats, chatId);

	useEffect(() => {
		setSidebarOpen(!isMobile);
	}, [isMobile]);

	const handleSidebarToggle = () => {
		setSidebarOpen(!isSidebarOpen);
	};

	useEffect(() => {
		if (location.hash) {
			const initialHash = location.hash.slice(1); // hash with "#" removed
			if (initialHash.startsWith(HASH_AUTH_PREFIX)) {
				const authToken = initialHash.slice(HASH_AUTH_PREFIX.length);
				if (authToken) {
					navigate(location.pathname, { replace: true });
					authChat(authToken).then(chat => {
						updateUserState(setUserState, chat);
						setError(`chat to "${chat.name}" updated`);
					}).catch(setError);
				}
			}
		}
		// only run once when page loaded
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const chatListContent = (
		<Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflowX: 'hidden' }}>
			<Toolbar disableGutters sx={{ pl: 1 }} id="ddd">
				{!isMobile && (
					<IconButton onClick={handleSidebarToggle} sx={{ mr: 1 }} title="Toggle Sidebar">
						<MenuIcon />
					</IconButton>
				)}
				<Typography variant="h6" sx={{ opacity: isSidebarOpen ? 1 : 0, whiteSpace: 'nowrap', transition: 'opacity 0.2s' }}>
					Conversations
				</Typography>
			</Toolbar>
			<Divider />
			<List sx={{ overflowY: 'auto', overflowX: "hidden", flexGrow: 1 }}>
				{chats.map((chat, i) => {
					const isGroup = chat.id < 0;
					return <ListItem key={chat.id} disablePadding sx={{ display: 'block' }}>
						<ListItemButton
							title={chat.name + (isGroup ? " (group)" : "")}
							component={RouterLink}
							to={`/chat/${getChatId(chats, i)}`}
							selected={currentChat?.id === chat.id}
							onClick={isMobile ? () => setSidebarOpen(false) : undefined}
							sx={{ minHeight: 48, px: 1 }}
						>
							<ListItemIcon sx={{ minWidth: 0, mr: isSidebarOpen ? 1 : 'auto', justifyContent: 'center' }}>
								<Avatar sx={{ bgcolor: deepOrange[500] }} variant={isGroup ? "rounded" : "circular"} >
									{chat.name.slice(0, 1)}
								</Avatar>
							</ListItemIcon>
							<ListItemText primary={chat.name} sx={{ opacity: isSidebarOpen ? 1 : 0, whiteSpace: 'nowrap', transition: 'opacity 0.2s' }} />
						</ListItemButton>
					</ListItem>
				})}
				<ListItem disablePadding sx={{ display: 'block' }}>
					<ListItemButton
						title="New Chat"
						sx={{ minHeight: 48, px: 1 }}
						onClick={() => setShowSetChatDialog(true)}
					>
						<ListItemIcon sx={{ minWidth: 0, mr: isSidebarOpen ? 1 : 'auto', justifyContent: 'center' }}>
							<Avatar sx={{ bgcolor: deepOrange[500] }} ><AddIcon /></Avatar>
						</ListItemIcon>
						<ListItemText primary="New Chat" sx={{ opacity: isSidebarOpen ? 1 : 0, whiteSpace: 'nowrap', transition: 'opacity 0.2s' }} />
					</ListItemButton>
				</ListItem>
			</List>
			<Box>
				<List>
					<ListItem disablePadding sx={{ display: 'block' }}>
						<ListItemButton
							sx={{ minHeight: 48, px: 1 }}
							title='send2tg'
							href={GITHUB_URL}
						>
							<ListItemIcon sx={{ minWidth: 0, mr: isSidebarOpen ? 1 : 'auto', justifyContent: 'center' }}>
								<Avatar sx={{ bgcolor: deepPurple[500] }}><GitHubIcon /></Avatar>
							</ListItemIcon>
							<ListItemText primary={window.__VERSION__}
								sx={{ opacity: isSidebarOpen ? 1 : 0, whiteSpace: 'nowrap', transition: 'opacity 0.2s' }} />
						</ListItemButton>
					</ListItem>
				</List>
			</Box>
		</Box >
	);

	return (
		<Box sx={{ display: 'flex', height: '100dvh', bgcolor: 'background.default' }}>
			<CssBaseline />
			<Drawer
				variant={isMobile ? "temporary" : "permanent"}
				open={isSidebarOpen}
				onClose={handleSidebarToggle} // This is for closing the temporary drawer on mobile
				sx={{
					width: isSidebarOpen ? SIDEBAR_WIDTH : (isMobile ? 0 : MINI_SIDEBAR_WIDTH),
					transition: theme.transitions.create('width', {
						easing: theme.transitions.easing.sharp,
						duration: theme.transitions.duration.enteringScreen,
					}),
					flexShrink: 0,
					'& .MuiDrawer-paper': {
						width: isSidebarOpen ? SIDEBAR_WIDTH : (isMobile ? 0 : MINI_SIDEBAR_WIDTH),
						transition: theme.transitions.create('width', {
							easing: theme.transitions.easing.sharp,
							duration: theme.transitions.duration.enteringScreen,
						}),
						boxSizing: 'border-box',
						overflowX: 'hidden',
						borderRight: { sm: `1px solid ${theme.palette.divider}` }
					},
				}}
			>
				{chatListContent}
			</Drawer>
			<Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100dvh' }}>
				<AppBar position="static" color="transparent" elevation={0} sx={{ display: "flex", borderBottom: `1px solid ${theme.palette.divider}` }}>
					<Toolbar sx={{ justifyContent: "space-between" }}>
						{/* Hamburger button is in the AppBar only on mobile view */}
						{isMobile && (
							<IconButton
								title="Toggle Sidebar"
								color="inherit"
								aria-label="toggle drawer"
								edge="start"
								onClick={handleSidebarToggle}
								sx={{ mr: 2 }}
							>
								<MenuIcon />
							</IconButton>
						)}
						<Typography variant="h6" noWrap component="div">
							{currentChat?.name || buildVariables.SITENAME}
						</Typography>
						<IconButton
							title="More"
							color="inherit"
							sx={{ marginLeft: 0.5, visibility: currentChat ? "visible" : "hidden" }}
							onClick={(e) => setAnchorEl(e.currentTarget)}
						>
							<MoreHorizIcon />
						</IconButton>
						<Menu
							anchorEl={anchorEl}
							open={Boolean(anchorEl)}
							onClose={() => setAnchorEl(null)}
						>
							<MenuItem onClick={() => {
								setAnchorEl(null);
								setMessages(messages => {
									if (currentChat) {
										messages = { ...messages }
										delete messages[currentChat.id];
									}
									return messages;
								});
							}}>Clear history</MenuItem>
						</Menu>
					</Toolbar>
				</AppBar>
				<Box sx={{ flexGrow: 1, overflowY: 'auto', position: 'relative' }}>
					<Outlet context={{ chats, messages, setMessages, error, setError, userState, setUserState }} />
				</Box>
			</Box>
			{showAddChatDialog && <AddChatDialog userState={userState} setUserState={setUserState} setMessages={setMessages}
				close={() => setShowSetChatDialog(false)} setError={setError} />}
			<Snackbar
				anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
				autoHideDuration={5000}
				open={!!error}
				message={error ? `${error}` : null}
				onClose={() => setError(null)}
			/>
		</Box >
	);
}

// --- Welcome Page Component (Unchanged) ---
function WelcomePage() {
	return (
		<Box sx={{ p: 3, m: 'auto', color: 'text.secondary', textAlign: 'center' }}>
			<Typography variant="h5">Welcome!</Typography>
			<Typography>Select a conversation from the menu to start messaging.</Typography>
		</Box>
	);
}

// --- Not Found Page Component (Unchanged) ---
function NotFoundPage() {
	const navigate = useNavigate();
	return (
		<Box sx={{ p: 3, m: 'auto', color: 'text.secondary', textAlign: 'center' }}>
			<ErrorOutlineIcon sx={{ fontSize: 60, mb: 2 }} color="error" />
			<Typography variant="h5">Chat Not Found</Typography>
			<Typography sx={{ mb: 2 }}>The chat you are looking for does not exist.</Typography>
			<Button variant="contained" onClick={() => navigate('/')}>
				Go to Welcome Page
			</Button>
		</Box>
	);
}

// --- Chat Page Component (Unchanged) ---
function ChatPage() {
	const { chatId } = useParams<{ chatId: string }>();
	const { chats, messages, setMessages } = useOutletContext<AppContextType>();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const chat = getChat(chats, chatId);

	useEffect(() => {
		const storedMessages = localStorage.getItem('telegram-sent-messages');
		if (storedMessages) {
			setMessages(JSON.parse(storedMessages));
		}
	}, [setMessages]);

	useEffect(() => {
		localStorage.setItem('telegram-sent-messages', JSON.stringify(messages));
	}, [messages]);

	const handleSendMessage = async (text: string, file: File | null) => {
		if (!chat || (!text && !file)) {
			return;
		}
		setIsLoading(true);
		setError(null);
		const formData = new FormData();
		formData.append('chat', serializeChat(chat));
		if (text) {
			formData.append('text', text);
		}
		if (file) {
			formData.append('file', file);
		}

		try {
			const response = await fetch(`/api/send`, { method: 'POST', body: formData });
			if (!response.ok) throw new Error(`Failed to send message. Server responded with ${response.status}.`);
			const newMessage: Message = {
				id: crypto.randomUUID(),
				text: text || undefined,
				fileName: file?.name,
				timestamp: new Date().toISOString()
			};
			setMessages(prev => ({ ...prev, [chat.id]: [...(prev[chat.id] || []), newMessage] }));
		} catch (err) {
			setError(err instanceof Error ? err.message : 'An unknown network error occurred.');
		} finally {
			setIsLoading(false);
		}
	};

	const chatExists = chats.some(c => c.id === chat?.id);
	if (!chatExists) {
		return <NotFoundPage />;
	}

	const currentChatMessages = chat ? messages[chat.id] || [] : [];

	return (
		<Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
			<title>{chat?.id ? `${chat.name} - ${buildVariables.SITENAME}` : buildVariables.SITENAME}</title>
			<Box sx={{ flexGrow: 1, p: { xs: 1, sm: 2 }, overflowY: 'auto' }}>
				{currentChatMessages.map((msg) => (
					<Paper key={msg.id} sx={{ p: 1.5, mb: 1.5, maxWidth: '70%', ml: 'auto', bgcolor: '#dcf8c6' }}>
						{msg.text && <ChatMessageText text={msg.text} />}
						{msg.fileName && <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}><AttachFileIcon fontSize='small' sx={{ mr: 1 }} />{msg.fileName}</Box>}
						<small style={{ display: 'block', textAlign: 'right', color: '#888', marginTop: '4px' }}>
							{new Date(msg.timestamp).toISOString()}
						</small>
					</Paper>
				))}
			</Box>
			<Paper elevation={3} sx={{ p: 1, borderTop: '1px solid #ddd' }}>
				{error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
				<MessageInput onSendMessage={handleSendMessage} isLoading={isLoading} />
			</Paper>
		</Box>
	);
}

function ChatMessageText({ text }: { text: string }) {
	const urlRegex = /(https?:\/\/[^\s]+)/g;
	const parts = text.split(urlRegex).map((part, index) => {
		if (urlRegex.test(part)) {
			return (
				<a href={part} key={index} target="_blank" rel="noopener noreferrer">
					{part}
				</a>
			);
		} else {
			return part;
		}
	});

	return (
		<p style={{ margin: 0, whiteSpace: "pre-line" }}>{parts}</p>
	);
}

// --- Input Component (Unchanged) ---
interface MessageInputProps {
	onSendMessage: (text: string, file: File | null) => void;
	isLoading: boolean;
}


// --- Input Component (Unchanged) ---
function MessageInput({ onSendMessage, isLoading }: MessageInputProps) {
	const [text, setText] = useState('');
	const [file, setFile] = useState<File | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files[0]) {
			setFile(e.target.files[0]);
		}
	};

	const handleSubmit = () => {
		if (isLoading || (!text.trim() && !file)) return;
		onSendMessage(text, file);
		setText('');
		setFile(null);
		if (fileInputRef.current) fileInputRef.current.value = "";
	};

	return (
		<Box sx={{ display: 'flex', alignItems: 'center' }}>
			<input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
			<IconButton onClick={() => fileInputRef.current?.click()} disabled={isLoading}><AttachFileIcon color={file ? 'primary' : 'inherit'} /></IconButton>
			<TextField
				fullWidth autoFocus size="small" variant="outlined" multiline maxRows={5}
				placeholder={file ? `Caption for ${file.name}` : 'Type a message...'}
				value={text} onChange={(e) => setText(e.target.value)}
				onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSubmit())}
				disabled={isLoading}
			/>
			<IconButton color="primary" onClick={handleSubmit} disabled={isLoading}>
				{isLoading ? <CircularProgress size={24} /> : <SendIcon />}
			</IconButton>
		</Box>
	);
}

/**
 * Get chat from url :chatId param
 */
function getChat(chats: UserStateChat[], chatId: string | undefined | null): UserStateChat | undefined {
	if (!chatId) {
		return;
	}
	const i = parseStrictInt(chatId);
	if (isNaN(i)) {
		return;
	}
	return chats[i];
}

/**
 * Get url :chatId for index i chat of chats
 */
function getChatId(_chats: UserStateChat[], i: number): string {
	return `${i}`;
}
