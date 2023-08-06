import React from 'react';
import { createRoot } from 'react-dom/client';
// @ts-ignore
import { staticUrlPrefix } from 'prechoster:config';

export const COHOST_RENDERER_VERSION = '2023-08-06';
const CONFIG = {
    chunks: [staticUrlPrefix + 'client.bfc5b576f11ae771b797.js'],
    modules: {
        react: 94159,
        markdown: 84717,
    },
    symbols: {
        renderToData: 'e8',
        renderFromData: 'gM',
    },
};
const extraModules = {
    31976: function (e: any) {
        // probably react-dom/server
        e.exports = {
            // renderToStaticMarkup
            uS: (markup: any) => {
                const node = document.createElement('div');
                const root = createRoot(node);
                root.render(markup);
                return node.innerHTML;
            },
        };
    },
    80641: function (e: any, t: any, n: any) {
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
    94586: function (e: any) {
        e.exports = {
            ZP: {
                public: {
                    project: {
                        mainAppProfile: ({ projectHandle }: any) => {
                            return `https://cohost.org/${projectHandle}`;
                        },
                    },
                    static: { staticAsset: ({ path }: any) => `${staticUrlPrefix}${path}` },
                },
            },
        };
    },
    61938: function (e: any) {
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
    84008: function (e: any) {
        e.exports = {
            ZP: {
                t: (id: any, { defaultValue }: any) => defaultValue,
            },
        };
    },
    84879: function (e: any) {
        e.exports = {
            ou: {
                fromISO: (s: string) => ({ toJSDate: () => new Date(s) }),
            },
        };
    },
    56575: function (e: any, t: any, n: any) {
        const React = n(CONFIG.modules.react);
        e.exports = {
            // seems to be some kind of message box
            v: ({ level, className, children }: any) => {
                return React.createElement(
                    'div',
                    {
                        className: 'cohost-message-box ' + className,
                        'data-level': level,
                    },
                    children
                );
            },
        };
    },
    98591: function (e: any) {
        e.exports = {
            // static assets
            S: (s: string) => staticUrlPrefix + s,
        };
    },
    61888: function (e: any) {
        // lodash isEqual polyfill
        function isEqual(a: any, b: any) {
            if (typeof a !== typeof b) return false;
            if (Array.isArray(a)) {
                if (a.length !== b.length) return false;
                for (let i = 0; i < a.length; i++) {
                    if (!isEqual(a[i], b[i])) return false;
                }
                return true;
            }
            if (typeof a === 'object') {
                for (const k in a) {
                    if (!(k in b) || !isEqual(a[k], b[k])) return false;
                }
                for (const k in b) {
                    if (!(k in a)) return false;
                }
                return true;
            }
            return a === b;
        }
        e.exports = {
            isEqual,
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

    rt.p = '/';

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
            if (!moduleRegistry[mod]) moduleRegistry[mod] = modules[mod];
        }
    }

    return rt;
};

export type RenderFn = (markdown: string, config: RenderConfig) => Promise<RenderResult>;
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

            return async (source: string, config: RenderConfig) => {
                const data = await markdown[CONFIG.symbols.renderToData](
                    source.split('\n\n').map((content: string) => ({
                        type: 'markdown',
                        markdown: { content },
                    })),
                    new Date(),
                    config
                );
                return markdown[CONFIG.symbols.renderFromData](data, config);
            };
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
