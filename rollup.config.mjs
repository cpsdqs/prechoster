import fs from 'fs';
import path from 'path';
import url from 'url';
import module from 'node:module';
import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import postcss from 'rollup-plugin-postcss';
import autoprefixer from 'autoprefixer';
import postcssNesting from 'postcss-nesting';
import alias from '@rollup/plugin-alias';
import { terser } from 'rollup-plugin-terser';
import json from '@rollup/plugin-json';
import offMainThread from '@surma/rollup-plugin-off-main-thread';

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

export default {
    input: 'src/index.tsx',
    preserveEntrySignatures: false,
    output: {
        banner: `globalThis.process={env:{NODE_ENV:${
            prod ? '"production"' : '"dev"'
        }},cwd(){return'/'}};`,
        format: 'esm',
        dir: './static/dist/',
        chunkFileNames: prod ? '[name]-[hash].js' : '[name].js',
    },
    plugins: [
        postcss({
            extract: path.resolve('./static/dist/index.css'),
            plugins: [autoprefixer(), postcssNesting()],
            sourceMap: false,
        }),
        alias({
            entries: [{ find: 'css-tree', replacement: 'css-tree/dist/csstree.esm' }],
        }),
        offMainThread({
            workerRegexp: null,
            silenceESMWorkerWarning: true, // it's fine
        }),
        string(),
        config(),
        hackToFixSvelteWebWorker(),
        typescript(),
        json(),
        nodeResolve(),
        commonjs(),
        prod && terser(),
    ].filter((x) => x),
};

/** The `string:` loader can be used to load files as strings */
function string() {
    const scheme = 'string:';

    return {
        name: 'string',
        resolveId(id, importer) {
            if (id.startsWith(scheme)) {
                const importerDir = path.dirname(importer) + '/';
                const resolved = path.resolve(importerDir, id.substr(scheme.length));
                return scheme + resolved;
            }
            return null;
        },
        load(id) {
            if (id.startsWith(scheme)) {
                return new Promise((resolve, reject) => {
                    fs.readFile(id.substr(scheme.length), 'utf-8', (err, file) => {
                        if (err) reject(err);
                        else resolve(`export default ${JSON.stringify(file)};`);
                    });
                });
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
                return id;
            }
            return null;
        },
        load(id) {
            if (id.startsWith(scheme)) {
                const k = id.substr(scheme.length);
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
            if (id.includes('svelte/')) {
                return code.replace(/\bwindow\b/g, 'globalThis');
            }
            return null;
        },
    };
}
