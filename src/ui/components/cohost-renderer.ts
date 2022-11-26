import { h } from 'preact';
import { createRef, PureComponent } from 'preact/compat';
import * as React from 'preact/compat';

const CONFIG = {
    chunks: [
        'https://cohost.org/static/1624.709a1e9b0bbc0fd2889c.js',
        'https://cohost.org/static/2813.c19edb49f6481aa9e51e.js',
    ],
    modules: {
        react: 94159,
        markdown: 21624,
    },
    symbols: {
        render: 'e2',
    },
};
const extraModules = {
    45984: function (e: any) {
        e.exports = {
            ZP: {
                public: {
                    project: { mainAppProfile: (id: string) => `https://cohost.org/${id}` },
                    static: { staticAsset: ({ path }: any) => `https://cohost.org${path}` },
                },
            },
        };
    },
    20314: function (e: any) {
        e.exports = {
            // this function is called to filter for markdown blocks in the chost data.
            // we don't have attachments, so we can ignore this
            D_() {
                return true;
            },
        };
    },
    84008: function (e: any) {
        e.exports = {
            ZP: {
                t: (id: any, { defaultValue }: any) => defaultValue,
            },
        };
    },
    67368: function (e: any) {
        e.exports = {
            a: () => {
                // iframely embed
                return {
                    data: {
                        error: 'prechoster doesn’t support embeds, sorry!',
                    },
                    status: null,
                };
            },
        };
    },
    6087: function (e: any, t: any, n: any) {
        const React = n(CONFIG.modules.react);
        const ctx = React.createContext({
            HCAPTCHA_SITE_KEY: '',
            IFRAMELY_KEY: '',
            UNLEASH_APP_NAME: '',
            UNLEASH_CLIENT_KEY: '',
            limits: { attachmentSize: { normal: 5242880, cohostPlus: 10485760 } },
        });
        e.exports = {
            F: ctx,
        };
    },
    67905: function (e: any) {
        e.exports = {
            // static assets
            S: (s: string) => 'https://cohost.org/' + s,
        };
    },
    84879: function (e: any) {
        e.exports = {
            ou: {
                fromISO: (s: string) => ({ toJSDate: () => new Date(s) }),
            },
        };
    },
    [CONFIG.modules.react]: function (e: any) {
        e.exports = React;
    },
};
(globalThis as any).__LOADABLE_LOADED_CHUNKS__ = [[[], extraModules]];

const chunkRuntime = function () {
    const loadedModules: any = {};
    const moduleRegistry: any = {};

    const rt = function (id: number) {
        if (loadedModules[id]) return loadedModules[id].exports;

        const module = {
            id,
            exports: {},
        };
        loadedModules[id] = module;

        if (!moduleRegistry[id]) throw new Error(`missing module ${id}`);
        moduleRegistry[id].call(module.exports, module, module.exports, rt);
        return module.exports;
    };
    rt.g = globalThis;
    rt.m = moduleRegistry;

    rt.o = function (obj: any, prop: any) {
        return Object.prototype.hasOwnProperty.call(obj, prop);
    };

    rt.p = '/static/';

    rt.d = function (target: any, source: any) {
        for (const prop in source) {
            if (rt.o(source, prop) && !rt.o(target, prop)) {
                Object.defineProperty(target, prop, {
                    enumerable: true,
                    get: source[prop],
                });
            }
        }
    };

    rt.n = function (exports: any) {
        var getDefault;
        if (exports && exports.__esModule) {
            getDefault = () => exports.default;
        } else {
            getDefault = () => exports;
        }
        (getDefault as any).a = getDefault;
        return getDefault;
    };

    rt.nmd = function (e: any) {
        e.paths = [];
        if (!e.children) e.children = [];
        return e;
    };

    rt.r = function (exports: any) {
        if (typeof Symbol != 'undefined' && Symbol.toStringTag) {
            Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
        }
        Object.defineProperty(exports, '__esModule', { value: true });
    };

    const llChunks = (globalThis as any).__LOADABLE_LOADED_CHUNKS__;
    for (const chunk of llChunks) {
        const [, modules] = chunk;

        for (const mod in modules) {
            moduleRegistry[mod] = modules[mod];
        }
    }

    return rt;
};

export type RenderFn = (markdown: string, config: RenderConfig) => RenderResult;
export interface RenderConfig {
    disableEmbeds: boolean;
    externalLinksInNewTab: boolean;
    hasCohostPlus: boolean;
}
export interface RenderResult {
    initial: any;
    expanded: any;
    initialLength: number;
    expandedLength: number;
}

function innerLoad(): Promise<RenderFn> {
    const scriptPromises = [];
    for (const src of CONFIG.chunks) {
        scriptPromises.push(
            new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.className = 'cohost-preview-chunk';
                script.src = src;
                script.addEventListener('load', resolve);
                script.addEventListener('error', reject);
                document.body.append(script);
            })
        );
    }

    return Promise.all(scriptPromises)
        .then(() => {
            const require = chunkRuntime();
            const markdown = require(CONFIG.modules.markdown);
            console.log('cohost renderer loaded!');

            return (source: string, config: RenderConfig) =>
                markdown[CONFIG.symbols.render](
                    source.split('\n\n').map((content: string) => ({
                        type: 'markdown',
                        markdown: { content },
                    })),
                    new Date(),
                    config
                );
        })
        .catch((err) => {
            console.error('failed to load cohost renderer', err);
            throw err;
        });
}

let rendererPromise: Promise<RenderFn> | null = null;
export function loadRenderer(): Promise<RenderFn> {
    if (!rendererPromise) rendererPromise = innerLoad();
    return rendererPromise;
}
