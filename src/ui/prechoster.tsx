import React, { PureComponent } from 'react';
import { SplitPanel } from './components/split-panel';
import { ModuleList } from './components/module-list';
import { ModuleGraph, EdgeId } from './components/module-graph';
import { Preview } from './components/preview';
import { Document, ModuleId, RenderState } from '../document';
import { RenderContext } from './render-context';
// @ts-ignore
import { homepage as sourceLink } from '../../package.json';
import './prechoster.less';

interface PrechosterState {
    render: RenderState;
    clickToRender: boolean;
    selected: ModuleId | EdgeId | null;
}

export class Prechoster extends PureComponent<Prechoster.Props, PrechosterState> {
    state = {
        render: {
            id: '',
            target: null,
            live: true,
            rendering: false,
            output: null,
            error: null,
        },
        clickToRender: false,
        selected: null,
    };

    componentDidMount() {
        this.props.document.addEventListener('change', this.onDocumentChange);
        if (this.props.initWithoutRender) {
            const renderId = ++this.renderId;
            this.setState({ render: { ...this.state.render, rendering: true } });
            this.props.document
                .resolveUnloaded()
                .then(() => {
                    if (renderId !== this.renderId) return;
                    (this.state.render as RenderState).output?.drop();

                    this.setState({
                        render: {
                            ...this.state.render,
                            rendering: false,
                            id: this.renderId.toString(),
                        },
                        clickToRender: true,
                    });
                })
                .catch((err) => {
                    if (renderId !== this.renderId) return;
                    console.error(err);
                    (this.state.render as RenderState).output?.drop();

                    this.setState({
                        render: {
                            ...this.state.render,
                            rendering: false,
                            output: null,
                            error: {
                                type: 'error',
                                source: null,
                                error: err,
                            },
                        },
                    });
                });
        } else {
            this.renderPreview();
        }
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
        if (this.state.render.live) {
            this.scheduleRender();
        }
        this.forceUpdate();
    };

    renderTimeout: any = null;
    scheduleRender() {
        if (this.state.clickToRender) return;

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
        this.setState({
            render: {
                ...this.state.render,
                rendering: true,
            },
        });

        try {
            await this.props.document.resolveUnloaded();
            const result = await this.props.document.eval(this.state.render.target);
            let output = null;
            let error = null;
            if (result.type === 'output') {
                output = result;
            } else if (result.type === 'error') {
                error = result;
            }

            if (renderId !== this.renderId) return;
            (this.state.render as RenderState).output?.drop();

            this.setState({
                render: {
                    ...this.state.render,
                    rendering: false,
                    output,
                    error,
                    id: this.renderId.toString(),
                },
            });
        } catch (err) {
            if (renderId !== this.renderId) return;
            console.error(err);

            (this.state.render as RenderState).output?.drop();

            this.setState({
                render: {
                    ...this.state.render,
                    rendering: false,
                    output: null,
                    error: {
                        type: 'error',
                        source: null,
                        error: err,
                    },
                },
            });
        }
    }

    renderContext = {
        scheduleRender: () => this.scheduleRender(),
    };

    render() {
        const doc = this.props.document;
        const { render } = this.state;

        return (
            <RenderContext.Provider value={this.renderContext}>
                <div className="prechoster">
                    <SplitPanel
                        initialPos={Math.min(0.7, Math.max(500 / innerWidth, 1 - 700 / innerWidth))}
                    >
                        <div className="prechoster-left-panel">
                            <DocumentSettings doc={doc} />
                            <ModuleList
                                document={doc}
                                selected={this.state.selected}
                                onSelect={(selected) => this.setState({ selected })}
                            />
                        </div>
                        <SplitPanel vertical initialPos={Math.max(0.6, 1 - 300 / innerHeight)}>
                            <Preview
                                document={doc}
                                render={render}
                                clickToRender={
                                    this.state.clickToRender
                                        ? () => {
                                              this.setState({ clickToRender: false }, () => {
                                                  this.renderPreview();
                                              });
                                          }
                                        : null
                                }
                                onLiveChange={(live) => {
                                    this.setState(
                                        { render: { ...this.state.render, live } },
                                        () => {
                                            if (live) this.renderPreview();
                                        }
                                    );
                                }}
                                onRender={() => this.renderPreview()}
                                onTargetChange={(target) => {
                                    this.setState(
                                        { render: { ...this.state.render, target } },
                                        () => {
                                            this.renderPreview();
                                        }
                                    );
                                }}
                            />
                            {this.props.graphOpen ? (
                                <ModuleGraph
                                    document={doc}
                                    selected={this.state.selected}
                                    render={render}
                                    onSelect={(selected) => this.setState({ selected })}
                                />
                            ) : null}
                        </SplitPanel>
                    </SplitPanel>
                </div>
            </RenderContext.Provider>
        );
    }
}
namespace Prechoster {
    export interface Props {
        document: Document;
        initWithoutRender: boolean;
        graphOpen: boolean;
    }
}

function DocumentSettings({ doc }: { doc: Document }) {
    return (
        <div className="prechoster-document-settings">
            <div className="i-doc-title">
                <div
                    className="i-sizer"
                    aria-hidden={true}
                    ref={(node) => {
                        if (node) (node as any).inert = true;
                    }}
                >
                    {doc.title}
                </div>
                <textarea
                    className="i-textarea"
                    placeholder="title"
                    rows={1}
                    maxLength={140}
                    value={doc.title}
                    onChange={(e) => {
                        doc.setTitle(e.target.value.replace(/[\r\n]/g, ' '));
                    }}
                />
            </div>
        </div>
    );
}
