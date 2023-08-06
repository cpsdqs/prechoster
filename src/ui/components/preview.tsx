import { createRef, useState, PureComponent, useRef, useInsertionEffect } from 'react';
import { Document, RenderState, RenderTarget } from '../../document';
import { CodeEditor } from './code-editor';
import { javascript } from '@codemirror/lang-javascript';
import { PostPreview, PreviewConfig, DEFAULT_PREVIEW_CONFIG } from './post-preview';
import { DataPreview } from './data-preview';
import './preview.less';

export function Preview({
    document,
    render,
    clickToRender,
    onTargetChange,
    onLiveChange,
    onRender,
}: Preview.Props) {
    let contents = null;
    const [previewConfig, onPreviewConfigChange] = useState<PreviewConfig>(DEFAULT_PREVIEW_CONFIG);
    const [readMore, setReadMore] = useState(false);
    const lastPostPreviewHeight = useRef(0);
    const previewContainer = useRef<HTMLDivElement>(null);

    useInsertionEffect(() => {
        const preview = previewContainer.current;
        if (!preview) return;
        lastPostPreviewHeight.current = preview.offsetHeight;
    });

    const postErrorPortal = useRef<HTMLDivElement>(null);
    let errorContents = null;

    if (clickToRender) {
        contents = (
            <div className="i-preview-click-to-render">
                <p className="i-description">rendering paused</p>
                <button onClick={clickToRender}>render</button>
            </div>
        );
    } else if (render.output) {
        if (render.output.target) {
            const data = render.output.outputs.get(render.output.target)!;

            contents = (
                <div className="i-data-preview" ref={previewContainer}>
                    <DataPreview data={data} />
                </div>
            );
        } else {
            contents = (
                <div className="i-post-preview" ref={previewContainer}>
                    <PostPreview
                        renderId={render.id}
                        stale={render.rendering}
                        markdown={render.output.markdownOutput!}
                        config={previewConfig}
                        onConfigChange={onPreviewConfigChange}
                        readMore={readMore}
                        onReadMoreChange={setReadMore}
                        errorPortal={postErrorPortal.current}
                    />
                </div>
            );
        }
    } else if (render.error) {
        let moduleIndex = null;
        let moduleLabel = null;
        if (render.error.source) {
            const module = document.findModule(render.error.source);
            if (module) {
                moduleIndex = document.modules.indexOf(module);
                moduleLabel = module.plugin.description(module.data);
            }
        }

        let errorString = (render.error.error as any).toString();
        let sourceJavascript = (render.error.error as any).sourceJavascript;
        let sourceJavascriptLine = (render.error.error as any).sourceJavascriptLine;

        contents = (
            <div
                className="preview-error-placeholder"
                style={{
                    minHeight: lastPostPreviewHeight.current,
                }}
            ></div>
        );

        errorContents = (
            <div className="preview-error">
                {moduleIndex !== null ? (
                    <div className="error-title">
                        Error in {moduleIndex + 1}. {moduleLabel}
                    </div>
                ) : (
                    <div className="error-title">Error</div>
                )}
                <div className="error-contents">{errorString}</div>
                {sourceJavascript ? (
                    <div className="error-source">
                        <div className="inner-title">Source Script</div>
                        <SourceJavascript source={sourceJavascript} line={sourceJavascriptLine} />
                    </div>
                ) : null}
            </div>
        );
    }

    const modules = document.modules;
    const outputTargets = [];
    for (let i = 0; i < modules.length; i++) {
        const module = modules[i];
        outputTargets.push(
            <option value={module.id} key={module.id}>
                {i + 1}. {module.plugin.description(module.data)}
            </option>
        );
    }

    const liveCheckbox = Math.random().toString(36);

    return (
        <div className="data-preview" aria-label="Preview">
            <div className="i-preview-area">
                <div className="preview-header">
                    <div className="preview-config">
                        <select
                            className="output-select"
                            value={render.target || 'output'}
                            onChange={(e) => {
                                const target = (e.target as HTMLSelectElement).value;
                                if (target === 'output') onTargetChange(null);
                                else onTargetChange(target);
                            }}
                        >
                            {outputTargets}
                            <option value="output">output</option>
                        </select>
                        <span className="live-update">
                            <input
                                id={liveCheckbox}
                                checked={render.live}
                                onChange={(e) => {
                                    onLiveChange((e.target as HTMLInputElement).checked);
                                }}
                                type="checkbox"
                            />{' '}
                            <label htmlFor={liveCheckbox}>Live Update</label>
                        </span>
                        {!render.live && (
                            <button className="render-button" onClick={onRender}>
                                Render
                            </button>
                        )}
                    </div>
                    <span
                        className={'render-indicator' + (render.rendering ? ' is-rendering' : '')}
                    />
                </div>
                {contents}
            </div>
            <div className="i-error-area" ref={postErrorPortal}>
                {errorContents}
            </div>
        </div>
    );
}

namespace Preview {
    export interface Props {
        document: Document;
        render: RenderState;
        clickToRender: (() => void) | null;
        onTargetChange: (target: RenderTarget) => void;
        onLiveChange: (live: boolean) => void;
        onRender: () => void;
    }
}

class SourceJavascript extends PureComponent<{ source: string; line?: number }> {
    extensions = [javascript()];
    editor = createRef<CodeEditor>();
    wasUnmounted = false;

    onChange = () => {};

    highlightErrorLine() {
        if (this.wasUnmounted) return;
        const cm = this.editor.current?.editor?.current?.view;
        if (!cm) {
            // umm...try again later i guess
            setTimeout(() => {
                this.highlightErrorLine();
            }, 100);
        }

        if (cm && this.props.line) {
            const lineData = cm.state.doc.line(this.props.line);
            cm.dispatch({
                selection: { anchor: lineData.from, head: lineData.to },
                scrollIntoView: true,
            });
        }
    }

    componentDidMount() {
        this.highlightErrorLine();
    }

    componentDidUpdate(prevProps: { line?: number }) {
        if (prevProps.line !== this.props.line) this.highlightErrorLine();
    }

    componentWillUnmount() {
        this.wasUnmounted = true;
    }

    render() {
        return (
            <CodeEditor
                ref={this.editor}
                readOnly
                value={this.props.source}
                onChange={this.onChange}
                extensions={this.extensions}
            />
        );
    }
}
