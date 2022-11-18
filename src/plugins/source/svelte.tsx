import { h } from 'preact';
import { PureComponent } from 'preact/compat';
import {
    ModulePlugin,
    ModulePluginProps,
    Data,
    NamedInputData,
    PlainTextData,
    HtmlData,
    JavascriptData,
} from '../../document';
import { CodeEditor } from '../../ui/components/code-editor';
import { SvelteComponentData } from './svelte-component';
import { EditorView } from '@codemirror/view';
import { html } from '@codemirror/lang-html';
import base64js from 'base64-js';
// @ts-ignore
import svelteWorker from 'omt:./svelte-worker.js';

type SvelteModules = Map<string, { contents: string }>;

let worker: Worker | null = null;

/** Bundles Svelte modules into one Javascript file. */
function bundleModules(modules: SvelteModules, main: string, mainId: string): Promise<string> {
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
        worker.addEventListener('error', (e) => {
            reject(new Error('Error in svelte worker'));
            worker?.terminate();
            worker = null;
        });

        worker.postMessage({
            id: messageId,
            type: 'bundle',
            modules,
            main,
            mainId,
        });

        setTimeout(() => {
            if (didReturn) return;
            reject(new Error('Svelte: bundler timed out'));
            worker?.terminate();
            worker = null;
        }, 5000);
    });
}

export type SveltePluginData = {
    contents: string;
};

class SvelteEditor extends PureComponent<ModulePluginProps<SveltePluginData>> {
    extensions = [html(), EditorView.lineWrapping];

    render({ data, namedInputKeys, onChange }: ModulePluginProps<SveltePluginData>) {
        return (
            <div class="plugin-less-editor">
                <CodeEditor
                    value={data.contents}
                    onChange={(contents) => onChange({ ...data, contents })}
                    extensions={this.extensions}
                />
            </div>
        );
    }
}

let execFrame: HTMLIFrameElement | null = null;

export default {
    id: 'source.svelte',
    acceptsInputs: true,
    acceptsNamedInputs: true,
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

        const modules: SvelteModules = new Map();
        modules.set(`${componentName}.svelte`, data);

        for (const value of inputs) {
            const component = value.into(SvelteComponentData);
            if (!component) {
                throw new Error(`could not convert input to svelte component`);
            }
            const fileName = `${component.name}.svelte`;
            if (modules.has(fileName))
                throw new Error(`duplicate component name ${component.name}`);
            modules.set(fileName, component);
        }
        for (const [name, value] of namedInputs) {
            let data;
            if ((data = value.into(SvelteComponentData))) {
                const fileName = `${data.name}.svelte`;
                if (modules.has(fileName)) throw new Error(`duplicate component name ${data.name}`);
                modules.set(fileName, data);
            } else if ((data = value.into(JavascriptData))) {
                modules.set(name, data);
            } else if ((data = value.into(PlainTextData))) {
                modules.set(name, { contents: `export default ${JSON.stringify(data.contents)};` });
            } else {
                throw new Error(
                    `don’t know how to deal with input ${name} of type ${value.typeId}`
                );
            }
        }

        let script = await bundleModules(modules, componentName + '.svelte', componentName);
        script += `window.${componentName}_init(${componentName});`;

        const scriptBase64 = base64js.fromByteArray(new TextEncoder().encode(script));

        // run the script inside of an invisible iframe
        if (!execFrame) {
            execFrame = document.createElement('iframe');
            execFrame.setAttribute('sandbox', 'allow-scripts allow-popups allow-modals');
            execFrame.className = 'svelte-execution-sandbox';
            execFrame.setAttribute('aria-hidden', 'true');
            execFrame.setAttribute('tabindex', '-1');
            execFrame.addEventListener('focus', () => {
                document.body.focus();
            });
            Object.assign(execFrame.style, {
                position: 'fixed',
                top: '0',
                left: '-1000px',
            });
            document.body.append(execFrame);
        }

        const iframe = execFrame!;

        await new Promise<void>((resolve) => {
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
                            const error = new Error(e.data.error);
                            (error as any).sourceJavascript = script;

                            const lineMatch = e.data.error.match(/@blob:[0-9a-z\-\/]+:(\d+)/i);
                            if (lineMatch) {
                                (error as any).sourceJavascriptLine = +lineMatch[1];
                            }

                            reject(error);
                        } else {
                            resolve({ html: e.data.html, styles: e.data.styles });
                        }
                        didReturn = true;
                        window.removeEventListener('message', onMessage);
                    }
                };
                window.addEventListener('message', onMessage);

                iframe.contentWindow!.postMessage(
                    {
                        type: 'eval',
                        script: `
window.process = { env: { NODE_ENV: "production" } };
{
    window.addEventListener('error', e => {
        let errorText = [
            e.message,
            '',
            e.error?.stack?.toString() || e.error?.toString(),
        ].filter(x => x).join('\\n');

        window.parent.postMessage({
            id: messageId,
            error: errorText,
        }, '*');
    });
    window.addEventListener('unhandledrejection', e => {
        window.parent.postMessage({
            id: messageId,
            error: e.reason || 'Unhandled promise rejection',
        }, '*');
    });

    const messageId = "${messageId}";
    const svelteScript = document.createElement('script');
    const scriptBlob = new Blob([atob("${scriptBase64}")]);
    svelteScript.src = URL.createObjectURL(scriptBlob);

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
                    },
                    '*'
                );

                setTimeout(() => {
                    if (!didReturn) {
                        reject(new Error('Svelte execution timed out'));
                        window.removeEventListener('message', onMessage);
                    }
                }, 5000);
            });

            let html = result.html;
            if (result.styles.length) {
                html += `<style>${result.styles.join('\n')}</style>`;
            }
            iframe.srcdoc = '';
            return new HtmlData(html);
        } catch (err) {
            iframe.srcdoc = '';
            throw err;
        }
    },
} as ModulePlugin<SveltePluginData>;
