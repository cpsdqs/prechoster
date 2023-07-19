import { createRef, PureComponent } from 'react';
import {
    ModulePlugin,
    ModulePluginProps,
    HtmlData,
    CssData,
    JavascriptData,
    PlainTextData,
} from '../../document';
import { CodeEditor } from '../../ui/components/code-editor';
import { EditorView } from '@codemirror/view';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import './text.less';

const HTML_CONTENTEDITABLE = 'html-contenteditable';

const LANGUAGES: { [k: string]: () => unknown[] } = {
    text: () => [EditorView.lineWrapping],
    html: () => [html(), EditorView.lineWrapping],
    css: () => [css()],
    javascript: () => [javascript()],
    [HTML_CONTENTEDITABLE]: () => [html(), EditorView.lineWrapping],
};

const LANGUAGE_LABELS: { [k: string]: string } = {
    text: 'Plain Text',
    html: 'HTML',
    css: 'CSS',
    javascript: 'Javascript',
    [HTML_CONTENTEDITABLE]: 'Rich Text (HTML)',
};

export type TextPluginData = {
    contents: string;
    language: string;
};

class TextEditor extends PureComponent<ModulePluginProps<TextPluginData>> {
    state = {
        editingRichText: true,
    };

    memoizedExtensions: any = null;

    get extensions() {
        if (!this.memoizedExtensions) {
            this.memoizedExtensions = LANGUAGES[this.props.data.language]();
        }
        return this.memoizedExtensions;
    }

    render() {
        const { data, onChange } = this.props;
        const useRichTextCheckboxId = Math.random().toString(36);

        const footer = (
            <div className="i-footer">
                <span>
                    <label>Mode:</label>
                    <select
                        value={data.language}
                        onChange={(e) => {
                            this.memoizedExtensions = null;
                            onChange({ ...data, language: (e.target as HTMLSelectElement).value });
                        }}
                    >
                        {Object.keys(LANGUAGES).map((k) => (
                            <option key={k} value={k}>
                                {LANGUAGE_LABELS[k]}
                            </option>
                        ))}
                    </select>
                </span>
                {data.language === HTML_CONTENTEDITABLE ? (
                    <span>
                        {' '}
                        <input
                            id={useRichTextCheckboxId}
                            type="checkbox"
                            checked={this.state.editingRichText}
                            onChange={(e) => {
                                this.setState({
                                    editingRichText: (e.target as HTMLInputElement).checked,
                                });
                            }}
                        />
                        <label htmlFor={useRichTextCheckboxId}>Rich Text Editor</label>
                    </span>
                ) : null}
            </div>
        );

        let editor;
        if (data.language === HTML_CONTENTEDITABLE && this.state.editingRichText) {
            editor = (
                <div>
                    <RichTextEditor
                        html={data.contents}
                        onHtmlChange={(contents) => onChange({ ...data, contents })}
                    />
                    {footer}
                </div>
            );
        } else {
            editor = (
                <CodeEditor
                    value={data.contents}
                    onChange={(contents) => onChange({ ...data, contents })}
                    extensions={this.extensions}
                    footer={footer}
                />
            );
        }

        return <div className="plugin-plain-text-editor">{editor}</div>;
    }
}

function sanitizeHtmlALittleBit(html: string) {
    const doc = new DOMParser().parseFromString(
        `<!doctype html><html><head><meta charset="utf-8" /></head><body>` + html,
        'text/html'
    );
    for (const s of doc.querySelectorAll('script, style')) s.remove();
    return doc.body.innerHTML;
}

class RichTextEditor extends PureComponent<RichTextEditor.Props> {
    node = createRef<HTMLDivElement>();
    currentHtmlValue = '';

    componentDidMount() {
        this.currentHtmlValue = this.props.html;
        this.node.current!.innerHTML = sanitizeHtmlALittleBit(this.props.html);
        this.node.current!.addEventListener('input', this.contentsDidChange);
    }

    componentDidUpdate(prevProps: RichTextEditor.Props) {
        if (prevProps.html !== this.props.html) {
            if (this.props.html !== this.currentHtmlValue) {
                this.setHtml(this.props.html);
            }
        }
    }

    contentsDidChange = () => {
        this.currentHtmlValue = this.node.current!.innerHTML;
        this.props.onHtmlChange(this.currentHtmlValue);
    };

    setHtml(html: string) {
        this.node.current!.innerHTML = sanitizeHtmlALittleBit(html);
        this.currentHtmlValue = html;
    }

    render() {
        return (
            <div
                className="plugin-text-rich-text-editor"
                contentEditable={true}
                ref={this.node}
            ></div>
        );
    }
}
namespace RichTextEditor {
    export interface Props {
        html: string;
        onHtmlChange: (s: string) => void;
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
        else if (data.language === 'javascript') return 'Javascript';
        else if (data.language === HTML_CONTENTEDITABLE) return 'HTML (Rich Text)';
        return 'Plain Text Data';
    },
    async eval(data: TextPluginData) {
        if (data.language === 'html' || data.language === HTML_CONTENTEDITABLE)
            return new HtmlData(data.contents);
        else if (data.language === 'css') return new CssData(data.contents);
        else if (data.language === 'javascript') return new JavascriptData(data.contents);
        return new PlainTextData(data.contents);
    },
} as ModulePlugin<TextPluginData>;
