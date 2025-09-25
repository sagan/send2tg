import fs from 'fs/promises';
import path from 'path';
import { jsonc } from 'jsonc';
import { defineConfig, UserConfig } from 'vite';
import buildVariables from '@send2tg/lib/build_variables.json';
type BuildVariables = typeof buildVariables;

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

export default defineConfig(async ({ command, mode }) => {
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

	const userConfig: UserConfig = {
		build: {
			lib: {
				entry: 'src/index.ts', // Your library's entry point
				name: 'send2tg',
				fileName: (format) => `index.${format}.js`,
			},
			rollupOptions: {
				// Externalize dependencies if building a library
			},
		},
	};
	return userConfig;
});
