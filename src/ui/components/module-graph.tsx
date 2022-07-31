import { h, createRef, VNode } from 'preact';
import { PureComponent } from 'preact/compat';
import { Document, Module, ModuleId, AnyModule, Data, MOD_OUTPUT, RenderState } from '../../document';
import './module-graph.less';

function toposortDoc(doc: Document, backwards: boolean = false): AnyModule[] {
    const indexedNodes = new Map();
    for (const node of doc.modules) indexedNodes.set(node.id, node);
    const unmarkedNodes = new Set(doc.modules);
    const tmpMarkedNodes = new Set();
    const sorted: AnyModule[] = [];

    const visit = (node: AnyModule) => {
        if (!unmarkedNodes.has(node)) return;
        if (tmpMarkedNodes.has(node)) return;
        tmpMarkedNodes.add(node);
        for (const targetId of node.sends) {
            visit(indexedNodes.get(targetId));
        }
        for (const targetId of node.namedSends.keys()) {
            visit(indexedNodes.get(targetId));
        }
        tmpMarkedNodes.delete(node);
        unmarkedNodes.delete(node);
        sorted.unshift(node);
    };

    while (unmarkedNodes.size) {
        if (backwards) {
            visit([...unmarkedNodes][0]);
        } else {
            visit([...unmarkedNodes].pop()!);
        }
    }

    return backwards ? sorted.reverse() : sorted;
}

const MOD_BASE_WIDTH = 128;
const MOD_HEADER_HEIGHT = 24;
const MOD_INPUT_HEIGHT = 20;
const MOD_OUTPUT_HEIGHT = 20;
const MOD_NAMED_INPUT_HEIGHT = 24;
const COL_GAP = 64;
const ROW_GAP = 24;
const CONN_BEZIER_OFFSET = 32;

type NodeLayout = {
    column: number,
    index: number,
    acceptsInputs: boolean,
    namedInputs: Set<string>,
};
type GraphLayout = {
    columns: AnyModule[][],
    layouts: Map<ModuleId, NodeLayout>,
    indices: Map<ModuleId, number>,
};
function layoutNodes(doc: Document): GraphLayout {
    const columns: AnyModule[][] = [];
    const nodeLayouts = new Map<ModuleId, NodeLayout>();

    const indices = new Map();
    const indexedNodes = new Map();
    const outgoingEdges = new Map();
    for (let i = 0; i < doc.modules.length; i++) {
        const node = doc.modules[i];
        indices.set(node.id, i);
        indexedNodes.set(node.id, node);
        const edges = new Set([...node.sends, ...node.namedSends.keys()]);
        outgoingEdges.set(node, edges);
    }

    nodeLayouts.set(MOD_OUTPUT, {
        column: 0,
        index: 0,
        acceptsInputs: true,
        namedInputs: new Set(),
    });

    for (const node of toposortDoc(doc, true)) {
        let column = 0;
        for (const otherNodeId of outgoingEdges.get(node)) {
            const otherLoc = nodeLayouts.get(otherNodeId)!;
            if (otherLoc) {
                column = Math.max(column, otherLoc.column + 1);
            }
        }

        const { namedInputs } = doc.findModuleInputIds(node.id);

        while (!columns[column]) columns.push([]);
        const index = columns[column].length;
        nodeLayouts.set(node.id, {
            column,
            index,
            acceptsInputs: node.plugin.acceptsInputs,
            namedInputs: new Set(namedInputs.keys()),
        });
        columns[column].push(node);
    }

    for (const col of columns) {
        col.sort((a, b) => indices.get(a.id)! - indices.get(b.id)!);
        for (let i = 0; i < col.length; i++) {
            nodeLayouts.get(col[i].id)!.index = i;
        }
    }

    return {
        columns: columns.reverse(),
        layouts: nodeLayouts,
        indices,
    };
}

export class ModuleGraph extends PureComponent<ModuleGraph.Props> {
    columns = createRef();

