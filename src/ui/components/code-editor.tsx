import { h } from 'preact';
import { PureComponent } from 'preact/compat';
import CodeMirror from '@uiw/react-codemirror';
import { xcodeLight, xcodeDark } from '@uiw/codemirror-theme-xcode';
import './code-editor.less';

export class CodeEditor extends PureComponent<CodeEditor.Props> {
    // codemirror glitches weirdly when you type too quickly and the react update is too slow,
    // so we'll store the last N changes here so parent elements can catch up
    // TODO: fix it properly
    editingBuffer: string[] = [];

    themeQuery = window.matchMedia('(prefers-color-scheme: light)');

    componentDidMount() {
        this.themeQuery.addEventListener('change', this.onThemeChange);
    }

    componentWillUnmount() {
        this.themeQuery.removeEventListener('change', this.onThemeChange);
    }

    onThemeChange = () => {
        this.forceUpdate();
    };

    render({ value, onChange, extensions }: CodeEditor.Props) {
        const light = window.matchMedia('(prefers-color-scheme: light)').matches;
        const theme = light ? xcodeLight : xcodeDark;

        if (!this.editingBuffer.includes(value)) {
            this.editingBuffer = [value];
        }
        const editingValue = this.editingBuffer[this.editingBuffer.length - 1];

        return (
            <div class="code-editor">
                <CodeMirror
                    value={editingValue}
                    onChange={(newValue: string) => {
                        if (newValue === editingValue) return;
                        this.editingBuffer.push(newValue);
                        while (this.editingBuffer.length > 20) this.editingBuffer.shift();

                        onChange(newValue);
                    }}
                    theme={theme}
                    extensions={extensions} />
            </div>
        );
    }
}
namespace CodeEditor {
    export interface Props {
        value: string;
        extensions: unknown[];
        onChange: (v: string) => void;
    }
}
