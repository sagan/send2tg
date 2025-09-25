import React from 'react';
import { UserState, UserStateChat } from '../lib/schema';

export interface Message {
	id: string;
	text?: string;
	fileName?: string;
	timestamp: string;
}

// Context type for Outlet
export type AppContextType = {
	chats: UserStateChat[];
	messages: Record<string, Message[]>;
	setMessages: React.Dispatch<React.SetStateAction<Record<string, Message[]>>>;
	error: unknown;
	setError: React.Dispatch<React.SetStateAction<unknown>>;
	userState: UserState;
	setUserState: React.Dispatch<React.SetStateAction<UserState>>;
};
