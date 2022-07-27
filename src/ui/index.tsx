import { h } from 'preact';
import { Fragment, PureComponent, useState } from 'preact/compat';
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
        const debounceTime = this.props.document.wantsDebounce() ? 500 : 250;
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
            await this.props.document.resolveUnloaded();
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
                    <SaveLoad document={doc} />
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

function SaveLoad({ document }: { document: Document }) {
    const [hoveringWithFile, setHoveringWithFile] = useState(false);

    const onLoadDragEnter = () => {
        setHoveringWithFile(true);
    };
    const onLoadDragLeave = () => {
        setHoveringWithFile(false);
    };
    const onLoadDragOver = (e: DragEvent) => {
        e.preventDefault();
    };
    const loadFile = (file: File) => {
        return new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                try {
                    const result = JSON.parse(reader.result as string);
                    document.cloneFrom(Document.deserialize(result));
                    resolve();
                } catch (err) {
                    reject(new Error('could not parse file as JSON\n\n' + err));
                }
            });
            reader.addEventListener('error', () => {
                reject(new Error('could not read file\n\n' + reader.error));
            });
            reader.readAsText(file);
        });
    };

    const onLoadDrop = async (e: DragEvent) => {
        setHoveringWithFile(false);
        e.preventDefault();

        let didRead = false;
        let errors: unknown[] = [];
        for (let i = 0; i < e.dataTransfer!.items.length; i++) {
            const item = e.dataTransfer!.items[i];

            if (item.kind === 'file') {
                try {
                    await loadFile(item.getAsFile()!);
                    didRead = true;
                    break;
                } catch (err) {
                    errors.push(err);
                }
            } else if (item.kind === 'string') {
                try {
                    const asString = await new Promise<string>(resolve => {
                        item.getAsString(resolve);
                    });

                    document.cloneFrom(Document.deserialize(JSON.parse(asString)));
                    didRead = true;
                    break;
                } catch (err) {
                    errors.push(new Error(`could not parse data as JSON\n\n` + err));
                }
            }
        }

        if (!didRead) {
            alert(errors.join('\n\n'));
        }
    };

    const load = () => {
        const input = window.document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.click();
        input.addEventListener('change', () => {
            const file = input.files![0];
            if (!file) {
                return;
            }
        });
    };
    const save = () => {
        const a = window.document.createElement('a');
        const file = new File([JSON.stringify(document.serialize())], 'document', {
            type: 'application/json',
        });
        const objectURL = a.href = URL.createObjectURL(file);
        a.download = 'document.json';
        a.click();
        URL.revokeObjectURL(objectURL);
    };
    const loadNew = () => {
        document.cloneFrom(new Document());
    };

    return (
        <Fragment>
            <button
                className={hoveringWithFile ? 'is-drop-highlighted' : ''}
                onDragEnter={onLoadDragEnter}
                onDragLeave={onLoadDragLeave}
                onDragOver={onLoadDragOver}
                onDrop={onLoadDrop}
                onClick={load}>
                load file
            </button>
            <button onClick={save}>save file</button>
            <button onClick={loadNew}>new file</button>
        </Fragment>
    );
}
