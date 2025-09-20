// for some unknown reason, putting it to tsconfig.json "files" doesn't work.
// So We have to include it manually in tsx files.
// I don't know why.

declare global {
	interface Window {
		__JS_URL__: string;
		__CSS_URL__: string;
		__VERSION__: string;
	}
}

export {};
