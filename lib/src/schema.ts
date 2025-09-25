import { z } from 'zod';

export const UserStateChatSchema = z.object({
	id: z.number(),
	/**
	 * optional chat expiration timestamp (miniseconds)
	 */
	expires: z.number().int().optional(),
	/**
	 * the version of chat. It's reserved for implementing chat key revocation.
	 */
	version: z.number().int().optional().default(0),
	name: z.string().optional().default(''),
	sign: z.string().optional().default(''),
});

export const UserStateSchema = z.object({
	/**
	 * Random generated local device id
	 */
	id: z.string().optional().default(''),
	chats: z.array(UserStateChatSchema).optional().default([]),
});

export type UserStateChat = z.infer<typeof UserStateChatSchema>;
export type UserState = z.infer<typeof UserStateSchema>;
