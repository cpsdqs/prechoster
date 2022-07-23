import { h } from 'preact';
import { PureComponent, useState } from 'preact/compat';
import { SplitPanel } from './components/split-panel';
import { ModuleList } from './components/module-list';
import { ModuleGraph } from './components/module-graph';
import { PostPreview } from './components/post-preview';
import { Document, Module, ModuleId, Data, MOD_OUTPUT } from '../document';
import { MODULES } from '../plugins';
import './index.less';

interface PrechosterState {
    rendering: boolean;
    rendered: { markdown: string, nodes: Map<ModuleId, Data> } | null;
    renderError: unknown | null;
    selected: ModuleId | null;
};

export default class Prechoster extends PureComponent<Prechoster.Props, PrechosterState> {
    state = {
        rendering: false,
        rendered: null,
        renderError: null,
        selected: null,
    };

    componentDidMount() {
        this.props.document.addEventListener('change', this.onDocumentChange);
        this.renderPreview();
    }
    componentDidUpdate(prevProps: Prechoster.Props) {
        if (this.props.document !== prevProps.document) {
            prevProps.document.removeEventListener('change', this.onDocumentChange);
            this.props.document.addEventListener('change', this.onDocumentChange);
            this.scheduleRender();
        }
    }
    componentWillUnmount() {
        this.props.document.removeEventListener('change', this.onDocumentChange);
    }

    onDocumentChange = () => {
        this.scheduleRender();
        this.forceUpdate();
    };

    renderTimeout: any = null;
    scheduleRender() {
        const debounceTime = this.props.document.wantsDebounce() ? 250 : 50;
        clearTimeout(this.renderTimeout);
        this.renderTimeout = setTimeout(() => {
            this.renderTimeout = null;
            this.renderPreview();
        }, debounceTime);
    }

    renderId = 0;
    async renderPreview() {
        const renderId = ++this.renderId;
        this.setState({ rendering: true });

        try {
            const rendered = await this.props.document.evalMdOutput();

            if (renderId !== this.renderId) return;
            this.setState({ rendering: false, rendered, renderError: null });
        } catch (err) {
            console.error(err);
            if (renderId !== this.renderId) return;
            this.setState({ rendering: false, rendered: null, renderError: err });
        }
    }

    render() {
        const doc = this.props.document;
        const rendered = this.state.rendered || { markdown: '', nodes: new Map() };

        return (
            <div class="prechoster">
                <div class="menu-bar">
                    <button disabled={!doc.canUndo} onClick={() => doc.undo()}>undo</button>
                    <button disabled={!doc.canRedo} onClick={() => doc.redo()}>redo</button>
                </div>
                <SplitPanel initialPos={Math.min(0.7, Math.max(500 / innerWidth, 1 - 700 / innerWidth))}>
                    <ModuleList
                        document={doc}
                        selected={this.state.selected}
                        onSelect={selected => this.setState({ selected })} />
                    <SplitPanel vertical initialPos={Math.max(0.6, 1 - 300 / innerHeight)}>
                        <div class="top-preview">
                            <PostPreview
                                stale={this.state.rendering}
                                markdown={rendered.markdown}
                                error={this.state.renderError} />
                        </div>
                        <ModuleGraph
                            document={doc}
                            selected={this.state.selected}
                            nodeOutputs={rendered.nodes}
                            onSelect={selected => this.setState({ selected })} />
                    </SplitPanel>
                </SplitPanel>
            </div>
        );
    }
}
namespace Prechoster {
    export interface Props {
        document: Document;
    }
}
