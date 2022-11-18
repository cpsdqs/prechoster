import { h } from 'preact';
import { PureComponent } from 'preact/compat';
import {
    ModulePlugin,
    ModulePluginProps,
    Data,
    NamedInputData,
    PlainTextData,
    HtmlData,
} from '../../document';
import { CodeEditor } from '../../ui/components/code-editor';
import { html } from '@codemirror/lang-html';

export class SvelteComponentData extends PlainTextData {
    typeId = 'svelte-component';
    name: string;

    constructor(name: string, contents: string) {
        super(contents);
        this.name = name;
    }

    typeDescription() {
        return 'Svelte';
    }
}

export type SvelteComponentPluginData = {
    name: string;
    contents: string;
};

class SvelteComponentEditor extends PureComponent<ModulePluginProps<SvelteComponentPluginData>> {
    render({ data, namedInputKeys, onChange }: ModulePluginProps<SvelteComponentPluginData>) {
        return (
            <div class="plugin-svelte-component-editor">
                <label>Name:</label>{' '}
                <input
                    value={data.name}
                    onChange={(e) =>
                        onChange({ ...data, name: (e.target as HTMLInputElement).value })
                    }
                />
                <CodeEditor
                    value={data.contents}
                    onChange={(contents) => onChange({ ...data, contents })}
                    extensions={[html()]}
                />
            </div>
        );
    }
}

export default {
    id: 'source.svelte-component',
    acceptsInputs: false,
    acceptsNamedInputs: false,
    component: SvelteComponentEditor as unknown, // typescript cant figure it out
    initialData(): SvelteComponentPluginData {
        return { name: 'Component', contents: '' };
    },
    description(data: SvelteComponentPluginData) {
        if (data.name) return `${data.name} (Svelte Component)`;
        return 'Svelte Component';
    },
    async eval(data: SvelteComponentPluginData, inputs: Data[], namedInputs: NamedInputData) {
        return new SvelteComponentData(data.name, data.contents);
    },
} as ModulePlugin<SvelteComponentPluginData>;
