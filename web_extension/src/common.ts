// Define the structure for a sent message
export interface Message {
	id: string; // Use a unique ID like timestamp + random
	chatId: number;
	text: string;
	fileName?: string;
	timestamp: number;
}
