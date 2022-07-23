import { h } from 'preact';
import { PureComponent } from 'preact/compat';
import {
    ModulePlugin,
    ModulePluginProps,
    Data,
    NamedInputData,
    HtmlData,
    CssData,
    PlainTextData,
} from '../../document';
import { CodeEditor } from '../../ui/components/code-editor';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';

const LANGUAGES: { [k: string]: () => unknown[] } = {
    text: () => [],
    html: () => [html()],
    css: () => [css()],
    javascript: () => [javascript()],
};

export type TextPluginData = {
    contents: string,
    language: string,
};

class TextEditor extends PureComponent<ModulePluginProps<TextPluginData>> {
    render({ data, onChange }: ModulePluginProps<TextPluginData>) {
        return (
            <div class="plugin-plain-text-editor">
                <CodeEditor
                    value={data.contents}
                    onChange={contents => onChange({ ...data, contents })}
                    extensions={LANGUAGES[data.language]()} />
                <div class="i-footer">
                    <label>Mode:</label>
                    <select value={data.language} onChange={e => {
                        onChange({ ...data, language: (e.target as HTMLSelectElement).value });
                    }}>
                        {Object.keys(LANGUAGES).map(k => <option value={k}>{k}</option>)}
                    </select>
                </div>
            </div>
        );
    }
}

export default {
    id: 'source.text',
    acceptsInputs: false,
    acceptsNamedInputs: false,
    component: TextEditor as unknown, // typescript cant figure it out
    initialData(): TextPluginData {
        return { contents: '', language: 'text' };
    },
    description(data: TextPluginData) {
        if (data.language === 'html') return 'HTML';
        else if (data.language === 'css') return 'CSS';
        return 'Plain Text Data';
    },
    async eval(data: TextPluginData) {
        if (data.language === 'html') return new HtmlData(data.contents);
        else if (data.language === 'css') return new CssData(data.contents);
        return new PlainTextData(data.contents);
    }
} as ModulePlugin<TextPluginData>;
