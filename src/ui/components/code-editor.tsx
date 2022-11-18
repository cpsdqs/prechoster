import { h, ComponentChildren } from 'preact';
import { PureComponent } from 'preact/compat';
import CodeMirror from './codemirror';
import { xcodeLight, xcodeDark } from '@uiw/codemirror-theme-xcode';
import './code-editor.less';

export class CodeEditor extends PureComponent<CodeEditor.Props> {
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

    render({ value, onChange, extensions, footer }: CodeEditor.Props) {
        const light = window.matchMedia('(prefers-color-scheme: light)').matches;
        const theme = light ? xcodeLight : xcodeDark;

        return (
            <div class="code-editor">
                <CodeMirror
                    value={value}
                    onChange={(newValue: string) => {
                        if (newValue === value) return;
                        onChange(newValue);
                    }}
                    theme={theme}
                    extensions={extensions}
                />
                <footer class="editor-footer">{footer}</footer>
            </div>
        );
    }
}
namespace CodeEditor {
    export interface Props {
        value: string;
        extensions: any[];
        footer?: ComponentChildren;
        onChange: (v: string) => void;
    }
}