    componentDidMount() {
        this.props.document.addEventListener('change', this.onDocumentChange);
    }
    componentDidUpdate(prevProps: ModuleGraph.Props) {
        if (this.props.document !== prevProps.document) {
            prevProps.document.removeEventListener('change', this.onDocumentChange);
            this.props.document.addEventListener('change', this.onDocumentChange);
        }
        if (this.props.selected !== prevProps.selected) {
            if (this.props.selected) {
                const node = this.columns.current!.querySelector(`.i-module-item[data-id="${this.props.selected}"]`);
                if (node && node.scrollIntoView) {
                    node.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                        inline: 'nearest',
                    });
                }
            }
        }
    }
    componentWillUnmount() {
        this.props.document.removeEventListener('change', this.onDocumentChange);
    }

    onDocumentChange = () => {
        this.forceUpdate();
    };

    render({ document, selected, onSelect, render }: ModuleGraph.Props) {
        const layout = layoutNodes(document);

        return (
            <div class="module-graph">
                <Connections
                    document={document}
                    selected={selected}
                    layout={layout} />
                <div class="i-columns" ref={this.columns} style={{
                    gap: COL_GAP,
                }}>
                    {layout.columns.map((column, i) => (
                        <GraphColumn
                            key={i}
                            column={column}
                            layout={layout}
                            selected={selected}
                            onSelect={onSelect}
                            render={render} />
                    ))}
                </div>
            </div>
        );
    }
}
namespace ModuleGraph {
    export interface Props {
        document: Document;
        selected: ModuleId | null;
        render: RenderState;
        onSelect: (m: ModuleId | null) => void;
    }
}

function GraphColumn({ column, layout, selected, onSelect, render }: GraphColumn.Props) {
    const items = [];
    let y = 0;
    for (let i = 0; i < column.length; i++) {
        const module = column[i];
        const nodeLayout = layout.layouts.get(module.id)!;
        const output = render.output ? (render.output.outputs.get(module.id) || null) : null;
        const error = (render.error && render.error.source === module.id) ? render.error.error : null;

        items.push(
            <ModuleItem
                key={i}
                module={module}
                currentOutput={output}
                currentError={error}
                index={layout.indices.get(module.id)!}
                namedInputs={nodeLayout.namedInputs}
                selected={selected === module.id}
                onSelect={() => onSelect(module.id)} />
        );
    }

    return (
        <div class="i-graph-column" style={{ '--row-gap': ROW_GAP }}>
            {items}
        </div>
    );
}
namespace GraphColumn {
    export interface Props {
        column: AnyModule[];
        layout: GraphLayout;
        selected: ModuleId | null;
        onSelect: (m: ModuleId | null) => void;
        render: RenderState;
    }
}

function ModuleItem({ index, module, namedInputs, selected, onSelect, currentOutput, currentError }: ModuleItem.Props) {
    return (
        <div
            class={'i-module-item' + (selected ? ' is-selected' : '') + (currentError ? ' is-error' : '')}
            tabIndex={0}
            role="button"
            data-id={module.id}
            onKeyDown={e => {
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    onSelect();
                }
            }}
            onClick={onSelect}
            style={{
                width: MOD_BASE_WIDTH,
            }}>
            <div class="i-header" style={{ '--height': MOD_HEADER_HEIGHT }}>
                <span class="i-index">{index + 1}</span>
                <span class="i-label">{module.plugin.description(module.data)}</span>
            </div>
            {module.plugin.acceptsInputs ? (
                <div class="i-input" style={{ '--height': MOD_INPUT_HEIGHT }}>
                    input
                </div>
            ) : null}
            <ModuleOutput data={currentOutput} />
            <div class="i-named-inputs">
                {[...namedInputs].map((name, i) => (
                    <div key={i} class="i-named-input" style={{
                        '--height': MOD_NAMED_INPUT_HEIGHT,
                    }}>
                        {name}
                    </div>
                ))}
            </div>
        </div>
    );
}
namespace ModuleItem {
    export interface Props {
        index: number;
        module: AnyModule;
        namedInputs: Set<string>;
        selected?: boolean;
        onSelect: () => void;
        currentOutput: Data | null;
        currentError: unknown | null;
    }
}

