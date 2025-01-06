import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import { resolve } from 'path';

export default defineConfig({
    plugins: [crx({ manifest })],
    build: {
        rollupOptions: {
            input: {
                background: resolve(__dirname, 'src/background.js'),
                popup: resolve(__dirname, 'index.html')
            },
            output: {
                entryFileNames: 'assets/[name].js'
            }
        }
    }
});
