import { h, createRef, ComponentChildren } from 'preact';
import { PureComponent } from 'preact/compat';
import CodeMirror from './codemirror';
import { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { xcodeLight, xcodeDark } from '@uiw/codemirror-theme-xcode';
import './code-editor.less';

export class CodeEditor extends PureComponent<CodeEditor.Props> {
    themeQuery = window.matchMedia('(prefers-color-scheme: light)');
    editor = createRef<ReactCodeMirrorRef>();

    componentDidMount() {
        this.themeQuery.addEventListener('change', this.onThemeChange);
    }

    componentWillUnmount() {
        this.themeQuery.removeEventListener('change', this.onThemeChange);
    }

    onThemeChange = () => {
        this.forceUpdate();
    };

    onValueChange = (newValue: string) => {
        if (newValue === this.props.value) return;
        this.props.onChange(newValue);
    };

    render({ value, onChange, extensions, footer, readOnly }: CodeEditor.Props) {
        const light = window.matchMedia('(prefers-color-scheme: light)').matches;
        const theme = light ? xcodeLight : xcodeDark;

        return (
            <div class="code-editor">
                <CodeMirror
                    ref={this.editor}
                    readOnly={readOnly}
                    value={value}
                    onChange={this.onValueChange}
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
        readOnly?: boolean;
    }
}
