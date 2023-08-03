import { createRef, useLayoutEffect, useMemo } from 'react';
import EventEmitter from 'events';

export function getNow(): number {
    return (document.timeline?.currentTime || Date.now()) / 1000;
}

export function shouldReduceMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Calculates spring position and velocity for any given condition.
 *
 * equations copied from
 * http://people.physics.tamu.edu/agnolet/Teaching/Phys_221/MathematicaWebPages/4_DampedHarmonicOscillator.pdf
 */
export class SpringSolver {
    target: number | null = 0;
    dampingRatio: number;
    friction: number;

    initialValueOffset = 0;
    initialVelocity = 0;
    undampedAngularFrequency = 0;
    angularOffset = 0;
    dampedAngularFrequency = 0;
    amplitudeFactor = 0;
    dampedFriction = 0;
    a1 = 0;
    a2 = 0;

    constructor(dampingRatio: number, period: number) {
        this.dampingRatio = dampingRatio;
        this.friction = dampingRatio * ((4 * Math.PI) / period);
        this.hydrateParams(0, 0);
    }

    hydrateParams(initialValue: number, initialVelocity: number) {
        if (this.target === null) {
            // uncontrolled “spring”
            this.initialValueOffset =
                initialValue + (this.friction === 0 ? 0 : initialVelocity / this.friction);
            this.initialVelocity = initialVelocity;
            return;
        }

        initialValue -= this.target;

        this.undampedAngularFrequency =
            this.dampingRatio === 0 ? 0 : this.friction / this.dampingRatio / 2;
        this.dampedAngularFrequency =
            this.undampedAngularFrequency * Math.sqrt(1 - this.dampingRatio ** 2);
        this.angularOffset = Math.atan2(
            2 * initialVelocity + this.friction * initialValue,
            2 * initialValue * this.dampedAngularFrequency
        );
        this.amplitudeFactor =
            Math.abs(initialValue) < 1e-5
                ? (Math.sign(initialVelocity) * initialVelocity) / this.dampedAngularFrequency
                : initialValue / Math.cos(this.angularOffset);
        this.dampedFriction = Math.max(
            // approximate zero because lim is too expensive to compute
            1e-5,
            Math.sqrt((this.friction / 2) ** 2 - this.undampedAngularFrequency ** 2) * 2
        );
        this.a1 =
            (-2 * initialVelocity + initialValue * (-this.friction + this.dampedFriction)) /
            (2 * this.dampedFriction);
        this.a2 =
            (2 * initialVelocity + initialValue * (this.friction + this.dampedFriction)) /
            (2 * this.dampedFriction);
    }

    retarget(t: number, newTarget: number) {
        const value = this.getValue(t);
        const velocity = this.getVelocity(t);
        this.target = newTarget;
        this.hydrateParams(value, velocity);
    }

    resetVelocity(t: number, newVelocity: number) {
        const value = this.getValue(t);
        this.hydrateParams(value, newVelocity);
    }

    resetDampingRatio(t: number, newDampingRatio: number) {
        const value = this.getValue(t);
        const velocity = this.getVelocity(t);
        this.dampingRatio = newDampingRatio;
        this.hydrateParams(value, velocity);
    }

    resetFriction(t: number, newFriction: number) {
        const value = this.getValue(t);
        const velocity = this.getVelocity(t);
        this.friction = newFriction;
        this.hydrateParams(value, velocity);
    }

    resetPeriod(t: number, newPeriod: number) {
        this.resetFriction(t, this.dampingRatio * ((4 * Math.PI) / newPeriod));
    }

    resetValue(t: number, newValue: number) {
        const velocity = this.getVelocity(t);
        this.hydrateParams(newValue, velocity);
    }

    getValue(t: number): number {
        if (this.target === null) {
            if (this.friction === 0) return this.initialValueOffset + t * this.initialVelocity;

            // no target means the only active part of the equation is v' = -cv
            // => solution: v = k * e^(-cx); integral: x = -k * e^(-cx) / c + C
            return (
                this.initialValueOffset -
                (this.initialVelocity * Math.exp(-t * this.friction)) / this.friction
            );
        }

        let value;
        if (this.dampingRatio < 1) {
            // underdamped
            value =
                this.amplitudeFactor *
                Math.exp((-t * this.friction) / 2) *
                Math.cos(this.dampedAngularFrequency * t - this.angularOffset);
        } else {
            // critically damped or overdamped
            value =
                this.a1 * Math.exp((t * (-this.friction - this.dampedFriction)) / 2) +
                this.a2 * Math.exp((t * (-this.friction + this.dampedFriction)) / 2);
        }
        return value + this.target;
    }

