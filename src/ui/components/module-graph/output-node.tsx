import { createElement as h } from 'react';
import { Position, Handle, Node } from 'reactflow';
// @ts-ignore
import eggbug from 'string:eggbug.svg';
// @ts-ignore
import eggbugSleep from 'string:eggbug-sleep.svg';

export function OutputNode({ data }: { data: any }) {
    return (
        <div className="i-output-node" aria-label="Output">
            <Handle id="in" type="target" position={Position.Left} />
            <div
                className="eggbug-containment-zone"
                dangerouslySetInnerHTML={{
                    __html: data.hasOutput ? eggbug : eggbugSleep,
                }}
            ></div>
        </div>
    );
}
