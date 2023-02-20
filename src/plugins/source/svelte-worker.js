import { compile } from 'svelte/compiler';
import { rollup } from 'rollup/dist/es/rollup.browser.js';
import { URL } from 'whatwg-url'; // chrome’s built-in URL seems to not be spec-compliant
import sSvelte from 'string-node-modules:svelte/index.mjs';
import sSvelteInternal from 'string-node-modules:svelte/internal/index.mjs';

const libraryModules = {
    'lib:///svelte/index.mjs': sSvelte,
    'lib:///svelte/internal/index.mjs': sSvelteInternal,
};

async function bundleModules(modules, main, mainId) {
    const index = { ...libraryModules };
    for (const [k, module] of modules) {
        index[`file:///${k}`] = module.contents;
    }

    const bundle = await rollup({
        input: `file:///${main}`,
        plugins: [
            {
                resolveId(id, importer) {
                    let url;

                    if (!id.startsWith('.')) {
                        // id doesn't start with ./ or ../ - library path
                        url = new URL(id, 'lib:///');
                    } else {
                        url = new URL(id, importer);
                    }

                    const candidates = [url.href, url.href + '/index.js', url.href + '/index.mjs'];

                    for (const candidate of candidates) {
                        if (candidate in index) {
                            return candidate;
                        }
                    }

                    throw new Error(`Could not resolve ${id} (in ${importer})`);
                },
                load(id) {
                    if (id in index) {
                        return index[id];
                    } else {
                        throw new Error(`cannot load module ${id}`);
                    }
                },
                transform(code, id) {
                    if (id.endsWith('.svelte')) {
                        const compiled = compile(code, {
                            dev: true,
                            filename: id.split('/').pop(),
                        });
                        return compiled.js;
                    }
                    return null;
                },
            },
        ],
    });

    const generated = await bundle.generate({
        format: 'iife',
        name: mainId,
        exports: 'named',
    });
    return generated.output[0].code;
}

addEventListener('message', (e) => {
    if (e.data.type === 'bundle') {
        bundleModules(e.data.modules, e.data.main, e.data.mainId)
            .then((result) => {
                postMessage({ id: e.data.id, success: true, result });
            })
            .catch((error) => {
                console.error(error);
                postMessage({ id: e.data.id, success: false, error: error.toString() });
            });
    }
});
