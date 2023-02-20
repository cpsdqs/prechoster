import fs from 'fs';
import path from 'path';
import url from 'url';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const prod = process.env.NODE_ENV === 'production';

const CONFIG = {
    staticUrlPrefix: process.env.PRECHOSTER_STATIC || 'https://cohost.org/static/',
};

console.error(`\x1b[32mUsing PRECHOSTER_STATIC=${CONFIG.staticUrlPrefix}\x1b[m`);
if (CONFIG.staticUrlPrefix.includes('//cohost.org')) {
    console.error('\x1b[31m+------------------------------------------------+\x1b[m');
    console.error('\x1b[31m| loading assets directly from cohost dot org!!! |\x1b[m');
    console.error('\x1b[31m|           links may be unreliable...           |\x1b[m');
    console.error('\x1b[31m+------------------------------------------------+\x1b[m');
}

export default defineConfig({
    plugins: [preact(), string(), stringNodeModules(), config(), hackToFixSvelteWebWorker()],
    build: {
        rollupOptions: {
            // i dont know why but some of these need to be repeated here for some reason
            plugins: [stringNodeModules(), hackToFixSvelteWebWorker()],
        },
        sourcemap: true,
    },
});

function readFileAsModule(id) {
    return new Promise((resolve, reject) => {
        fs.readFile(id, 'utf-8', (err, file) => {
            if (err) reject(err);
            else {
                resolve(`export default ${JSON.stringify(file)};`);
            }
        });
    });
}

/** The `string:` loader can be used to load files as strings */
function string() {
    const scheme = 'string:';

    return {
        name: 'string',
        resolveId(id, importer) {
            if (id.startsWith(scheme)) {
                const importerDir = path.dirname(importer) + '/';
                const resolved = path.resolve(importerDir, id.substring(scheme.length));
                return '\0' + scheme + resolved;
            }
            return null;
        },
        load(id) {
            if (id.startsWith('\0' + scheme)) {
                return readFileAsModule(id.substring(scheme.length + 1));
            }
            return null;
        },
    };
}

function stringNodeModules() {
    // don't let vite catch on that we're importing something from node modules
    const scheme = 'string-node-modules:';

    return {
        name: 'string-node-modules',
        resolveId(id, importer) {
            if (id.startsWith(scheme)) {
                return '\0' + id;
            }
            return null;
        },
        load(id) {
            if (id.startsWith('\0' + scheme)) {
                return readFileAsModule(
                    __dirname + '/node_modules/' + id.substring(scheme.length + 1)
                );
            }
            return null;
        },
    };
}

/** load build config from js */
function config() {
    const scheme = 'prechoster:';

    return {
        name: 'config',
        resolveId(id, importer) {
            if (id.startsWith(scheme)) {
                return '\0' + id;
            }
            return null;
        },
        load(id) {
            if (id.startsWith('\0' + scheme)) {
                const k = id.substring(scheme.length + 1);
                if (k === 'config') {
                    return Object.keys(CONFIG)
                        .map((k) => `export const ${k} = ${JSON.stringify(CONFIG[k])};`)
                        .join('\n');
                }
            }
            return null;
        },
    };
}

/** Fix svelte's incorrect use of `window`, which does not exist in web workers */
function hackToFixSvelteWebWorker() {
    return {
        transform(code, id) {
            if (id.includes('svelte/') || id.match(/node_modules.+svelte/)) {
                return { code: code.replace(/\bwindow\b/g, 'globalThis'), map: null };
            }
            return null;
        },
        enforce: 'post',
    };
}
