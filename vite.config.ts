import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// base relative : le dossier dist/ fonctionne servi depuis n'importe quel chemin.
export default defineConfig({ base: './', plugins: [svelte()], build: { assetsDir: 'build' } });
