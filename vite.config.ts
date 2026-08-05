import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	return {
		server: {
			port: Number(env.PORT ?? 3000),
			host: '0.0.0.0'
		},
		plugins: [sveltekit()]
	};
});
