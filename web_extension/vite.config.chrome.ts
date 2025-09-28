import { resolve } from 'path';
import { mergeConfig, defineConfig, PluginOption } from 'vite';
import { crx, ManifestV3Export } from '@crxjs/vite-plugin';
import baseConfig, { baseManifest, baseBuildOptions } from './vite.config.base';

const outDir = resolve(__dirname, 'dist_chrome');

export default mergeConfig(
	baseConfig,
	defineConfig({
		plugins: [
			crx({
				manifest: {
					...baseManifest,
					background: {
						service_worker: 'src/pages/background/index.ts',
						type: 'module',
					},
				} as ManifestV3Export,
				browser: 'chrome',
			}) as PluginOption,
		],
		build: {
			...baseBuildOptions,
			outDir,
		},
	})
);
