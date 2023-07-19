import { ModulePlugin } from '../document';

function lazy<T>(callback: () => Promise<{ default: T }>): () => Promise<T> {
    let cached: T | null = null;
    return async function lazy() {
        if (!cached) {
            cached = (await callback()).default;
        }
        return cached;
    };
}

export type ModuleDef = {
    title: string;
    description: string;
    load: () => Promise<ModulePlugin<any>>;
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
    'source.sass': {
        title: 'Sass',
        description:
            'Sass source and module context. Outputs compiled CSS. Accepts Sass modules and text data. To use text data: @use "./<name>"; and <name>.$value',
        load: lazy(() => import('./source/sass')),
    },
    'source.sass-module': {
        title: 'Sass Module',
        description:
            'A Sass module. Provide this to a Sass context and do @use "./<name>.scss" or @use "./<name>.sass", depending on mode.',
        load: lazy(() => import('./source/sass').then((r) => ({ default: r.sassModule }))),
    },
    'source.svelte': {
        title: 'Svelte',
        description:
            'Svelte source and module context. Outputs compiled HTML. Data provided to this module will be available to import as "./<name>" from any other module.',
        load: lazy(() => import('./source/svelte')),
    },
    'source.svelte-component': {
        title: 'Svelte Component',
        description:
            'Svelte component source. Outputs a Svelte component you can send to a Svelte context, and then import as "./<name>.svelte".',
        load: lazy(() => import('./source/svelte-component')),
    },
    'source.file-data': {
        title: 'File Data',
        description: 'Outputs a file as a raw data blob or UTF-8 text data.',
        load: lazy(() => import('./source/file-data')),
    },
    'source.file-data-url': {
        title: 'File as Data URL',
        description: 'Outputs a file as a `data:` URL (plain text data).',
        load: lazy(() => import('./source/file-data-url')),
    },
    'source.external-url-data': {
        title: 'Load from URL',
        description:
            'Load a script or stylesheet from an external URL. You can then send e.g. scripts to Svelte and stylesheets to Sass.',
        load: lazy(() => import('./source/external-url')),
    },
    'transform.style-inliner': {
        title: 'Style Inliner',
        description: 'Given HTML and CSS input, inlines the CSS into the HTML.',
        load: lazy(() => import('./transform/style-inliner')),
    },
    'transform.svg-to-background': {
        title: 'SVG to backgrounds',
        description:
            'Given HTML input, converts SVG elements tagged with `data-background` to background images on their parent element.',
        load: lazy(() => import('./transform/svg-to-background')),
    },
    'transform.svgo': {
        title: 'SVG Optimizer',
        description: 'Given text input, applies SVGO optimizations and outputs the result.',
        load: lazy(() => import('./transform/svgo')),
    },
    'transform.to-data-url': {
        title: 'To data URL',
        description: 'Converts input to a `data:` URL with a MIME type.',
        load: lazy(() => import('./transform/to-data-url')),
    },
    'transform.to-blob': {
        title: 'To blob',
        description:
            'Converts input to a `blob:` URL with a MIME type. Use this if you intend to upload the contents as an external resource.',
        load: lazy(() => import('./transform/to-blob')),
    },
};
