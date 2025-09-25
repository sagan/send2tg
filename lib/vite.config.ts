import fs from 'fs/promises';
import path from 'path';
import dts from 'vite-plugin-dts';
import { defineConfig, loadEnv, UserConfig } from 'vite';
import { favicons } from 'favicons';
import react from '@vitejs/plugin-react';
import { parseStrictInt } from './src/common';

// override these with ".env" / ".env.local" dotenv file or environment variables.
const DefaultBuildVariables = {
	SITENAME: 'Send2Tg',
	SHORT_SITENAME: '',
	BOT_NAME: '',
	START_TOKEN: '',
	PUBLIC_LEVEL: 0, // default: private. "1": dynamic start token; "1": no start token required
	JS_URL: '',
	CSS_URL: '',
};

type BuildVariables = typeof DefaultBuildVariables;

/**
 * Generate favicon.ico, manifest.json and other files dynamically.
 */
async function generateAssets(variables: BuildVariables) {
	const manifest = JSON.parse(await fs.readFile(path.join(__dirname, 'assets/manifest.json'), { encoding: 'utf8' }));

	let source: string | Buffer;
	if (!process.env.FAVICON_URL) {
		source = path.join(__dirname, 'assets/favicon.png');
	} else if (process.env.FAVICON_URL.startsWith('http://') || process.env.FAVICON_URL.startsWith('https://')) {
		console.log('fetching favicon', process.env.FAVICON_URL);
		const res = await fetch(process.env.FAVICON_URL);
		source = Buffer.from(await res.arrayBuffer());
	} else {
		source = path.join(__dirname, process.env.FAVICON_URL);
	}

	const response = await favicons(source, {});
	// console.log(response.images) // Array of { name: string, contents: <buffer> }
	const faviconFiles: Record<string, string> = {
		'favicon.ico': 'favicon.ico',
		'favicon-32x32.png': 'assets/favicon.png',
		'android-chrome-192x192.png': 'assets/favicon-192x192.png',
	};
	for (const file of response.images) {
		if (!faviconFiles[file.name]) {
			continue;
		}
		await fs.writeFile(path.join(__dirname, 'public', faviconFiles[file.name]), file.contents);
	}
	manifest.name = variables.SITENAME;
	manifest.short_name = variables.SHORT_SITENAME || variables.SITENAME;
	await fs.writeFile(path.join(__dirname, 'public/assets/manifest.json'), JSON.stringify(manifest, null, 2));
}

export default defineConfig(async ({ command, mode }) => {
	const env: Record<string, string> = {};
	// The type of proccess.env is `{[key: string]: string | undefined}`,
	// So we cann't use `const env = {...process.env, ...loadEnv(mode, __dirname, "")}`, which realy sucks.
	for (const [key, value] of Object.entries(process.env)) {
		if (value) {
			env[key] = value;
		}
	}
	Object.assign(env, loadEnv(mode, __dirname, ''));

	const buildVariables = { ...DefaultBuildVariables };
	const buildVariablesMap: Record<string, string | number> = buildVariables; // We need it to make TypeScript happy
	for (const key of Object.keys(buildVariablesMap) as Array<keyof BuildVariables>) {
		if (env[key] !== undefined) {
			if (typeof buildVariables[key] == 'number') {
				const v = parseStrictInt(env[key]);
				if (isNaN(v)) {
					throw new Error(`invalid ${key} build variable value. must be integer`);
				}
				buildVariablesMap[key] = v;
			} else {
				buildVariablesMap[key] = env[key];
			}
		}
	}
	if (![0, 1, 2].includes(buildVariables.PUBLIC_LEVEL)) {
		throw new Error(`invalid PUBLIC_LEVEL build variable value ${buildVariables.PUBLIC_LEVEL}. Must be 0-2`);
	}

	await fs.writeFile(path.join(__dirname, 'build_variables.json'), JSON.stringify(buildVariables));
	await generateAssets(buildVariables);

	const userConfig: UserConfig = {
		plugins: [
			react(),
			dts({
				// Optional: Specify the output directory for declaration files
				outDir: 'dist/types',
				// Optional: Include specific files or directories
				include: ['src'],
				// Optional: Exclude files or directories
				exclude: ['src/**/*.spec.ts'],
			}),
		],
		build: {
			lib: {
				entry: 'src/index.ts', // Your library's entry point
				name: 'send2tg-lib',
				fileName: (format) => `index.${format}.js`,
			},
			rollupOptions: {
				// Externalize dependencies if building a library
			},
		},
	};
	return userConfig;
});