    getVelocity(t: number): number {
        if (this.target === null) {
            return this.initialVelocity * Math.exp(-t * this.friction);
        }

        if (this.dampingRatio < 1) {
            // underdamped
            return (
                this.amplitudeFactor *
                ((-this.friction / 2) *
                    Math.exp((-t * this.friction) / 2) *
                    Math.cos(this.dampedAngularFrequency * t - this.angularOffset) -
                    this.dampedAngularFrequency *
                        Math.exp((-t * this.friction) / 2) *
                        Math.sin(this.dampedAngularFrequency * t - this.angularOffset))
            );
        } else {
            // critically damped or overdamped
            return (
                ((this.a1 * (-this.friction - this.dampedFriction)) / 2) *
                    Math.exp((t * (-this.friction - this.dampedFriction)) / 2) +
                ((this.a2 * (-this.friction + this.dampedFriction)) / 2) *
                    Math.exp((t * (-this.friction + this.dampedFriction)) / 2)
            );
        }
    }
}

interface SpringInit {
    dampingRatio?: number;
    period?: number;
    value?: number;
    target?: number;
    motionThreshold?: number;
}

export class Spring {
    motionThreshold = 1 / 1000;
    lastReset = getNow();

    dampingRatio: number;
    period: number;
    inner: SpringSolver;

    constructor(initial: SpringInit = {}) {
        this.dampingRatio = initial.dampingRatio ?? 1;
        this.period = initial.period ?? 0.3;

        this.inner = new SpringSolver(this.dampingRatio, this.period);
        if (Number.isFinite(initial.value)) {
            this.inner.resetValue(0, initial.value!);
        }
        if (Number.isFinite(initial.target)) {
            this.inner.retarget(0, initial.target!);
        } else if (Number.isFinite(initial.value)) {
            this.inner.retarget(0, initial.value!);
        }
        if (Number.isFinite(initial.motionThreshold)) {
            this.motionThreshold = initial.motionThreshold!;
        }
    }

    getInnerT(time: number): number {
        return Math.max(0, time - this.lastReset);
    }

    setDampingRatio(dr: number, time = getNow()) {
        if (this.dampingRatio === dr) return;
        this.dampingRatio = dr;
        this.inner.resetDampingRatio(this.getInnerT(time), dr);
        this.lastReset = time;
    }

    setPeriod(period: number, time = getNow()) {
        if (this.period === period) return;
        this.period = period;
        this.inner.resetPeriod(this.getInnerT(time), period);
        this.lastReset = time;
    }

    setTarget(target: number, time = getNow()) {
        if (this.inner.target === target) return;
        this.inner.retarget(this.getInnerT(time), target);
        this.lastReset = time;
    }

    setValue(value: number, time = getNow()) {
        this.inner.resetValue(this.getInnerT(time), value);
        this.lastReset = time;
    }
    forceReset(time = getNow()) {
        this.inner.retarget(this.getInnerT(time), this.target);
        this.lastReset = time;
    }

    get target(): number {
        return this.inner.target!;
    }

    getValue(time = getNow()): number {
        const t = this.getInnerT(time);
        const value = this.inner.getValue(t);
        const velocity = this.inner.getVelocity(t);
        if (Math.abs(this.target - value) + Math.abs(velocity) < this.motionThreshold) {
            return this.target;
        }
        return value;
    }
    getVelocity(time = getNow()): number {
        return this.inner.getVelocity(this.getInnerT(time));
    }
    shouldStop(time = getNow()): boolean {
        return (
            Math.abs(this.target - this.getValue(time)) + Math.abs(this.getVelocity(time)) <
            this.motionThreshold
        );
    }
}

export namespace ElAnim {
    export interface Options {
        useAnimationFillForwards?: boolean;
    }
}

export class ElAnim extends EventEmitter {
    node = createRef<Element>();
    dropped = false;

    /** Number of seconds to generate keyframes for in advance */
    keyframeGenerationInterval = 1;
    /** Time-step between each keyframe */
    keyframeTimeStep = 1 / 60;

    useAnimationFillForwards = true;

    computeStyles: (i: any, t: number) => any;

    constructor(
        computeStyles: (i: any, t: number) => any,
        nodeRef: any,
        options: ElAnim.Options = {}
    ) {
        super();
        this.computeStyles = computeStyles;
        if (nodeRef) this.node = nodeRef;
        if (typeof options.useAnimationFillForwards === 'boolean') {
            this.useAnimationFillForwards = options.useAnimationFillForwards;
        }
    }

