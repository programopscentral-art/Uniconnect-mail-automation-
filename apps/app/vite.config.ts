import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		host: '0.0.0.0',
		port: 3001,
		strictPort: true
	},
	build: {
		rollupOptions: {
			// Node.js-only packages used in server-side shared services
			external: ['googleapis', 'google-auth-library', 'firebase-admin']
		}
	}
});