import { createElement as h, useEffect, useState } from 'react';
import { Position, Handle, Node, useUpdateNodeInternals } from 'reactflow';
import {
    Document,
    Module,
    ModuleId,
    AnyModule,
    Data,
    MOD_OUTPUT,
    RenderState,
} from '../../../document';
import {
    MOD_BASE_WIDTH,
    MOD_HEADER_HEIGHT,
    MOD_INPUT_HEIGHT,
    MOD_OUTPUT_HEIGHT,
    MOD_NAMED_INPUT_HEIGHT,
} from './consts';
const HEIGHT_PROP = '--height' as any;

export function ModuleNode({ data }: { data: ModuleNode.NodeData }) {
    const { index, module, selected, namedInputs, currentOutput, currentError } = data;
    const updateNodeInternals = useUpdateNodeInternals();

    useEffect(() => {
        // need to inform reactflow that inputs have changed
        updateNodeInternals(module.id);
    }, [namedInputs]);

    return (
        <div
            className={
                'i-module-item' +
                (selected ? ' is-selected' : '') +
                (currentError ? ' is-error' : '')
            }
            data-id={module.id}
            style={{
                width: MOD_BASE_WIDTH,
            }}
        >
            <div className="i-header" style={{ [HEIGHT_PROP]: MOD_HEADER_HEIGHT }}>
                <span className="i-index">{index + 1}</span>
                <span className="i-label">{module.plugin.description(module.data)}</span>
            </div>
            {module.plugin.acceptsInputs ? (
                <div className="i-input" style={{ [HEIGHT_PROP]: MOD_INPUT_HEIGHT }}>
                    <span className="i-label">input</span>
                    <Handle id="in" type="target" position={Position.Left} />
                </div>
            ) : null}
            <ModuleOutput data={currentOutput} />
            <div className="i-named-inputs">
                {[...namedInputs].map((name, i) => (
                    <div
                        key={i}
                        className="i-named-input"
                        style={{
                            [HEIGHT_PROP]: MOD_NAMED_INPUT_HEIGHT,
                        }}
                    >
                        <span className="i-label">{name}</span>
                        <Handle id={`named-in-${name}`} type="target" position={Position.Left} />
                    </div>
                ))}
                {module.plugin.acceptsNamedInputs ? (
                    <div
                        key="new"
                        className="i-named-input"
                        style={{
                            [HEIGHT_PROP]: MOD_NAMED_INPUT_HEIGHT,
                        }}
                    >
                        <span className="i-label">+</span>
                        <Handle id={`named-new`} type="target" position={Position.Left} />
                    </div>
                ) : null}
            </div>
        </div>
    );
}
export namespace ModuleNode {
    export interface NodeData {
        index: number;
        module: AnyModule;
        namedInputs: Set<string>;
        selected?: boolean;
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
        <div className="i-output" style={{ [HEIGHT_PROP]: MOD_OUTPUT_HEIGHT }}>
            <span className="i-label">{contents}</span>
            <Handle id="out" type="source" position={Position.Right} />
        </div>
    );
}
