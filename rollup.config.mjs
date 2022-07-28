import fs from 'fs';
import path from 'path';
import url from 'url';
import module from 'node:module';
import { babel } from '@rollup/plugin-babel';
import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import lessModules from 'rollup-plugin-less-modules';
import alias from '@rollup/plugin-alias';
import { terser } from 'rollup-plugin-terser';
import json from '@rollup/plugin-json';
import offMainThread from '@surma/rollup-plugin-off-main-thread';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const prod = process.env.NODE_ENV === 'production';

export default {
    input: 'src/index.tsx',
    preserveEntrySignatures: false,
    output: {
        banner: `globalThis.process={env:{NODE_ENV:${prod ? '"production"' : '"dev"'}},cwd(){return'/'}};`,
        format: 'esm',
        dir: './static/dist/',
        chunkFileNames: '[name]-[hash].js',
    },
    plugins: [
        lessModules({
            output: './static/dist/index.css',
            sourcemap: false,
        }),
        alias({
            entries: [
                { find: 'react', replacement: 'preact/compat' },
                { find: 'react-dom', replacement: 'preact/compat' },
                { find: 'css-tree', replacement: 'css-tree/dist/csstree.esm' },
            ],
        }),
        offMainThread({
            workerRegexp: null,
            silenceESMWorkerWarning: true, // it's fine
        }),
        hackToFixSvelteWebWorker(),
        typescript({}),
        json({ namedExports: false }),
        string(),
        nodeResolve(),
        commonjs(),
        prod && terser(),
    ].filter(x => x),
};

/** The `string:` loader can be used to load files as strings */
function string() {
    const scheme = 'string:';

    return {
        name: 'string',
        resolveId(id, importer) {
            if (id.startsWith(scheme)) {
                const resolved = path.resolve(importer, id.substr(scheme.length));
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
        }
    };
}

/** Fix svelte's incorrect use of `window`, which does not exist in web workers */
function hackToFixSvelteWebWorker() {
    return {
        transform(code, id) {
            if (id.includes('svelte/')) {
                return code
                    .replace(/\bwindow\b/g, 'globalThis');
            }
            return null;
        }
    };
}
