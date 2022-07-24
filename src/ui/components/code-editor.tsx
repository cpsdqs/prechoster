import { h } from 'preact';
import { PureComponent } from 'preact/compat';
import CodeMirror from '@uiw/react-codemirror';
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
        console.log('theme change!');
        this.forceUpdate();
    };

    render({ value, onChange, extensions }: CodeEditor.Props) {
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
