// src/index.ts
import { AutoRouter, cors, error, IRequest, json, status } from 'itty-router';
import { type Update } from '@grammyjs/types';
import {
	AUTH_TOKEN_VALID_DURATION,
	START_TOKEN_VALID_DURATION,
	HASH_AUTH_PREFIX,
	MESSAGE_WELCOME,
	constantTimeCompare,
	parseStrictInt,
	sha256sum,
	trimPrefix,
	signChat,
	serializeChat,
	parseAndVerifyChat,
	generateStartToken,
	verifyStartToken,
	type UserStateChat,
} from '@send2tg/lib';
import buildVariables from '@send2tg/lib/build_variables.json';

// See https://itty.dev/itty-router/cors
const { preflight, corsify } = cors();
const router = AutoRouter({
	before: [preflight],
	finally: [corsify],
});

/**
 * Verify auth_token, return {chat_token}.
 */
router.post('/api/auth', async (request, env: Env) => {
	if (!env.BOT_TOKEN) {
		return status(500);
	}
	const formData = await request.formData();
	const authToken = formData.get('auth_token') as string;
	if (!authToken) {
		return status(400);
	}
	try {
		const chat = await parseAndVerifyChat(getAuthTokenSignKey(env), authToken);
		if (chat.version !== (await getChatTokenVersion(env, chat.id))) {
			throw new Error('revoked');
		}
		delete chat.expires;
		const expires = formData.has('expires') ? parseStrictInt(formData.get('expires') as string) : undefined;
		if (expires) {
			chat.expires = expires;
		}
		const chat_token = serializeChat(await signChat(getChatTokenSignKey(env), chat));
		return json({ chat_token });
	} catch (_e) {
		// console.log('auth error', _e);
		return error(401);
	}
});

/**
 * Endpoint to handle sending messages.
 * It expects a `multipart/form-data` request.
 */
router.post('/api/send', async (request, env: Env) => {
	if (!env.BOT_TOKEN) {
		return status(500);
	}
	const formData = await request.formData();
	const text = formData.get('text');
	const file = formData.get('file');
	const chatToken = formData.get('chat') as string;
	const dryRun = formData.has('dry_run') && formData.get('dry_run') === '1';
	if (!chatToken || typeof chatToken !== 'string' || (!text && !file && !dryRun)) {
		return status(400);
	}
	let chat: UserStateChat;
	try {
		chat = await parseAndVerifyChat(getChatTokenSignKey(env), chatToken);
		if (chat.version !== (await getChatTokenVersion(env, chat.id))) {
			throw new Error('revoked');
		}
	} catch (_e) {
		return error(401);
	}

	if (dryRun) {
		return status(200);
	}

	try {
		await sendMessage(env.BOT_TOKEN, chat.id, text, file);
	} catch (e) {
		return error(500, `${e}`);
	}
	return status(200);
});

router.post('/api/start', async (request, env: Env) => {
	const bot_name = env.BOT_NAME || buildVariables.BOT_NAME;
	if (!env.BOT_TOKEN || !bot_name) {
		return status(500);
	}
	if (buildVariables.PUBLIC_LEVEL === 2) {
		return json({
			bot_name,
			start_token: buildVariables.START_TOKEN,
			public_level: buildVariables.PUBLIC_LEVEL,
		});
	}
	const formData = await request.formData();
	if (buildVariables.PUBLIC_LEVEL <= 0) {
		const token = formData.get('token') as string;
		if (!token || !constantTimeCompare(token, env.TOKEN || env.BOT_TOKEN)) {
			return json({ public_level: buildVariables.PUBLIC_LEVEL }, { status: 401 });
		}
	}
	const userStr = formData.get('user') as string;
	let user: number | undefined;
	if (userStr) {
		const userId = parseStrictInt(userStr);
		if (!isNaN(userId)) {
			user = userId;
		}
	}
	const now = Date.now();
	const start_token = await generateStartToken(getStartTokenSignKey(env), now);
	let user_start_token: string | undefined;
	if (user) {
		user_start_token = await generateStartToken(getStartTokenSignKey(env), now, user);
	}
	return json({
		start_token,
		user_start_token,
		user,
		bot_name,
		expires: now + START_TOKEN_VALID_DURATION,
		public_level: buildVariables.PUBLIC_LEVEL,
	});
});

router.post('/api/set_telegram', async (request, env: Env) => {
	if (!env.BOT_TOKEN) {
		return status(500);
	}
	const formData = await request.formData();
	const token = formData.get('token') as string;
	if (!token || !constantTimeCompare(env.TOKEN || env.BOT_TOKEN, token)) {
		return status(401);
	}

	const urlObj = new URL(realUrl(request));
	const url = urlObj.origin + '/api/webhook';

	const apiUrl = new URL(`https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`);
	apiUrl.searchParams.set('url', url);
	apiUrl.searchParams.set('secret_token', env.BOT_SECRET || (await sha256sum(env.BOT_TOKEN)));
	const res = await fetch(apiUrl, { method: 'POST' });
	if (!res.ok) {
		return error(500, `status=${res.status},url=${url} body=${await res.text()}`);
	}
	const body = await res.json();
	return json({
		url,
		body,
	});
});

