import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// base './' keeps the bundle relocatable: it works at flow.usecloak.org (root)
// and also under a project-pages subpath before the custom domain is attached.
export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: {
    target: 'es2022'
  }
});
