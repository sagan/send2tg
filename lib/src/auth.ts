import {
	base64ToUint8Array,
	hmacSha256Sign,
	hmacSha256SignRaw,
	hmacSha256Verify,
	hmacSha256VerifyRaw,
	parseStrictInt,
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
 * The struct that's serialized to a 16-bit integer.
 */
export interface AuthOptions {
	/**
	 * The first (high) byte.
	 */
	flag?: number;
	/**
	 * The last (low) byte.
	 */
	expires?: number;
}

export interface AuthOptionsExpiresValue {
	/**
	 * A single byte value (1-255)
	 */
	value: number;
	/**
	 * label name
	 */
	label: string;
	/**
	 * max valid duration for authorized chat (miliseconds)
	 */
	duration: number;
}

export const AuthOptionsExpiresValues: AuthOptionsExpiresValue[] = [
	{ value: 1, label: '5 minutes', duration: 1000 * 60 * 5 },
	{ value: 2, label: '1 hour', duration: 1000 * 60 * 60 },
	{ value: 3, label: '1 day', duration: 1000 * 60 * 60 * 24 },
	{ value: 4, label: '7 days', duration: 1000 * 60 * 60 * 24 * 7 },
	{ value: 5, label: '31 days', duration: 1000 * 60 * 60 * 24 * 31 },
	{ value: 6, label: '3 months', duration: 1000 * 60 * 60 * 24 * 92 }, // 3 monthes = max 92 days
	{ value: 7, label: '6 months', duration: 1000 * 60 * 60 * 24 * 182 },
	{ value: 8, label: '1 year', duration: 1000 * 60 * 60 * 24 * 398 },
] as const;

export const AUTH_OPTIONS_FLAG_A = 1;

/**
 * Return the duration of a "expires" value.
 * Return 0 if authOptions or it's expires value doesn't exist.
 * Return -1 if it's expirs value is invalid.
 */
export function getAuthOptionsExpiresDuration(authOption?: AuthOptions): [duration: number, label: string] {
	if (!authOption?.expires || (authOption.flag & AUTH_OPTIONS_FLAG_A) == 0) {
		return [0, ''];
	}
	const aoev = AuthOptionsExpiresValues.find((v) => v.value === authOption.expires);
	if (!aoev) {
		return [-1, ''];
	}
	return [aoev.duration, aoev.label];
}

export function generateAuthOptions(expiresDuration?: number): AuthOptions | undefined {
	if (!expiresDuration || expiresDuration < 0) {
		return;
	}
	const ao: AuthOptions = { flag: AUTH_OPTIONS_FLAG_A };
	let closest = AuthOptionsExpiresValues[0];
	for (const v of AuthOptionsExpiresValues) {
		if (Math.abs(v.duration - expiresDuration) < Math.abs(closest.duration - expiresDuration)) {
			closest = v;
		}
	}
	ao.expires = closest.value;
	return ao;
}

/**
 * Serialize AuthOptions to a 16 bits integer.
 * first byte: flag (only use the lowest byte).
 * second byte: expire (only use the lowest byte).
 */
export function serializeAuthOptionsToNumber(ao?: AuthOptions): number {
	if (!ao) {
		return 0;
	}
	const flag = ao.flag ? ao.flag & 0xff : 0;
	const expire = ao.expires ? ao.expires & 0xff : 0;
	return (flag << 8) | expire;
}

export function parseAuthOptionsNumber(aon: number): AuthOptions {
	const ao: AuthOptions = {};
	if (!aon) {
		return ao;
	}
	const flag = (aon >> 8) & 0xff;
	const expire = aon & 0xff;
	if (flag) {
		ao.flag = flag;
	}
	if (expire) {
		ao.expires = expire;
	}
	return ao;
}

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
 * authOptions(2bytes) + ts (6bytes) + userId(int64, 8bytes, default to 0) + hmacSha256(key, ts + userId)(32 bytes)
 */
export async function generateStartToken(key: string, ts: number, userId = 0, authOptions?: AuthOptions): Promise<string> {
	const buf = new ArrayBuffer(16);
	const view = new DataView(buf);
	const authOptionsNumber = authOptions ? serializeAuthOptionsToNumber(authOptions) : 0;
	let tsNumber = BigInt(ts);
	// embed authOptionsNumber in the first two bytes of tsNumber
	tsNumber = (tsNumber & BigInt('0x0000ffffffffffff')) | (BigInt(authOptionsNumber) << BigInt(48));
	view.setBigInt64(0, tsNumber); // Use BigInt for 64-bit integer
	view.setBigInt64(8, BigInt(userId || 0)); // Use BigInt for 64-bit integer
	const sign = await hmacSha256SignRaw(key, new Uint8Array(buf));
	const combined = new Uint8Array(buf.byteLength + sign.byteLength);
	combined.set(new Uint8Array(buf), 0);
	combined.set(sign, buf.byteLength);
	return urlSafeBase64Encode(combined);
}

/**
 * Parse and verify the startToken is valid and not expired.
 * A start token is valid for 15 minutes.
 * If the token user id is not zero, it must match the userId.
 * If strictUserIdMatch is true, the token must contain a non-zero userId that matches the provided userId.
 * @param key Secret key
 * @param startToken Start token to verify
 * @param userId User ID to match. If 0, userId in token is ignored.
 * @param strictUserIdMatch If true, the token must contain a non-zero userId that matches the provided userId.
 * @returns true if valid, false otherwise
 */
export async function parseStartToken(
	key: string,
	startToken: string,
	userId: number,
	strictUserIdMatch = false
): Promise<[ok: boolean, authOptions?: AuthOptions]> {
	if (!startToken) {
		return [false];
	}
	let combined: Uint8Array;
	try {
		combined = urlSafeBase64DecodeRaw(startToken);
	} catch (_e) {
		return [false];
	}
	if (combined.byteLength !== 48) {
		return [false];
	}
	const buf = combined.slice(0, 16);
	const sign = combined.slice(16);

	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	const tsNumber = view.getBigInt64(0);
	const tokenUserId = Number(view.getBigInt64(8));

	if ((strictUserIdMatch || tokenUserId !== 0) && tokenUserId !== userId) {
		return [false];
	}

	const now = Date.now();
	// extract ts & authOptions from tsNumber
	const ts = Number(tsNumber & BigInt('0x0000ffffffffffff'));
	if (ts + START_TOKEN_VALID_DURATION < now || ts >= now + 60 * 1000) {
		return [false]; // expired
	}
	const ok = await hmacSha256VerifyRaw(key, sign, new Uint8Array(buf));
	const authOptionsNumber = Number((tsNumber >> BigInt(48)) & BigInt('0xffff'));
	const authOptions = parseAuthOptionsNumber(authOptionsNumber);
	return [ok, authOptions];
}

/**
 * Encode user chat option to a string,
 * which is intended to store in UserStateChat.option.
 */
export function encodeUserChatOption(ao?: AuthOptions): string | undefined {
	const aon = serializeAuthOptionsToNumber(ao);
	if (!aon) {
		return undefined;
	}
	return `ao=${aon}`;
}

/**
 * Decode user chat option from a string.
 */
export function decodeUserChatOption(option?: string): { authOptions?: AuthOptions } {
	const result: { authOptions?: AuthOptions } = {};
	if (!option) {
		return result;
	}
	const params = new URLSearchParams(option);
	const aon = params.get('ao');
	if (aon) {
		const aonNumber = parseStrictInt(aon);
		if (aonNumber) {
			result.authOptions = parseAuthOptionsNumber(aonNumber);
		}
	}
	return result;
}