// telegram webhook
router.post('/api/webhook', async (request, env: Env) => {
	if (!env.BOT_TOKEN) {
		return status(500);
	}
	const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
	if (!secret || !constantTimeCompare(env.BOT_SECRET || (await sha256sum(env.BOT_TOKEN)), secret)) {
		return status(401);
	}
	// We can process the webhook data here if needed
	const update = await request.json<Update>();
	if (!update.message?.text) {
		return status(200);
	}
	// t.me/<bot_username>?start=<start_token>
	const botName = env.BOT_NAME || buildVariables.BOT_NAME;
	const text = trimPrefix(update.message.text, `@${botName} `).trim();
	if (text === '/start' || text.startsWith('/start ')) {
		// start pameter: up to 64 base64url characters:
		const startToken = text.slice(6).trim();
		let startTokenOk: boolean;
		if (buildVariables.PUBLIC_LEVEL == 2) {
			startTokenOk = !buildVariables.START_TOKEN || constantTimeCompare(startToken, buildVariables.START_TOKEN);
		} else {
			const strictUserIdMatch = update.message.chat.id < 0; // negative chat id: group chat
			startTokenOk = await verifyStartToken(getStartTokenSignKey(env), startToken, update.message.from.id, strictUserIdMatch);
		}
		if (startTokenOk) {
			const chat: UserStateChat = {
				id: update.message.chat.id,
				name: update.message.chat.title || update.message.chat.first_name || update.message.from.first_name,
				sign: '',
				version: await getChatTokenVersion(env, update.message.chat.id),
				expires: Date.now() + AUTH_TOKEN_VALID_DURATION,
			};
			const chatToken = serializeChat(await signChat(getAuthTokenSignKey(env), chat));
			const urlObj = new URL(realUrl(request));
			const url = urlObj.origin;
			const addChatUrl = `${urlObj.origin}/#${HASH_AUTH_PREFIX}${chatToken}`;
			const txt = `Welcome to use ${buildVariables.SITENAME}:
${url}
${MESSAGE_WELCOME}

Add chat url for "${chat.name}" (${chat.id}): ${addChatUrl}${chat.expires ? `\n(Valid until ${new Date(chat.expires).toISOString()})` : ''}
Auth token (paste it in web app to manually add chat):`;

			// always relpy to the sender.
			// in the case of group chat, the "chat.id" is group id, which is different from "from.id"
			await sendMessage(env.BOT_TOKEN, update.message.from.id, txt);
			await sendMessage(env.BOT_TOKEN, update.message.from.id, chatToken);
		}
	}
	return status(200);
});

// Catch-all for other requests
router.all('*', () => error(404, 'Not Found.'));

/**
 * Helper function to determine the real URL, considering proxies
 */
function realUrl(request: IRequest): string {
	const isHttps = request.headers.get('X-Forwarded-Proto') === 'https';
	let url = request.url;
	if (isHttps && url.startsWith('http://')) {
		url = `https://${url.slice(7)}`;
	}
	return url;
}

async function sendMessage(token: string, chat_id: number, text: string | File | null, file?: string | File | null) {
	const apiUrl = `https://api.telegram.org/bot${token}`;

	let telegramApiUrl: string;
	const body = new FormData();
	body.append('chat_id', `${chat_id}`);
	const MAX_CAPTION_LENGTH = 1024;
	const MAX_TEXT_LENGTH = 4096;

	if (file && file instanceof File) {
		const isImage = file.type.startsWith('image/');
		telegramApiUrl = isImage ? `${apiUrl}/sendPhoto` : `${apiUrl}/sendDocument`;
		body.append(isImage ? 'photo' : 'document', file);
		if (text) {
			const caption = text as string;
			if (caption.length > MAX_CAPTION_LENGTH) {
				// Split the caption into multiple messages
				const captionChunks = caption.match(new RegExp(`(.|\r|\n){1,${MAX_CAPTION_LENGTH}}`, 'g'));
				if (captionChunks) {
					for (let i = 0; i < captionChunks.length; i++) {
						if (i === 0) {
							body.append('caption', captionChunks[i]);
						} else {
							await sendMessage(token, chat_id, captionChunks[i], null); // Send subsequent chunks as separate messages
						}
					}
				}
			} else {
				body.append('caption', caption);
			}
		}
	} else if (text) {
		const messageText = text as string;
		if (messageText.length > MAX_TEXT_LENGTH) {
			const textChunks = messageText.match(new RegExp(`(.|\r|\n){1,${MAX_TEXT_LENGTH}}`, 'g'));
			if (textChunks) {
				for (const chunk of textChunks) {
					await sendMessage(token, chat_id, chunk, null);
				}
				return; // Stop further execution as all text chunks have been sent
			}
		}
		telegramApiUrl = `${apiUrl}/sendMessage`;
		body.append('text', messageText);
	} else {
		throw new Error('Either text or a file is required.');
	}
	body.append('link_preview_options', JSON.stringify({ is_disabled: true }));

	const response = await fetch(telegramApiUrl, {
		method: 'POST',
		body: body,
	});

	if (!response.ok) {
		console.error('Telegram API Error:', await response.text());
		throw new Error('Failed to send message to Telegram.');
	}
}

function getStartTokenSignKey(env: Env): string {
	return `${env.TOKEN || env.BOT_TOKEN}
${buildVariables.PUBLIC_LEVEL}
start_token`;
}

function getAuthTokenSignKey(env: Env): string {
	return `${env.TOKEN || env.BOT_TOKEN}
auth_token`;
}

function getChatTokenSignKey(env: Env): string {
	return `${env.TOKEN || env.BOT_TOKEN}
chat_token`;
}

/**
 * Get the current version of the chat token for the given user.
 * This function can be used to implement chat token revocation.
 * For example, if you want to revoke all chat tokens for a user,
 * you can increment the version number stored in your Cloudflare KV for that user.
 * All chat tokens with a version number that's not equal with the current version
 * will be considered invalid.
 *
 * Currently, it always return 0, meaning that chat token revocation is not implemented.
 */
async function getChatTokenVersion(_env: Env, _userId: number): Promise<number> {
	return 0;
}

export default { ...router };
