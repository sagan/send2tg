import fs from 'fs/promises';
import path from 'path';
import { jsonc } from 'jsonc';
import { defineConfig, loadEnv, ProxyOptions, UserConfig } from 'vite';
import { favicons } from 'favicons';
import react from '@vitejs/plugin-react';
import { version as VERSION } from './package.json';
import { parseStrictInt } from './lib/common';

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

// `npm run cfdev`
const backend: ProxyOptions = {
	target: 'http://127.0.0.1:8787',
	changeOrigin: false,
	secure: false,
};

// Generate wrangler.json config file (deployed as Workers)
async function generateWranglerConfig(_env: BuildVariables) {
	const templateFile = path.join(__dirname, 'wrangler.example.jsonc');
	const file = path.join(__dirname, 'wrangler.jsonc');

	const config = jsonc.parse(await fs.readFile(templateFile, { encoding: 'utf8' }));
	for (const key in config.vars) {
		if (!config.vars[key]) {
			// empty var in template are placeholders.
			// If we don't delete them, they will override dashboard configured variables.
			delete config.vars[key];
		}
	}
	const contents = jsonc.stringify(config, undefined, 2);
	console.log('generate wrangler.jsonc', contents);
	await fs.writeFile(file, contents);
}

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

	let wranglerConfigExists = false;
	try {
		await Promise.any([
			fs.access(path.join(__dirname, 'wrangler.json')),
			fs.access(path.join(__dirname, 'wrangler.jsonc')),
			fs.access(path.join(__dirname, 'wrangler.toml')),
		]);
		wranglerConfigExists = true;
	} catch (_e) {
		/* empty */
	}
	if (!wranglerConfigExists) {
		await generateWranglerConfig(buildVariables);
	}

	await fs.writeFile(path.join(__dirname, 'build_variables.json'), JSON.stringify(buildVariables));
	let assetExists = false;
	try {
		await fs.access(path.join(__dirname, 'public/assets/manifest.json'));
		assetExists = true;
	} catch (_e) {
		/* empty */
	}
	if (!assetExists || command === 'build') {
		await generateAssets(buildVariables);
	}

	const userConfig: UserConfig = {
		server: {
			host: '0.0.0.0',
			allowedHosts: true,
			proxy: {
				'/api/': backend,
			},
		},
		plugins: [react()],
		// Vite only expose "VITE_" prefix envs to import.meta.env (ES2020, replace process.env)
		// Use define to expose other envs.
		// See: https://vite.dev/config/shared-options.html#envprefix .
		// import.meta.env variables can be referenced in index.html via `%VITE_ENVNAME%` syntax.
		// Note the vite projet is for Cloudflare pages project (JavaScript SPA),
		// which is fullly static and runned in build time so any changes in env must be re-build to take effect.
		// For functions (functions/), env is dynamic and can be changed at any time.
		define: (Object.keys(buildVariables) as Array<keyof BuildVariables>).reduce<Record<string, string>>(
			(dv, key) => {
				dv[`import.meta.env.${key}`] = JSON.stringify(buildVariables[key]);
				return dv;
			},
			{
				[`import.meta.env.VERSION`]: `"v${VERSION}"`,
			}
		),
	};
	return userConfig;
});
