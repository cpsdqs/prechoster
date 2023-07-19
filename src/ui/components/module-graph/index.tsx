import { createRef, lazy, Suspense, PureComponent } from 'react';
import { Document, Module, ModuleId, MOD_OUTPUT, RenderState } from '../../../document';
import {
    Connection,
    NodeChange,
    NodePositionChange,
    NodeRemoveChange,
    EdgeChange,
    OnConnectStartParams,
    ReactFlowInstance,
} from 'reactflow';
import { layoutNodes } from './auto-layout';
import { MOD_BASE_WIDTH, MIN_COL_GAP, GRID_SIZE } from './consts';
import { ModulePicker } from '../module-picker';
import 'reactflow/dist/style.css';
import './index.less';

export type EdgeId = string;

const ReactFlow = lazy(() => import('./reactflow'));

export class ModuleGraph extends PureComponent<ModuleGraph.Props> {
    state = {
        draggingNode: false,
        addingModule: false,
        modulePickerAnchor: null,
    };

    containerNode = createRef<HTMLDivElement>();
    addModuleButton = createRef<HTMLButtonElement>();
    reactFlow: ReactFlowInstance | null = null;

    onReactFlowInit = (instance: ReactFlowInstance) => {
        this.reactFlow = instance;
    };

    onConnect = ({ source, target, sourceHandle, targetHandle }: Connection) => {
        const { document } = this.props;

        if (!source || !target || !targetHandle) return;

        if (targetHandle === 'in') {
            this.insertConnection(source, target);
        } else if (targetHandle === 'named-new') {
            this.insertNewNamedConnection(source, target);
        } else if (targetHandle.startsWith('named-in-')) {
            // duplicate named inputs make no sense
            return;
        }
    };

    insertConnection(source: ModuleId, target: ModuleId, skipChange = false) {
        const { document } = this.props;

        let sourceModule = document.findModule(source);
        const targetModule = document.findModule(target);
        if (!sourceModule || (target !== 'output' && !targetModule)) return;
        if (sourceModule.sends.includes(target)) return;
        if (target !== 'output' && !targetModule?.plugin?.acceptsInputs) return;

        if (!skipChange) document.beginChange();

        sourceModule = sourceModule.shallowClone();
        sourceModule.sends = [...sourceModule.sends];
        sourceModule.sends.push(target);
        document.insertModule(sourceModule);

        if (!skipChange) document.emitChange();
    }

    insertNewNamedConnection(source: ModuleId, target: ModuleId, skipChange = false) {
        const { document } = this.props;
        let sourceModule = document.findModule(source);
        const targetModule = document.findModule(target);
        if (!sourceModule || !targetModule) return;
        if (!targetModule.plugin.acceptsNamedInputs) return;

        const name = prompt('Enter side input name');
        if (!name) return;

        if (!skipChange) document.beginChange();

        sourceModule = sourceModule.shallowClone();
        if (!sourceModule.namedSends.has(target)) {
            sourceModule.namedSends = new Map(sourceModule.namedSends);
            sourceModule.namedSends.set(target, new Set());
        }
        sourceModule.namedSends.set(target, new Set(sourceModule.namedSends.get(target)));
        sourceModule.namedSends.get(target)!.add(name);
        document.insertModule(sourceModule);

        if (!skipChange) document.emitChange();
    }

    currentConnectionParams: OnConnectStartParams | null = null;
    graphPosForNextAdd: [number, number] | null = null;
    connectionForNextAdd: [string, ModuleId] | null = null;

    onConnectStart = (e: unknown, params: OnConnectStartParams) => {
        this.currentConnectionParams = params;
    };

    onConnectEnd = (e: any) => {
        const isPaneDrop = e.target.classList?.contains('react-flow__pane');
        if (!isPaneDrop) return;

        const params = this.currentConnectionParams;
        if (!params?.nodeId) return;
        if (params.handleId === 'out') {
            this.connectionForNextAdd = ['out', params.nodeId];
        } else if (params.handleId === 'in') {
            this.connectionForNextAdd = ['in', params.nodeId];
        } else if (params.handleId === 'named-new') {
            this.connectionForNextAdd = ['named', params.nodeId];
        } else {
            // invalid: cannot create a new connection
            return;
        }

        const { top, left } = this.containerNode.current!.getBoundingClientRect();
        const projected = this.reactFlow!.project({
            x: e.clientX - left,
            y: e.clientY - top,
        });

        const nodeX = Math.floor((projected.x - MOD_BASE_WIDTH / 2) / GRID_SIZE) * GRID_SIZE;
        const nodeY = Math.floor(projected.y / GRID_SIZE) * GRID_SIZE;
        this.graphPosForNextAdd = [nodeX, nodeY];
        this.setState({
            addingModule: true,
            modulePickerAnchor: [e.clientX, e.clientY],
        });
    };

