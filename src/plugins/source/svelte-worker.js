import { compile } from 'svelte/compiler';
import { rollup } from 'rollup/dist/es/rollup.browser.js';
import sSvelte from 'string:../../../../node_modules/svelte/index.mjs';
import sSvelteInternal from 'string:../../../../node_modules/svelte/internal/index.mjs';

const predefinedModules = {
    'svelte': sSvelte,
    'svelte/internal': sSvelteInternal,
};

async function bundleModules(modules, main, mainId) {
    const index = { ...predefinedModules };
    for (const [k, module] of modules) {
        index[`./${k}`] = module.contents;
    }

    const bundle = await rollup({
        input: `./${main}`,
        plugins: [{
            resolveId(id) {
                if (id in index) {
                    return id;
                }
                return null;
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
        }],
    });

    const generated = await bundle.generate({
        format: 'iife',
        name: mainId,
        exports: 'named',
    });
    return generated.output[0].code;
}

addEventListener('message', e => {
    if (e.data.type === 'bundle') {
        bundleModules(e.data.modules, e.data.main, e.data.mainId).then(result => {
            postMessage({ id: e.data.id, success: true, result });
        }).catch(error => {
            console.error(error);
            postMessage({ id: e.data.id, success: false, error: error.toString() });
        });
    }
});
