import {
	base64ToUint8Array,
	hmacSha256Sign,
	hmacSha256SignRaw,
	hmacSha256Verify,
	hmacSha256VerifyRaw,
	uint8ArrayToBase64String,
} from './common';
import { UserStateChatSchema, type UserStateChat } from './schema';
import jsonSortedStringify from 'json-sorted-stringify';
import { START_TOKEN_VALID_DURATION } from './constants';

const SIGN_FIELD = 'sign';

/**
 * These fields don't participate in signing.
 */
const NOSIGN_FIELDS = [SIGN_FIELD, 'name'] as const;

/**
 * Sign chat and return signed one.
 */
export async function signChat(token: string, chat: UserStateChat): Promise<UserStateChat> {
	const record: Record<string, unknown> = { ...chat };
	const payload = { ...record };
	for (const field of NOSIGN_FIELDS) {
		delete payload[field];
	}
	const sign = await hmacSha256Sign(token, payload);
	record[SIGN_FIELD] = sign;
	return record as UserStateChat;
}

/**
 * Serialize (signed) chat as a string that can be put in url safely.
 */
export function serializeChat(chat: UserStateChat): string {
	const str = jsonSortedStringify(chat);
	return urlSafeBase64Encode(str);
}

/**
 * Parse a serialized chat string and return parsed Chat.
 * Throw an error if parsing fails.
 */
export function parseChat(chatToken: string): UserStateChat {
	chatToken = urlSafeBase64Decode(chatToken);
	const chatData = JSON.parse(chatToken);
	const chat = UserStateChatSchema.parse(chatData);
	return chat;
}

/**
 * Parse and verify a serialized chat string and return parsed Chat.
 * Throw an error if parsing / verifying fails.
 */
export async function parseAndVerifyChat(token: string, chatToken: string): Promise<UserStateChat> {
	const chat = parseChat(chatToken);
	if (chat.expires && chat.expires <= Date.now()) {
		throw new Error('expired');
	}
	const record = { ...chat } as Record<string, unknown>;
	const sign = record[SIGN_FIELD] as string;
	if (!sign) {
		throw new Error('no sign');
	}
	for (const field of NOSIGN_FIELDS) {
		delete record[field];
	}
	const payload = jsonSortedStringify(record);
	const ok = await hmacSha256Verify(token, sign, payload);
	if (!ok) {
		throw new Error('invalid sign');
	}
	return chat;
}

// encode str to URL-safe Base64
function urlSafeBase64Encode(str: string | Uint8Array): string {
	if (str instanceof Uint8Array) {
		str = uint8ArrayToBase64String(str);
	} else {
		str = btoa(unescape(encodeURIComponent(str)));
	}
	return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// decode a URL-safe base64
function urlSafeBase64Decode(str: string): string {
	str = str.replace(/-/g, '+').replace(/_/g, '/');
	while (str.length % 4) {
		str += '=';
	}
	return decodeURIComponent(escape(atob(str)));
}

// decode a URL-safe base64
function urlSafeBase64DecodeRaw(str: string): Uint8Array {
	str = str.replace(/-/g, '+').replace(/_/g, '/');
	while (str.length % 4) {
		str += '=';
	}
	return base64ToUint8Array(str);
}

/**
 * Generate a start token with a timestamp and HMAC-SHA256 signature.
 * The start token is valid for 15 minutes.
 * The generated token is a base64 string with length 64, which decodes to a 48 bytes Uint8Array:
 * ts (int64, 8bytes) + userId(int64, 8bytes, default to 0) + hmacSha256(key, ts + userId)(32 bytes)
 */
export async function generateStartToken(key: string, ts: number, userId = 0): Promise<string> {
	const buf = new ArrayBuffer(16);
	const view = new DataView(buf);
	view.setBigInt64(0, BigInt(ts), true); // Use BigInt for 64-bit integer
	view.setBigInt64(8, BigInt(userId || 0), true); // Use BigInt for 64-bit integer
	const sign = await hmacSha256SignRaw(key, new Uint8Array(buf));
	const combined = new Uint8Array(buf.byteLength + sign.byteLength);
	combined.set(new Uint8Array(buf), 0);
	combined.set(sign, buf.byteLength);
	return urlSafeBase64Encode(combined);
}

/**
 * Verify the startToken is valid and not expired.
 * A start token is valid for 15 minutes.
 * If the token user id is not zero, it must match the userId.
 * If strictUserIdMatch is true, the token must contain a non-zero userId that matches the provided userId.
 * @param key Secret key
 * @param startToken Start token to verify
 * @param userId User ID to match. If 0, userId in token is ignored.
 * @param strictUserIdMatch If true, the token must contain a non-zero userId that matches the provided userId.
 * @returns true if valid, false otherwise
 */
export async function verifyStartToken(key: string, startToken: string, userId: number, strictUserIdMatch = false): Promise<boolean> {
	if (!startToken) {
		return false;
	}
	let combined: Uint8Array;
	try {
		combined = urlSafeBase64DecodeRaw(startToken);
	} catch (_e) {
		return false;
	}
	if (combined.byteLength !== 48) {
		return false;
	}
	const buf = combined.slice(0, 16);
	const sign = combined.slice(16);

	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	const ts = Number(view.getBigInt64(0, true));
	const tokenUserId = Number(view.getBigInt64(8, true));

	if ((strictUserIdMatch || tokenUserId !== 0) && tokenUserId !== userId) {
		return false;
	}

	const now = Date.now();
	if (ts + START_TOKEN_VALID_DURATION < now || ts >= now + 60 * 1000) {
		return false; // expired
	}

	const ok = await hmacSha256VerifyRaw(key, sign, new Uint8Array(buf));
	return ok;
}