    getNewCenteredNodePos = () => {
        const { width, height } = this.containerNode.current!.getBoundingClientRect();
        const projected = this.reactFlow!.project({
            x: width / 2,
            y: height / 2,
        });
        const nodeX = Math.floor((projected.x - MOD_BASE_WIDTH / 2) / GRID_SIZE) * GRID_SIZE;
        const nodeY = Math.floor(projected.y / GRID_SIZE) * GRID_SIZE;
        return [nodeX, nodeY] as [number, number];
    };

    onAddModule = (plugin: any) => {
        const { document } = this.props;

        this.setState({ addingModule: false });
        document.beginChange();

        const module = new Module(plugin);
        if (this.graphPosForNextAdd) {
            module.graphPos = {
                x: this.graphPosForNextAdd[0],
                y: this.graphPosForNextAdd[1],
            };
            this.graphPosForNextAdd = null;
        }
        document.setModules(document.modules.concat([module]));

        if (this.connectionForNextAdd) {
            const [type, otherModuleId] = this.connectionForNextAdd;
            this.connectionForNextAdd = null;

            if (type === 'out') {
                this.insertConnection(otherModuleId, module.id, true);
            } else if (type === 'in') {
                this.insertConnection(module.id, otherModuleId, true);
            } else if (type === 'named') {
                this.insertNewNamedConnection(module.id, otherModuleId, true);
            }
        }

        document.emitChange();
        this.props.onSelect(module.id);
    };

    onNodesChange = (changes: NodeChange[]) => {
        let newSelected = this.props.selected;
        const nodePositionChanges: NodePositionChange[] = [];
        const nodeRemoveChanges: NodeRemoveChange[] = [];

        for (const change of changes) {
            if (change.type === 'select') {
                if (change.selected && change.id !== MOD_OUTPUT) {
                    newSelected = change.id;
                } else if (!change.selected && newSelected === change.id) {
                    newSelected = null;
                }
            } else if (change.type === 'position') {
                nodePositionChanges.push(change);
            } else if (change.type === 'remove') {
                nodeRemoveChanges.push(change);
            }
        }

        if (newSelected !== this.props.selected) this.props.onSelect(newSelected);

        if (nodePositionChanges.length || nodeRemoveChanges.length) {
            const { document } = this.props;

            if (nodeRemoveChanges.length) document.beginChange();

            for (const change of nodePositionChanges) {
                const module = document.findModule(change.id);
                if (!module || !change.position) continue;
                module.graphPos = change.position;
            }

            for (const change of nodeRemoveChanges) {
                document.removeModule(change.id);
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

    render() {
        const { document, selected, render } = this.props;
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
            <div
                className={'module-graph' + (this.state.draggingNode ? ' is-dragging-node' : '')}
                aria-label="Module Graph"
                ref={this.containerNode}
            >
                <Suspense fallback={<div>Loading…</div>}>
                    <ReactFlow
                        fitView
                        snapToGrid
                        snapGrid={[GRID_SIZE, GRID_SIZE]}
                        panOnScroll
                        panOnScrollSpeed={1}
                        nodes={nodes}
                        edges={edges}
                        onInit={this.onReactFlowInit}
                        onNodesChange={this.onNodesChange}
                        onEdgesChange={this.onEdgesChange}
                        onConnect={this.onConnect}
                        onConnectStart={this.onConnectStart}
                        onConnectEnd={this.onConnectEnd}
                        onNodeDragStart={() => this.setState({ draggingNode: true })}
                        onNodeDragStop={() => this.setState({ draggingNode: false })}
                    />
                </Suspense>
                <div className="i-actions">
                    <button onClick={this.runAutoLayout}>auto layout</button>{' '}
                    <button
                        ref={this.addModuleButton}
                        onClick={() => {
                            this.graphPosForNextAdd = this.getNewCenteredNodePos();
                            this.setState({ addingModule: true, modulePickerAnchor: null });
                        }}
                    >
                        add node
                    </button>
                    <ModulePicker
                        anchor={this.state.modulePickerAnchor || this.addModuleButton.current}
                        open={this.state.addingModule}
                        onClose={() => this.setState({ addingModule: false })}
                        onPick={this.onAddModule}
                    />
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

    const modDescriptions = new Map<ModuleId, string>();
    modDescriptions.set(MOD_OUTPUT, 'output');

    let modIndex = 1;
    for (const mod of document.modules) {
        modDescriptions.set(mod.id, modIndex + ' ' + mod.plugin.description(mod.data));
        modIndex++;
    }

    for (const mod of document.modules) {
        const ownDesc = modDescriptions.get(mod.id);

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
                ariaLabel:
                    `Send ${ownDesc} to ${modDescriptions.get(target)} input` +
                    (selected === edgeId ? ', selected' : ''),
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
                    ariaLabel:
                        `Provide ${ownDesc} to ${modDescriptions.get(
                            target
                        )} named input “${name}”` + (selected === edgeId ? ', selected' : ''),
                });
            }
        }
    }

    return connections;
}
