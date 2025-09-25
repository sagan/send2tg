import { defineConfig, ProxyOptions, UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { version as VERSION } from './package.json';
import buildVariables from '@send2tg/lib/build_variables.json';

type BuildVariables = typeof buildVariables;

// `npm run cfdev`
const backend: ProxyOptions = {
	target: 'http://127.0.0.1:8787',
	changeOrigin: false,
	secure: false,
};

export default defineConfig(async ({ command, mode }) => {
	const userConfig: UserConfig = {
		server: {
			host: '0.0.0.0',
			allowedHosts: true,
			proxy: {
				'/api/': backend,
			},
		},
		plugins: [
			react(),
			viteStaticCopy({
				targets: [
					{
						src: '../node_modules/@send2tg/lib/dist/assets/*',
						dest: 'assets', // Destination relative to outDir
					},
					{
						src: '../node_modules/@send2tg/lib/dist/favicon.ico',
						dest: '.', // Destination relative to outDir
					},
				],
			}),
		],
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
