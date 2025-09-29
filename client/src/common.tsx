import React from "react";
import { parseChat, UserState, UserStateChat } from "@send2tg/lib";

/**
 * Upsert chats to current user state.
 * If the chat already exists (same id), update current one;
 * Otherwise append as new chat.
 */
export function updateUserState(setUserState: React.Dispatch<React.SetStateAction<UserState>>, ...chats: UserStateChat[]) {
	setUserState(userState => {
		const newUserState: UserState = { ...userState, chats: [...userState.chats] };
		for (const chat of chats) {
			const index = newUserState.chats.findIndex(c => c.id === chat.id);
			if (index >= 0) {
				// update existing chat
				newUserState.chats[index] = chat;
			} else {
				// append new chat
				newUserState.chats.push(chat);
			}
		}
		return newUserState;
	});
}

export async function authChat(authToken: string, duration = 0): Promise<UserStateChat> {
	const body = new FormData();
	body.set("auth_token", authToken);
	body.set("duration", `${duration}`);
	const authTokenChat = parseChat(authToken);
	const res = await fetch("/api/auth", { method: "POST", body });
	if (!res.ok) {
		throw new Error(`Failed to auth chat to "${authTokenChat.name}": status=${res.status}`);
	}
	const data = await res.json();
	const chatToken = data.chat_token as string;
	const chat = parseChat(chatToken);
	return chat;
}
