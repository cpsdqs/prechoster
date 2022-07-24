import { ModulePlugin } from '../document';

function lazy<T>(callback: () => Promise<{ default: T }>): () => Promise<T> {
    let cached: T | null = null;
    return async function lazy() {
        if (!cached) {
            cached = (await callback()).default;
        }
        return cached;
    }
}

export type ModuleDef = {
    title: string,
    description: string,
    load: () => Promise<ModulePlugin<any>>,
};

export const MODULES: { [k: string]: ModuleDef } = {
    'source.text': {
        title: 'Text',
        description: 'Text source (e.g. HTML or CSS).',
        load: lazy(() => import('./source/text')),
    },
    'source.lesscss': {
        title: 'LessCSS',
        description: 'LessCSS source. Outputs compiled CSS.',
        load: lazy(() => import('./source/lesscss')),
    },
    'source.svelte': {
        title: 'Svelte',
        description: 'Svelte source. Outputs compiled HTML.',
        load: lazy(() => import('./source/svelte')),
    },
    'source.file-data-url': {
        title: 'File as Data URL',
        description: 'Outputs a file as a `data:` URL (plain text data).',
        load: lazy(() => import('./source/file-data-url')),
    },
    'transform.style-inliner': {
        title: 'Style Inliner',
        description: 'Given HTML and CSS input, inlines the CSS into the HTML.',
        load: lazy(() => import('./transform/style-inliner')),
    },
    'transform.svg-to-background': {
        title: 'SVG to backgrounds',
        description: 'Given HTML input, converts SVG elements tagged with `data-background` to background images on their parent element.',
        load: lazy(() => import('./transform/svg-to-background')),
    },
    'transform.to-data-url': {
        title: 'To data URL',
        description: 'Converts input to a `data:` URL with a MIME type.',
        load: lazy(() => import('./transform/to-data-url')),
    },
};
