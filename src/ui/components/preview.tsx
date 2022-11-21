import { h, createRef } from 'preact';
import { PureComponent } from 'preact/compat';
import { Document, RenderState, RenderTarget } from '../../document';
import { CodeEditor } from './code-editor';
import { javascript } from '@codemirror/lang-javascript';
import { PostPreview } from './post-preview';
import { DataPreview } from './data-preview';
import './preview.less';

export function Preview({
    document,
    render,
    onTargetChange,
    onLiveChange,
    onRender,
}: Preview.Props) {
    let contents = null;

    if (render.output) {
        if (render.output.target) {
            const data = render.output.outputs.get(render.output.target)!;

            contents = (
                <div class="i-data-preview">
                    <DataPreview data={data} />
                </div>
            );
        } else {
            contents = (
                <div class="i-post-preview">
                    <PostPreview
                        stale={render.rendering}
                        markdown={render.output.markdownOutput!}
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
            <div class="preview-error">
                {moduleIndex !== null ? (
                    <div class="error-title">
                        Error in {moduleIndex + 1}. {moduleLabel}
                    </div>
                ) : (
                    <div class="error-title">Error</div>
                )}
                <div class="error-contents">{errorString}</div>
                {sourceJavascript ? (
                    <div class="error-source">
                        <div class="inner-title">Source Script</div>
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
        <div class="data-preview" aria-label="Preview">
            <div class="preview-header">
                <div class="preview-config">
                    <select
                        class="output-select"
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
                    <span class="live-update">
                        <input
                            id={liveCheckbox}
                            checked={render.live}
                            onChange={(e) => {
                                onLiveChange((e.target as HTMLInputElement).checked);
                            }}
                            type="checkbox"
                        />{' '}
                        <label for={liveCheckbox}>Live Update</label>
                    </span>
                    {!render.live && (
                        <button class="render-button" onClick={onRender}>
                            Render
                        </button>
                    )}
                </div>
                <span class={'render-indicator' + (render.rendering ? ' is-rendering' : '')} />
            </div>
            {contents}
        </div>
    );
}
namespace Preview {
    export interface Props {
        document: Document;
        render: RenderState;
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