    #currentInputs = new Map<any, number>();
    #lastInputsObject = null;
    #needsUpdate = false;
    /**
     * Sets inputs. `inputs` can be any sort of associative object or array.
     * Its shape will be passed on to computeStyles.
     */
    setInputs(inputs: any) {
        let needsResolve = this.#needsUpdate;
        this.#needsUpdate = false;

        // determine whether we need to resolve the animation again.
        // we keep track of changes using the lastReset property
        const newInputs = new Set();
        for (const k in inputs) {
            if (!inputs.hasOwnProperty(k)) continue;
            const item = inputs[k];
            newInputs.add(item);
            if (this.#currentInputs.has(item)) {
                const currentReset = this.#currentInputs.get(item);
                if (item.lastReset !== currentReset) {
                    needsResolve = true;
                }
            } else {
                this.#currentInputs.set(item, item.lastReset);
                needsResolve = true;
            }
        }
        for (const item of this.#currentInputs) {
            if (!newInputs.has(item)) {
                // removed. we don't really need a resolve for this though
                this.#currentInputs.delete(item);
            }
        }

        this.#lastInputsObject = inputs;
        if (needsResolve) this.resolve();
    }

    setNeedsUpdate() {
        this.#needsUpdate = true;
    }

    didMount() {
        // so that any update will trigger a resolve
        this.setNeedsUpdate();
        // resolve now also
        this.resolve();
    }

    doComputeStyles(time: number): any {
        const inputs = Array.isArray(this.#lastInputsObject)
            ? [...this.#lastInputsObject]
            : // @ts-ignore
              { ...this.#lastInputsObject };

        for (const k in inputs) {
            if (!inputs.hasOwnProperty(k)) continue;
            inputs[k] = inputs[k].getValue(time);
        }

        return this.computeStyles(inputs, time);
    }

    getCurrentStyles() {
        return this.doComputeStyles(getNow());
    }

    animations: Animation[] = [];
    resolve() {
        if (this.dropped) return;
        const nodes = (
            Array.isArray(this.node) ? this.node.map((item) => item.current) : [this.node.current]
        ).filter((x) => x);
        if (!nodes.length) return;
        let scheduleRefresh = true;

        const now = getNow();
        const keyframes: any[] = [];
        let dt = 0;
        for (; dt < this.keyframeGenerationInterval; dt += this.keyframeTimeStep) {
            const t = now + dt;

            const styles = this.doComputeStyles(t);
            if (Array.isArray(styles)) {
                keyframes.push(styles);
            } else {
                keyframes.push([styles]);
            }

            let shouldStop = true;
            for (const input of this.#currentInputs.keys()) {
                if (!input.shouldStop(t)) {
                    shouldStop = false;
                    break;
                }
            }

            if (shouldStop) {
                scheduleRefresh = false;
                break;
            }
        }

        for (const anim of this.animations) anim.cancel();
        this.animations = nodes.map((node, i) =>
            node.animate(
                keyframes.map((x) => x[i]),
                {
                    duration: dt * 1000,
                    easing: 'linear',
                    fill: this.useAnimationFillForwards ? 'forwards' : 'none',
                }
            )
        );
        this.emit('resolve', this.animations);

        if (scheduleRefresh) {
            this.animations[0].addEventListener('finish', () => {
                if (this.dropped) return;
                this.resolve();
            });
        } else {
            this.animations[0].addEventListener('finish', () => {
                if (this.dropped) return;
                if (!this.useAnimationFillForwards) {
                    for (const anim of this.animations) anim.cancel();
                    this.animations = [];
                }
                this.emit('finish');
            });
        }
    }

    cancel() {
        for (const anim of this.animations) anim.cancel();
    }

    /** call this inside componentWillUnmount to clean up timers */
    drop() {
        this.cancel();
        this.dropped = true;
    }
}

export function useSpring(initial: SpringInit): Spring {
    return useMemo(() => new Spring(initial), []);
}

export interface AnimationValue {
    shouldStop(t: number): boolean;
    getValue(t: number): number;
}

type AnimRef = { current: Element | null };
type AnimRefs = AnimRef | AnimRef[];
type AnimInput = AnimationValue | AnimationValue[] | { [k: string]: AnimationValue };
type StylesFn = (input: any, time: number) => any; // FIXME: needs types

/** NOTE: inputs, styles, and options are read only once on the first call */
export function useAnimation(
    refs: AnimRefs,
    inputs: AnimInput,
    styles: StylesFn,
    options?: ElAnim.Options
) {
    const anim = useMemo(() => new ElAnim(styles, refs, options), []);
    anim.setInputs(inputs);

    useLayoutEffect(() => {
        anim.didMount();

        return () => {
            anim.drop();
        };
    }, []);

    return anim;
}
