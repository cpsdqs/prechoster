import React, { createRef, PureComponent } from 'react';
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

    render() {
        const { value, extensions, footer, readOnly } = this.props;
        const light = window.matchMedia('(prefers-color-scheme: light)').matches;
        const theme = light ? xcodeLight : xcodeDark;

        return (
            <div className="code-editor">
                <CodeMirror
                    ref={this.editor}
                    readOnly={readOnly}
                    value={value}
                    onChange={this.onValueChange}
                    theme={theme}
                    extensions={extensions}
                />
                <footer className="editor-footer">{footer}</footer>
            </div>
        );
    }
}
namespace CodeEditor {
    export interface Props {
        value: string;
        extensions: any[];
        footer?: React.ReactNode;
        onChange: (v: string) => void;
        readOnly?: boolean;
    }
}
