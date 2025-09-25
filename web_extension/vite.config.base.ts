import fs from 'fs/promises';
import path from 'path';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { ManifestV3Export } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, BuildOptions, type PluginOption } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { stripDevIcons, crxI18n } from './custom-vite-plugins';
import manifest from './manifest.json';
import devManifest from './manifest.dev.json';
import pkg from './package.json';

const isDev = process.env.__DEV__ === 'true';
// set this flag to true, if you want localization support
const localize = false;

await fs.copyFile(
	path.join(__dirname, '../node_modules/@send2tg/lib/dist/assets/favicon-32x32.png'),
	path.join(__dirname, 'public/favicon-32x32.png')
);
await fs.copyFile(
	path.join(__dirname, '../node_modules/@send2tg/lib/dist/assets/favicon-128x128.png'),
	path.join(__dirname, 'public/favicon-128x128.png')
);

export const baseManifest = {
	...manifest,
	version: pkg.version,
	...(isDev ? devManifest : ({} as ManifestV3Export)),
	...(localize
		? {
				name: '__MSG_extName__',
				description: '__MSG_extDescription__',
				default_locale: 'en',
		  }
		: {}),
} as ManifestV3Export;

export const baseBuildOptions: BuildOptions = {
	sourcemap: isDev,
	emptyOutDir: !isDev,
};

export default defineConfig({
	plugins: [
		tailwindcss() as PluginOption,
		tsconfigPaths() as PluginOption,
		react(),
		stripDevIcons(isDev),
		crxI18n({ localize, src: './src/locales' }),
	],
	publicDir: resolve(__dirname, 'public'),
});
