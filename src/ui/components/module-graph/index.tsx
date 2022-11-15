import { h } from 'preact';
import { lazy, Suspense, PureComponent } from 'preact/compat';
import { Document, Module, ModuleId, AnyModule, Data, MOD_OUTPUT, RenderState } from '../../../document';
import { Connection, NodeChange, EdgeChange } from 'reactflow';
import { layoutNodes } from './auto-layout';
import { MOD_BASE_WIDTH, COL_GAP } from './consts';
import 'reactflow/dist/style.css';
import './index.less';

export type EdgeId = string;

const ReactFlow = lazy(() => import('./reactflow').then(r => r.ReactFlow));

export class ModuleGraph extends PureComponent<ModuleGraph.Props> {
    onConnect = ({ source, target, sourceHandle, targetHandle }: Connection) => {
        const { document } = this.props;

        if (!source || !target || !targetHandle) return;
        const sourceModule = document.findModule(source);
        if (!sourceModule) return;

        if (targetHandle === 'in') {
            if (sourceModule.sends.includes(target)) return;
            document.beginChange();
            sourceModule.sends.push(target);
            document.emitChange();
        } else if (targetHandle === 'named-new') {
            const name = prompt('Enter name');
            if (!name) return;

            document.beginChange();
            if (!sourceModule.namedSends.has(target)) {
                sourceModule.namedSends.set(target, new Set());
            }
            sourceModule.namedSends.get(target)!.add(name);
            document.emitChange();
        } else if (targetHandle.startsWith('named-in-')) {
            // duplicate named inputs make no sense
            return;
        }
    };

    onNodesChange = (changes: NodeChange[]) => {
        let newSelected = this.props.selected;

        for (const change of changes) {
            if (change.type === 'select') {
                if (change.selected && change.id !== MOD_OUTPUT) {
                    newSelected = change.id;
                } else if (!change.selected && newSelected === change.id) {
                    newSelected = null;
                }
            }
        }

        if (newSelected !== this.props.selected) this.props.onSelect(newSelected);
    };

    onEdgesChange = (changes: EdgeChange[]) => {
        let newSelected = this.props.selected;
        const edgesToRemove: EdgeId[] = [];

        for (const change of changes) {
            if (change.type === 'select') {
                if (change.selected) {
                    newSelected = change.id;
                } else if (!change.selected && newSelected === change.id) {
                    newSelected = null;
                }
            } else if (change.type === 'remove') {
                edgesToRemove.push(change.id);
            }
        }

        if (newSelected !== this.props.selected) this.props.onSelect(newSelected);

        const { document } = this.props;
        if (edgesToRemove.length) {
            const edges = getConnections(document, null);

            document.beginChange();

            for (const edgeId of edgesToRemove) {
                const edge = edges.find(item => item.id === edgeId);
                if (!edge) continue;

                const module = document.findModule(edge.source);
                if (!module) continue;

                if (edge.targetHandle === 'in') {
                    const targetIndex = module.sends.indexOf(edge.target);
                    if (targetIndex > -1) module.sends.splice(targetIndex, 1);
                } else if (edge.targetHandle.startsWith('named-in-')) {
                    const { name } = edge.data;
                    if (!module.namedSends.has(edge.target)) continue;
                    module.namedSends.get(edge.target)!.delete(name);

                    if (!module.namedSends.get(edge.target)!.size) {
                        module.namedSends.delete(edge.target);
                    }
                }
            }

            document.emitChange();
        }
    };

    render({ document, selected, render }: ModuleGraph.Props) {
        const layout = layoutNodes(document);
        const nodes: any[] = [];
        for (let col = 0; col < layout.columns.length; col++) {
            const column = layout.columns[col];
            for (let i = 0; i < column.length; i++) {
                const mod = column[i];
                if (!mod) continue;

                const nodeLayout = layout.layouts.get(mod.id)!;
                const output = render?.output ? (render.output.outputs.get(mod.id) || null) : null;
                const error = (render?.error && render.error.source === mod.id) ? render.error.error : null;
                const selected = mod.id === this.props.selected;

                nodes.push({
                    id: mod.id,
                    position: {
                        x: col * (MOD_BASE_WIDTH + COL_GAP),
                        y: nodeLayout.y,
                    },
                    type: 'module',
                    selected,
                    data: {
                        index: layout.indices.get(mod.id)!,
                        module: mod,
                        namedInputs: nodeLayout.namedInputs,
                        selected,
                        currentOutput: output,
                        currentError: error,
                    },
                });
            }
        }

        nodes.push({
            id: MOD_OUTPUT,
            position: {
                x: (layout.columns.length - 1) * 200,
                y: 0,
            },
            type: 'modOutput',
            data: {
                hasOutput: !!render.output?.markdownOutput,
            },
        });

        const edges = getConnections(document, selected);

        return (
            <Suspense fallback={<div>Loading…</div>}>
                <ReactFlow
                    className="module-graph"
                    fitView
                    snapToGrid
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={this.onNodesChange}
                    onEdgesChange={this.onEdgesChange}
                    onConnect={this.onConnect} />
            </Suspense>
        );
    }
}
namespace ModuleGraph {
    export interface Props {
        document: Document;
        selected: ModuleId | EdgeId | null;
        render: RenderState;
        onSelect: (m: ModuleId | EdgeId | null) => void;
    }
}

function getConnections(document: Document, selected: ModuleId | EdgeId | null) {
    const connections: any[] = [];

    for (const mod of document.modules) {
        for (const target of mod.sends) {
            const highlighted = selected === mod.id || selected === target;
            const edgeId = `${mod.id}->${target}`;
            connections.push({
                id: edgeId,
                source: mod.id,
                target,
                sourceHandle: 'out',
                targetHandle: 'in',
                className: 'i-connection' + (highlighted ? ' is-highlighted' : ''),
                selected: selected === edgeId,
            });
        }

        for (const [target, names] of mod.namedSends) {
            for (const name of names) {
                const highlighted = selected === mod.id || selected === target;
                const edgeId = `${mod.id}-(${name})>${target}`;
                connections.push({
                    id: edgeId,
                    source: mod.id,
                    target,
                    sourceHandle: 'out',
                    targetHandle: `named-in-${name}`,
                    className: 'i-connection' + (highlighted ? ' is-highlighted' : ''),
                    selected: selected === edgeId,
                    data: { name },
                });
            }
        }
    }

    return connections;
}
