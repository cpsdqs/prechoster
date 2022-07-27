import { h } from 'preact';
import { PureComponent } from 'preact/compat';
import { ModulePlugin, ModulePluginProps, Data, NamedInputData, PlainTextData, HtmlData } from '../../document';
import { CodeEditor } from '../../ui/components/code-editor';
import { html } from '@codemirror/lang-html';
// @ts-ignore
import svelteWorker from 'omt:./svelte-worker.js';

type SvelteComponents = Map<string, { contents: string }>;

let worker: Worker | null = null;

/** Bundles Svelte components into one Javascript file. */
function bundleComponents(components: SvelteComponents, main: string): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!worker) {
            worker = new Worker(new URL(svelteWorker, import.meta.url), {
                name: 'svelte-worker',
                type: 'module',
            });
        }

        let didReturn = false;
        const messageId = Math.random().toString(36);

        const onMessage = (e: MessageEvent) => {
            if (e.data.id === messageId) {
                if (e.data.success) {
                    resolve(e.data.result as string);
                } else {
                    reject(new Error(e.data.error));
                }
                didReturn = true;
                worker!.removeEventListener('message', onMessage);
            }
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', e => {
            reject(new Error('Error in svelte worker'));
            worker?.terminate();
            worker = null;
        });

        worker.postMessage({
            id: messageId,
            type: 'bundle',
            components,
            main,
        });

        setTimeout(() => {
            if (didReturn) return;
            reject(new Error('Svelte: bundler timed out'));
            worker?.terminate();
            worker = null;
        }, 1000);
    });
}

export type SveltePluginData = {
    contents: string,
};

class SvelteEditor extends PureComponent<ModulePluginProps<SveltePluginData>> {
    render({ data, namedInputKeys, onChange }: ModulePluginProps<SveltePluginData>) {
        return (
            <div class="plugin-less-editor">
                TODO modules
                <CodeEditor
                    value={data.contents}
                    onChange={contents => onChange({ ...data, contents })}
                    extensions={[html()]} />
            </div>
        );
    }
}

export default {
    id: 'source.svelte',
    acceptsInputs: false,
    acceptsNamedInputs: false,
    wantsDebounce: true,
    component: SvelteEditor as unknown, // typescript cant figure it out
    initialData(): SveltePluginData {
        return { contents: '' };
    },
    description() {
        return 'Svelte';
    },
    async eval(data: SveltePluginData, inputs: Data[], namedInputs: NamedInputData) {
        // don't collide with user variables for the entry point
        const componentName = `Main${Math.random().toString(36).replace(/[^\w]/g, '')}`;

        const components: SvelteComponents = new Map();
        components.set(componentName, data);

        let script = await bundleComponents(components, componentName);
        script += `window.${componentName}_init(${componentName});`;

        const jsUrl = `data:application/javascript;base64,${btoa(script)}`;

        // run the script inside of an invisible iframe
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', 'allow-scripts allow-popups allow-modals');
        iframe.className = 'svelte-execution-sandbox';
        Object.assign(iframe.style, {
            position: 'fixed',
            top: '0',
            left: '-1000px',
        });
        document.body.append(iframe);

        await new Promise<void>(resolve => {
            iframe.onload = () => resolve();
            iframe.srcdoc = `<!doctype html>
<html>
    <head>
        <script>
window.addEventListener('message', e => {
    if (e.data.type === 'eval') eval(e.data.script);
});
        </script>
    </head>
    <body></body>
</html>`;
        });

        try {
            const result = await new Promise<any>((resolve, reject) => {
                const messageId = Math.random().toString(36);

                let didReturn = false;
                const onMessage = (e: MessageEvent) => {
                    if (e.data.id === messageId) {
                        if (e.data.error) {
                            reject(new Error(e.data.error));
                        } else {
                            resolve({ html: e.data.html, styles: e.data.styles });
                        }
                        didReturn = true;
                        window.removeEventListener('message', onMessage);
                    }
                };
                window.addEventListener('message', onMessage);

                iframe.contentWindow!.postMessage({
                    type: 'eval',
                    script: `
window.process = { env: { NODE_ENV: "production" } };
{
    window.onerror = (msg, url, line, col, error) => {
        window.parent.postMessage({ id: messageId, error: error.toString() }, '*');
    };

    const messageId = "${messageId}";
    const svelteScript = document.createElement('script');
    svelteScript.src = "${jsUrl}";

    // called by the svelteScript (see above)
    window.${componentName}_init = function(component) {
        new component.default({
            target: document.body,
            props: {},
        });

        // send rendered HTML back to parent
        setTimeout(() => {
            window.parent.postMessage({
                id: messageId,
                html: document.body.innerHTML,
                styles: [...document.head.querySelectorAll('style')].map(s => s.innerHTML),
            }, '*');
        }, 16);
    };

    document.head.append(svelteScript);
}
            `,
                }, '*');

                setTimeout(() => {
                    if (!didReturn) {
                        reject(new Error('Svelte execution timed out'));
                        window.removeEventListener('message', onMessage);
                    }
                }, 1000);
            });

            iframe.remove();

            let html = result.html;
            if (result.styles.length) {
                html += `<style>${result.styles.join('\n')}</style>`;
            }
            return new HtmlData(html);
        } catch (err) {
            iframe.remove();
            throw err;
        }
    }
} as ModulePlugin<SveltePluginData>;