function ModuleOutput({ data }: { data: Data | null }) {
    let contents = 'output';
    if (data) {
        contents = data.typeDescription();
    }

    return (
        <div class="i-output" style={{ '--height': MOD_OUTPUT_HEIGHT }}>
            {contents}
        </div>
    );
}

function Connections({ document, selected, layout }: Connections.Props) {
    const getNodeLoc = (nodeId: ModuleId) => {
        const nodeLayout = layout.layouts.get(nodeId);
        if (!nodeLayout) return [0, 0];
        const colIndex = layout.columns.length - 1 - nodeLayout.column;
        const x = (MOD_BASE_WIDTH + COL_GAP) * colIndex;

        let y = 0;
        const column = layout.columns[colIndex];
        for (const item of column) {
            if (item.id === nodeId) break;
            const itemLayout = layout.layouts.get(item.id)!;
            if (!itemLayout) continue;

            y += MOD_HEADER_HEIGHT;
            if (itemLayout.acceptsInputs) y += MOD_INPUT_HEIGHT;
            y += MOD_OUTPUT_HEIGHT;
            for (const _ of itemLayout.namedInputs) y += MOD_NAMED_INPUT_HEIGHT;
            y += ROW_GAP;
        }

        return [x, y];
    };

    const connections: VNode[] = [];
    const pushConn = (startX: number, startY: number, endX: number, endY: number, highlighted: boolean) => {
        connections.push(
            <path
                class={'i-connection' + (highlighted ? ' is-highlighted' : '')}
                key={connections.length}
                d={`M${startX},${startY} C${startX + CONN_BEZIER_OFFSET},${startY} ${endX - CONN_BEZIER_OFFSET},${endY} ${endX},${endY}`} />
        );
    };

    for (const mod of document.modules) {
        const [modX, modY] = getNodeLoc(mod.id);
        const [modOutX, modOutY] = [
            modX + MOD_BASE_WIDTH,
            modY + MOD_HEADER_HEIGHT + (mod.plugin.acceptsInputs ? MOD_INPUT_HEIGHT : 0)
                + MOD_OUTPUT_HEIGHT / 2,
        ];

        for (const target of mod.sends) {
            const [targetX, targetY] = getNodeLoc(target);
            const [targetInX, targetInY] = [
                targetX,
                targetY + MOD_HEADER_HEIGHT + MOD_INPUT_HEIGHT / 2,
            ];

            const highlighted = selected === mod.id || selected === target;
            pushConn(modOutX, modOutY, targetInX, targetInY, highlighted);
        }

        for (const [target, names] of mod.namedSends) {
            const [targetX, targetY] = getNodeLoc(target);
            const targetLayout = layout.layouts.get(target)!;
            const targetInputs = [...targetLayout.namedInputs];

            for (const name of names) {
                const [targetInX, targetInY] = [
                    targetX,
                    targetY + MOD_HEADER_HEIGHT
                        + (targetLayout.acceptsInputs ? MOD_INPUT_HEIGHT : 0)
                        + MOD_OUTPUT_HEIGHT
                        + (targetInputs.indexOf(name) + 0.5) * MOD_NAMED_INPUT_HEIGHT,
                ];

                const highlighted = selected === mod.id || selected === target;
                pushConn(modOutX, modOutY, targetInX, targetInY, highlighted);
            }
        }
    }

    return (
        <svg class="i-connections">
            {connections}
        </svg>
    );
}
namespace Connections {
    export interface Props {
        document: Document;
        selected: ModuleId | null;
        layout: GraphLayout;
    }
}
