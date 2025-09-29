import jsonSortedStringify from 'json-sorted-stringify';

export const GITHUB_URL = 'https://github.com/sagan/send2tg';

export const MESSAGE_WELCOME = `This bot is powered by send2tg, an free and open source web app that allows you to send messages and files directly to your Telegram. Check ${GITHUB_URL} for more details`;

export const HASH_AUTH_PREFIX = 'auth/';

/**
 * Return sha-256 digest hex string of a blob / string / ArrayBuffer / TypedArray
 * @param blob
 * @returns
 */
export async function sha256sum(content: Blob | string | ArrayBuffer) {
	// This variable will hold a type compatible with crypto.subtle.digest.
	// BufferSource is a union that includes ArrayBuffer and Uint8Array.
	let input: BufferSource;
	if (typeof content == 'string') {
		// TextEncoder.encode() returns a Uint8Array.
		// We pass it directly, without accessing .buffer.
		input = new TextEncoder().encode(content);
	} else if (content instanceof Blob) {
		input = await content.arrayBuffer();
	} else {
		input = content;
	}
	const digest = await crypto.subtle.digest('SHA-256', input);
	const digestArray = Array.from(new Uint8Array(digest));
	const digestHex = digestArray.map((b) => b.toString(16).padStart(2, '0')).join('');
	return digestHex;
}

export function encodeHex(input?: Uint8Array | ArrayBuffer): string {
	if (!input) {
		return '';
	}
	let result = '';
	const array = 'buffer' in input ? new Uint8Array(input.buffer) : new Uint8Array(input);
	for (const value of array) {
		result += value.toString(16).padStart(2, '0');
	}
	return result;
}

async function getHMACKey(key: string): Promise<CryptoKey> {
	const cryptokey = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(key),
		{
			name: 'HMAC',
			hash: { name: 'SHA-256' },
		},
		false,
		['sign', 'verify']
	);
	return cryptokey;
}

/**
 * Generate HMAC-SHA256 signature of a payload using a secret key
 * @param key Secret key
 * @param payload Payload. string or object. the object is converted to ordered JSON string before being signed.
 * @returns Hex string of the HMAC-SHA256 signature
 */
export async function hmacSha256Sign(key: string, payload: Record<string, unknown> | string | Uint8Array): Promise<string> {
	return encodeHex(await hmacSha256SignRaw(key, payload));
}

export async function hmacSha256SignRaw(key: string, payload: Record<string, unknown> | string | Uint8Array) {
	const singkey = await getHMACKey(key);
	if (!(payload instanceof Uint8Array)) {
		let payloadStr: string;
		if (typeof payload == 'string') {
			payloadStr = payload;
		} else {
			payloadStr = jsonSortedStringify(payload);
		}
		payload = new TextEncoder().encode(payloadStr);
	}
	const signature = await crypto.subtle.sign('HMAC', singkey, payload.buffer as ArrayBuffer);
	return new Uint8Array(signature);
}

export function decodeHex(str: string): Uint8Array {
	const uint8array = new Uint8Array(Math.ceil(str.length / 2));
	for (let i = 0; i < str.length; ) {
		uint8array[i / 2] = Number.parseInt(str.slice(i, (i += 2)), 16);
	}
	return uint8array;
}

export async function hmacSha256Verify(key: string, signature: string, payload: string): Promise<boolean> {
	const singkey = await getHMACKey(key);
	const verified = await crypto.subtle.verify(
		'HMAC',
		singkey,
		decodeHex(signature).buffer as ArrayBuffer,
		new TextEncoder().encode(payload)
	);
	return verified;
}

export async function hmacSha256VerifyRaw(key: string, signature: Uint8Array, payload: string | Uint8Array): Promise<boolean> {
	const singkey = await getHMACKey(key);
	if (typeof payload == 'string') {
		payload = new TextEncoder().encode(payload);
	}
	const verified = await crypto.subtle.verify('HMAC', singkey, signature.buffer as ArrayBuffer, payload.buffer as ArrayBuffer);
	return verified;
}

/**
 * Generate a cryptographically strong password of format /[a-zA-Z0-9]{length}/
 * @param digitOnly bool. If true, output will be comprised of digit chars ([0-9]) only.
 */
export function generatePassword(length: number, digitOnly?: boolean) {
	if (length <= 0) {
		return '';
	}

	const PWD_CHARS = digitOnly ? '0123456789' : '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	const PWD_CHARS_LEN = PWD_CHARS.length;

	// To avoid modulo bias, we only use random numbers that are less than
	// the largest multiple of PWD_CHARS_LEN that fits in the range of a Uint16 value [0, 65535].
	// (0xFFFF + 1) is the total number of possible Uint16 values (65536).
	const MAX_VALID_THRESHOLD = Math.floor((0xffff + 1) / PWD_CHARS_LEN) * PWD_CHARS_LEN;

	let password = '';
	// Buffer for random values to reduce calls to crypto.getRandomValues.
	// A size of length * 2 is a heuristic, generally sufficient for typical password lengths.
	const randomValuesBuffer = new Uint16Array(length * 2);
	let bufferIndex = randomValuesBuffer.length; // Start as if the buffer is exhausted

	while (password.length < length) {
		if (bufferIndex >= randomValuesBuffer.length) {
			crypto.getRandomValues(randomValuesBuffer);
			bufferIndex = 0;
		}

		const randomValue = randomValuesBuffer[bufferIndex++];
		if (randomValue < MAX_VALID_THRESHOLD) {
			password += PWD_CHARS[randomValue % PWD_CHARS_LEN];
		}
	}
	return password;
}

