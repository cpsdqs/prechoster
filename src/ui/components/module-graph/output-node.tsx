import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Position, Handle } from 'reactflow';
// @ts-ignore
import eggbug from 'string:eggbug.svg';
// @ts-ignore
import eggbugSleep from 'string:eggbug-sleep.svg';
import { AnimationController, Spring } from '../../animation';

export function OutputNode({ data }: { data: any }) {
    const node = useRef<HTMLDivElement>(null);

    const [isPointerDown, setPointerDown] = useState(false);
    const bounceSpring = useMemo(() => new Spring({ stiffness: 158, damping: 18 }), []);
    const [bounceTransform, setBounceTransform] = useState('');

    const setBounceTransformRef = useRef(setBounceTransform);
    setBounceTransformRef.current = setBounceTransform;

    const animCtrl = useMemo(() => new AnimationController(), []);
    useEffect(() => {
        return () => animCtrl.stop();
    }, []);

    const animationTarget = useMemo(() => {
        return {
            update: (dt: number) => {
                const setBounceTransform = setBounceTransformRef.current;

                const isDone = bounceSpring.update(dt);
                const sx = Math.max(0, Math.min(1 + bounceSpring.value, 4));
                const sy = Math.max(0, Math.min(1 - bounceSpring.value, 4));
                setBounceTransform(`scale(${sx}, ${sy})`);

                return isDone;
            },
        };
    }, []);

    const addBounce = (velocity: number) => {
        if (Math.abs(bounceSpring.velocity) > 40) return;
        bounceSpring.velocity += velocity;
        animCtrl.add(animationTarget);
    };

    const lastPointer = useRef([0, 0]);
    const onDown = (e: React.PointerEvent) => {
        e.preventDefault();
        node.current!.setPointerCapture(e.pointerId);
        lastPointer.current = [e.clientX, e.clientY];
        setPointerDown(true);
    };
    const onMove = (e: React.PointerEvent) => {
        if (!isPointerDown) return;
        const dx = e.clientX - lastPointer.current[0];
        const dy = e.clientY - lastPointer.current[0];

        const dist = Math.sqrt(Math.hypot(dx, dy)) * (0.5 + 0.5 * Math.random());
        addBounce(dist * 0.02);

        lastPointer.current = [e.clientX, e.clientY];
    };
    const onUp = (e: React.PointerEvent) => {
        node.current!.releasePointerCapture(e.pointerId);
        setPointerDown(false);
    };

    return (
        <div
            ref={node}
            className={'i-output-node' + (isPointerDown ? ' is-patting' : '')}
            aria-label="Output"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
        >
            <Handle id="in" type="target" position={Position.Left} />
            <div
                className="eggbug-containment-zone"
                style={{ transform: bounceTransform }}
                dangerouslySetInnerHTML={{
                    __html: data.hasOutput && !isPointerDown ? eggbug : eggbugSleep,
                }}
            ></div>
        </div>
    );
}
