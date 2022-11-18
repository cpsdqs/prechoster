import { h } from 'preact';
import { Document, RenderState, RenderTarget } from '../../document';
import { PostPreview } from './post-preview';
import { DataPreview } from './data-preview';
import './preview.less';

export function Preview({ document, render, onTargetChange, onLiveChange, onPlusChange, onRender }: Preview.Props) {
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
                        plus={render.plus} />
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

        contents = (
            <div class="preview-error">
                {(moduleIndex !== null) ? (
                    <div class="error-title">
                        Error in {moduleIndex + 1}. {moduleLabel}
                    </div>
                ) : (
                    <div class="error-title">Error</div>
                )}
                <div class="error-contents">
                    {(render.error.error as any).toString()}
                </div>
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
    const plusCheckbox = Math.random().toString(36);

    return (
        <div class="data-preview">
            <div class="preview-header">
                <div class="preview-config">
                    <select
                        class="output-select"
                        value={render.target || 'output'}
                        onChange={e => {
                            const target = (e.target as HTMLSelectElement).value;
                            if (target === 'output') onTargetChange(null);
                            else onTargetChange(target);
                        }}>
                        {outputTargets}
                        <option value="output">output</option>
                    </select>
                    <span class="plus-update">
                        <input
                            id={plusCheckbox}
                            checked={render.plus}
                            onChange={e => {
                                onPlusChange((e.target as HTMLInputElement).checked);
                            }}
                            type="checkbox" />
                        {' '}
                        <label for={plusCheckbox}>Cohost Plus</label>
                    </span>
                    <span class="live-update">
                        <input
                            id={liveCheckbox}
                            checked={render.live}
                            onChange={e => {
                                onLiveChange((e.target as HTMLInputElement).checked);
                            }}
                            type="checkbox" />
                        {' '}
                        <label for={liveCheckbox}>Live Update</label>
                    </span>
                    {!render.live && (
                        <button class="render-button" onClick={onRender}>Render</button>
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
        onPlusChange: (plus: boolean) => void;
        onRender: () => void;
    }
}