/**
 * Performs a constant-time comparison of two strings or Uint8Arrays.
 * This is crucial for comparing secrets (like passwords or HMACs) to prevent timing attacks.
 * @param a The first string or Uint8Array.
 * @param b The second string or Uint8Array.
 * @returns True if the inputs are identical, false otherwise.
 */
export function constantTimeCompare(a: string | Uint8Array, b: string | Uint8Array): boolean {
	const aBytes = typeof a === 'string' ? new TextEncoder().encode(a) : a;
	const bBytes = typeof b === 'string' ? new TextEncoder().encode(b) : b;

	if (aBytes.byteLength !== bBytes.byteLength) {
		return false;
	}

	let result = 0;
	for (let i = 0; i < aBytes.byteLength; i++) {
		result |= aBytes[i] ^ bBytes[i]; // XOR bytes and accumulate result
	}

	// If result is 0, all bytes were identical.
	return result === 0;
}

/**
 * Parse a string as an integer, rejecting non-integer strings.
 * This is stricter than JavaScript's built-in parseInt/Number functions.
 * @param str Input string
 * @returns Parsed integer, or NaN if the string is not a valid integer representation.
 */
export function parseStrictInt(str: string): number {
	// 1. Convert the entire string to a number.
	//    If the string has any non-numeric characters (other than a leading +/-),
	//    the result will be NaN (Not a Number).
	const num = Number(str);

	// 2. Check if the result is an integer and if the original string was not empty.
	//    An empty string becomes 0, which we want to reject.
	if (Number.isInteger(num) && str.trim() !== '') {
		return num;
	}

	return NaN;
}

export function uint8ArrayToBase64String(uint8Array: Uint8Array): string {
	// Convert the Uint8Array to a binary string
	const binaryString = String.fromCharCode(...uint8Array);
	// Encode the binary string to Base64
	return btoa(binaryString);
}

export function base64ToUint8Array(base64String: string): Uint8Array {
	// Decode the Base64 string into a binary string
	const binaryString = atob(base64String);

	// Create a Uint8Array with the same length as the binary string
	const uint8Array = new Uint8Array(binaryString.length);

	// Populate the Uint8Array with the character codes of the binary string
	for (let i = 0; i < binaryString.length; i++) {
		uint8Array[i] = binaryString.charCodeAt(i);
	}

	return uint8Array;
}

export function trimSuffix(str: string, suffix: string): string {
	if (str.endsWith(suffix)) {
		str = str.slice(0, str.length - suffix.length);
	}
	return str;
}

export function trimPrefix(str: string, prefix: string): string {
	if (str.startsWith(prefix)) {
		str = str.slice(prefix.length);
	}
	return str;
}

/**
 * Get an integer value from FormData, with strict parsing and default value support.
 * @param fd FormData object
 * @param name Name of the form field
 * @param defaultValue Default value to return if the field is missing or invalid (default: NaN)
 * @returns Parsed integer, or defaultValue if the field is missing or invalid
 */
export function getFormDataInt(fd: FormData, name: string, defaultValue = NaN): number {
	const str = fd.get(name);
	if (!str || typeof str !== 'string') {
		return defaultValue;
	}
	const num = parseStrictInt(str);
	if (isNaN(num) && !isNaN(defaultValue)) {
		return defaultValue;
	}
	return num;
}

/**
 * Get a string value from FormData, with default value support.
 * @param fd FormData object
 * @param name Name of the form field
 * @param defaultValue Default value to return if the field is missing or is not string (default: empty string)
 * @returns String value, or defaultValue if the field is missing
 */
export function getFormDataString(fd: FormData, name: string, defaultValue = ''): string {
	const str = fd.get(name);
	if (!str || typeof str !== 'string') {
		return defaultValue;
	}
	return str || defaultValue;
}

/**
 * Get a File value from FormData, with default value support.
 * @param fd FormData object
 * @param name Name of the form field
 * @param defaultValue Default value to return if the field is missing or not a File (default: null)
 * @returns File object, or defaultValue if the field is missing or not a File
 */
export function getFormDataFile(fd: FormData, name: string, defaultValue: File | null = null): File | null {
	const file = fd.get(name);
	if (!file || !(file instanceof File)) {
		return defaultValue;
	}
	return file;
}
