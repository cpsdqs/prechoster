import { h } from 'preact';
import { lazy, Suspense, PureComponent } from 'preact/compat';
import {
    Document,
    Module,
    ModuleId,
    AnyModule,
    Data,
    MOD_OUTPUT,
    RenderState,
} from '../../../document';
import { Connection, NodeChange, NodePositionChange, EdgeChange } from 'reactflow';
import { layoutNodes } from './auto-layout';
import { MOD_BASE_WIDTH, MIN_COL_GAP, GRID_SIZE } from './consts';
import 'reactflow/dist/style.css';
import './index.less';

export type EdgeId = string;

const ReactFlow = lazy(() => import('./reactflow').then((r) => r.ReactFlow));

export class ModuleGraph extends PureComponent<ModuleGraph.Props> {
    state = {
        draggingNode: false,
    };

    onConnect = ({ source, target, sourceHandle, targetHandle }: Connection) => {
        const { document } = this.props;

        if (!source || !target || !targetHandle) return;
        let sourceModule = document.findModule(source);
        if (!sourceModule) return;

        if (targetHandle === 'in') {
            if (sourceModule.sends.includes(target)) return;
            document.beginChange();
            sourceModule = sourceModule.shallowClone();
            sourceModule.sends = [...sourceModule.sends];
            sourceModule.sends.push(target);
            document.insertModule(sourceModule);
            document.emitChange();
        } else if (targetHandle === 'named-new') {
            const name = prompt('Enter name');
            if (!name) return;

            document.beginChange();
            sourceModule = sourceModule.shallowClone();
            if (!sourceModule.namedSends.has(target)) {
                sourceModule.namedSends = new Map(sourceModule.namedSends);
                sourceModule.namedSends.set(target, new Set());
            }
            sourceModule.namedSends.set(target, new Set(sourceModule.namedSends.get(target)));
            sourceModule.namedSends.get(target)!.add(name);
            document.insertModule(sourceModule);
            document.emitChange();
        } else if (targetHandle.startsWith('named-in-')) {
            // duplicate named inputs make no sense
            return;
        }
    };

    onNodesChange = (changes: NodeChange[]) => {
        let newSelected = this.props.selected;
        const nodePositionChanges: NodePositionChange[] = [];

        for (const change of changes) {
            if (change.type === 'select') {
                if (change.selected && change.id !== MOD_OUTPUT) {
                    newSelected = change.id;
                } else if (!change.selected && newSelected === change.id) {
                    newSelected = null;
                }
            } else if (change.type === 'position') {
                nodePositionChanges.push(change);
            }
        }

        if (newSelected !== this.props.selected) this.props.onSelect(newSelected);

        if (nodePositionChanges) {
            const { document } = this.props;

            for (const change of nodePositionChanges) {
                const module = document.findModule(change.id);
                if (!module || !change.position) continue;
                module.graphPos = change.position;
            }

            document.emitChange();
        }
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
                const edge = edges.find((item) => item.id === edgeId);
                if (!edge) continue;

                let module = document.findModule(edge.source);
                if (!module) continue;
                module = module.shallowClone();
                document.insertModule(module);

                if (edge.targetHandle === 'in') {
                    module.sends = [...module.sends];
                    const targetIndex = module.sends.indexOf(edge.target);
                    if (targetIndex > -1) module.sends.splice(targetIndex, 1);
                } else if (edge.targetHandle.startsWith('named-in-')) {
                    const { name } = edge.data;
                    if (!module.namedSends.has(edge.target)) continue;
                    module.namedSends.set(edge.target, new Set(module.namedSends.get(edge.target)));
                    module.namedSends.get(edge.target)!.delete(name);

                    if (!module.namedSends.get(edge.target)!.size) {
                        module.namedSends = new Map(module.namedSends);
                        module.namedSends.delete(edge.target);
                    }
                }
            }

            document.emitChange();
        }
    };

    runAutoLayout = () => {
        const { document } = this.props;

        const hasManualLayout = document.modules.find((m) => !!m.graphPos);
        if (!hasManualLayout) return;

        document.beginChange();

        document.setModules(
            document.modules.map((m) => {
                m = m.shallowClone();
                m.graphPos = null;
                return m;
            })
        );

        document.emitChange();
    };

    render({ document, selected, render }: ModuleGraph.Props) {
        const layout = layoutNodes(document);
        const nodes: any[] = [];

        const colStride = Math.ceil((MOD_BASE_WIDTH + MIN_COL_GAP) / GRID_SIZE) * GRID_SIZE;
        const maxLayoutX = (layout.columns.length - 1) * colStride;

        for (const module of document.modules) {
            const nodeLayout = layout.layouts.get(module.id)!;
            const output = render?.output ? render.output.outputs.get(module.id) || null : null;
            const error =
                render?.error && render.error.source === module.id ? render.error.error : null;
            const selected = module.id === this.props.selected;

            const autoLayoutPos = {
                x: nodeLayout.column * colStride - maxLayoutX,
                y: nodeLayout.y,
            };
            if (module.graphPos?.x === autoLayoutPos.x && module.graphPos?.y === autoLayoutPos.y) {
                module.graphPos = null;
            }

            nodes.push({
                id: module.id,
                position: module.graphPos || autoLayoutPos,
                type: 'module',
                selected,
                data: {
                    index: layout.indices.get(module.id)!,
                    module,
                    namedInputs: nodeLayout.namedInputs,
                    selected,
                    currentOutput: output,
                    currentError: error,
                },
            });
        }

        nodes.push({
            id: MOD_OUTPUT,
            position: { x: 0, y: 0 },
            type: 'modOutput',
            data: {
                hasOutput: !!render.output?.markdownOutput,
            },
        });

        const edges = getConnections(document, selected);

        return (
            <div class={'module-graph' + (this.state.draggingNode ? ' is-dragging-node' : '')}>
                <Suspense fallback={<div>Loading…</div>}>
                    <ReactFlow
                        fitView
                        snapToGrid
                        snapGrid={[GRID_SIZE, GRID_SIZE]}
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={this.onNodesChange}
                        onEdgesChange={this.onEdgesChange}
                        onConnect={this.onConnect}
                        onNodeDragStart={() => this.setState({ draggingNode: true })}
                        onNodeDragStop={() => this.setState({ draggingNode: false })}
                    />
                </Suspense>
                <div class="i-actions">
                    <button onClick={this.runAutoLayout}>auto layout</button>
                </div>
            </div>
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
