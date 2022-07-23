export interface AnimationTarget {
    update(dt: number): boolean | void;
}

export class AnimationController {
    targets = new Set<AnimationTarget>();
    running = false;
    animationId = 0;
    lastTime = 0;

    start() {
        this.running = true;
        const now = document.timeline.currentTime;
        if (!now) {
            setTimeout(() => this.start(), 1000); // try again later
            return;
        }
        this.lastTime = now;
        requestAnimationFrame(() => this.loop(++this.animationId));
    }

    loop(animationId: number) {
        if (animationId !== this.animationId) return;

        const now = document.timeline.currentTime;
        if (!now) {
            setTimeout(() => this.loop(animationId), 1000); // try again later
            return;
        }
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        const targetsToRemove = [];
        for (const target of this.targets) {
            const done = target.update(dt);
            if (done) targetsToRemove.push(target);
        }
        for (const target of targetsToRemove) this.remove(target);

        requestAnimationFrame(() => this.loop(animationId));
    };

    stop() {
        this.animationId++;
        this.running = false;
    }

    add(target: AnimationTarget) {
        this.targets.add(target);
        if (!this.running) this.start();
    }

    remove(target: AnimationTarget) {
        this.targets.delete(target);
        if (!this.targets.size) this.stop();
    }
}

export class Spring {
    static FIXED_DT = 1 / 120;

    value: number;
    velocity: number;
    target: number;
    stiffness: number;
    damping: number;
    motionThreshold = 0.01;
    timeLeft = 0;

    constructor(init?: { value?: number, velocity?: number, target?: number, stiffness?: number, damping?: number }) {
        this.value = init?.value || 0;
        this.velocity = init?.velocity || 0;
        this.target = Number.isFinite(init?.target) ? init!.target! : this.value;
        this.stiffness = init?.stiffness || 300;
        this.damping = init?.damping || 20;
    }

    update(dt: number) {
        this.timeLeft += Math.max(0, Math.min(1, dt));

        while (this.timeLeft > Spring.FIXED_DT) {
            this.timeLeft -= Spring.FIXED_DT;
            const force = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
            this.velocity += force * Spring.FIXED_DT;
            this.value += this.velocity * Spring.FIXED_DT;
        }

        const done = Math.abs(this.value - this.target) + Math.abs(this.velocity) < this.motionThreshold;
        if (done) {
            this.value = this.target;
            this.velocity = 0;
        }
        return done;
    }
}
