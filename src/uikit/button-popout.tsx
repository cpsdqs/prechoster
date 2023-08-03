import React, {
    createRef,
    PureComponent,
    RefObject,
    StyleHTMLAttributes,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimationValue, ElAnim, getNow, shouldReduceMotion, Spring } from './animation';
import './button-popout.css';
import { LayoutRootContext } from './layout-root-context';

export namespace ButtonPopout {
    export interface Props {
        message: { toString: () => string } | Error | null;
        open: boolean;
        onClose: () => void;
        location: 'above' | 'below';
        action: Action | null;
    }

    export interface Action {
        run: () => void;
        label: React.ReactNode;
    }
}

class PresenceOut implements AnimationValue {
    open = false;
    resetTime = getNow();
    resetValue = 0;

    setOpen(open: boolean) {
        if (open === this.open) return;
        this.open = open;
        this.resetValue = this.getInnerValue(getNow());
        this.resetTime = getNow();
    }

    getInnerValue(t: number): number {
        const dt = t - this.resetTime;
        if (this.open) {
            return Math.max(0, this.resetValue - dt / 0.5);
        } else {
            return Math.min(1, this.resetValue + dt / 0.5);
        }
    }

    getValue(t = getNow()): number {
        return 1 - Math.pow(this.getInnerValue(t), 6);
    }

    setValue(v: number, t = getNow()) {
        this.resetTime = t;
        this.resetValue = v;
    }

    shouldStop(t = getNow()): boolean {
        if (this.open) {
            return this.getInnerValue(t) === 0;
        } else {
            return this.getInnerValue(t) === 1;
        }
    }
}

/**
 * Renders a popout that will eventually disappear.
 * Will magically appear positioned around the parent node.
 */
export function ButtonPopout(props: ButtonPopout.Props) {
    const anchor = useRef<HTMLDivElement>(null);
    const layoutRoot = useContext(LayoutRootContext);

    return (
        <span className="uikit-popout-anchor" ref={anchor} role="alert">
            {/* here we render the alert message for the role="alert" */}
            {props.open ? <MessageRenderer message={props.message} /> : null}

            <InnerPopout
                location={props.location}
                open={props.open}
                onClose={props.onClose}
                anchor={anchor}
                message={props.message}
                action={props.action}
                portalContainer={layoutRoot.current || document.body}
            />
        </span>
    );
}

const POPOUT_CLOSE_TIMEOUT = 2500;

class InnerPopout extends PureComponent<
    ButtonPopout.Props & {
        anchor: RefObject<HTMLDivElement>;
        portalContainer: HTMLElement;
    }
> {
    presence = new Spring();
    presenceY = new Spring({ dampingRatio: 0.5 });
    presenceOut = new PresenceOut();
    position: [number, number] | null = null;
    containerWidth = 0;
    popoutOffsetX = 0;
    pointerSize = 0;

    popoutSatelliteInner = createRef<HTMLDivElement>();
    popoutContainer = createRef<HTMLDivElement>();
    popoutPointer = createRef<HTMLDivElement>();

    updatePosition() {
        const location = this.props.location || 'below';
        const anchor = this.props.anchor.current;
        const popoutContainer = this.popoutContainer.current;
        if (anchor && anchor.parentNode && popoutContainer) {
            const parent = anchor.parentNode as HTMLElement;
            const anchorRect = parent.getBoundingClientRect();

            let anchorLeft = anchorRect.left;
            let anchorTop = anchorRect.top;

            if (window.visualViewport) {
                anchorLeft += window.visualViewport.offsetLeft;
                anchorTop += window.visualViewport.offsetTop;
            }

            let px = anchorLeft + anchorRect.width / 2;
            let py = anchorTop + anchorRect.height;

            if (location === 'above') {
                py = anchorTop;
            }

            this.position = [px, py];

            this.pointerSize = this.popoutPointer.current!.offsetWidth;

            this.containerWidth = popoutContainer.offsetWidth;
            const minOffset = -px;
            const maxOffset = window.innerWidth - this.containerWidth - px;
            this.popoutOffsetX = Math.max(minOffset, Math.min(-this.containerWidth / 2, maxOffset));
        }
    }

    shouldStop() {
        return (
            this.presence.shouldStop() ||
            this.presenceY.shouldStop() ||
            this.presenceOut.shouldStop()
        );
    }

    update() {
        if (this.props.open) {
            this.presence.setTarget(1);
            this.presenceY.setTarget(1);
        }
        this.presenceOut.setOpen(this.props.open);

        this.updatePosition();

        if (!this.props.open && this.shouldStop()) {
            this.elAnim.cancel();
            this.presenceOut.setValue(0);
            this.presence.setValue(0);
            this.presenceY.setValue(0);
        } else {
            this.elAnim.resolve();
        }
    }

    didOpen() {
        this.presence.setValue(0);
        this.presenceY.setValue(0);
    }

    didClose() {
        if (this.scheduledClose) clearTimeout(this.scheduledClose);
        this.presenceOut.setValue(0);
        this.presenceOut.setOpen(false);
        this.elAnim.resolve();
    }

    scheduledClose: ReturnType<typeof setTimeout> | null = null;

    scheduleClose() {
        if (this.scheduledClose) clearTimeout(this.scheduledClose);
        this.scheduledClose = setTimeout(() => {
            this.props.onClose();
        }, POPOUT_CLOSE_TIMEOUT);
    }

    elAnim = new ElAnim(
        ({ presence, presenceY, presenceOut }) => {
            const reduceMotion = shouldReduceMotion();

            const scaleY = presenceY * presenceOut;
            const scaleX = Math.pow(presence, 3) * presenceOut;

            const satelliteStyle: Record<string, string> = {
                transform: `scaleY(${scaleY.toFixed(3)})`,
                opacity: (Math.sqrt(presence) * presenceOut).toString(),
            };

            const pointerBaseSize = this.pointerSize;
            let pointerSize = Math.min(scaleX * this.containerWidth, pointerBaseSize);

            let cx = this.popoutOffsetX;
            let py = 0;
            let ps = pointerSize / pointerBaseSize;
            let cy = py + (Math.sqrt(2) / 2) * pointerSize;

            const pointerTransform = [
                `translateY(${py.toFixed(3)}px)`,
                `rotate(45deg)`,
                `scale(${ps.toFixed(3)})`,
            ].join(' ');

            const containerTransform = [
                `translate(${cx.toFixed(3)}px, ${cy.toFixed(3)}px)`,
                reduceMotion ? '' : `scaleX(${scaleX.toFixed(3)})`,
            ].join(' ');
            const containerOrigin = `${(-cx).toFixed(3)}px 0`;

            const pointerStyle = { transform: pointerTransform };
            const containerStyle: Record<string, string> = {
                transform: containerTransform,
                transformOrigin: containerOrigin,
            };

            if (reduceMotion) {
                containerStyle.opacity = presence.toString();
                satelliteStyle.transform = '';
            }

            return [satelliteStyle, pointerStyle, containerStyle];
        },
        [this.popoutSatelliteInner, this.popoutPointer, this.popoutContainer]
    );

    componentDidMount() {
        this.elAnim.on('finish', () => {
            this.updatePosition();
            if (!this.props.open && this.popoutSatelliteInner.current) {
                this.forceUpdate();
            }
        });
    }

    componentWillUnmount() {
        if (this.scheduledClose) clearTimeout(this.scheduledClose);
        this.elAnim.drop();
    }

    wasOpen = false;

    render() {
        if (this.props.open !== this.wasOpen) {
            this.wasOpen = this.props.open;
            if (this.props.open) {
                this.didOpen();
                this.scheduleClose();

                requestAnimationFrame(() => {
                    this.update();
                    this.forceUpdate();
                });
            } else {
                this.didClose();
            }

            this.elAnim.setInputs({
                presence: this.presence,
                presenceY: this.presenceY,
                presenceOut: this.presenceOut,
            });
        }

        if (
            !this.props.open &&
            (this.presence.getValue() < 0.01 || this.presenceOut.getValue() === 0)
        )
            return null;

        let transform = 'translateX(-10000px)';
        if (this.position) {
            transform = `translate(${this.position[0]}px, ${this.position[1]}px)`;
        }

        const popout = (
            <div className="uikit-popout-satellite" style={{ transform }}>
                <div className="popout-satellite-inner" ref={this.popoutSatelliteInner}>
                    <div className="popout-pointer" ref={this.popoutPointer} />
                    <div className="popout-container" ref={this.popoutContainer}>
                        <div className="popout-contents">
                            <button className="popout-close" onClick={this.props.onClose}>
                                <span className="popout-close-icon" />
                            </button>
                            <div className="popout-text">
                                <MessageRenderer message={this.props.message} />
                            </div>
                            {this.props.action && (
                                <div className="popout-action">
                                    <button
                                        className="popout-action-button"
                                        onClick={this.props.action.run}
                                    >
                                        {this.props.action.label}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );

        return createPortal(popout, this.props.portalContainer);
    }
}

function MessageRenderer({ message }: { message: { toString: () => string } | Error | null }) {
    if (!message) return null;
    if ('message' in message) return <span>{message.message.toString()}</span>;
    return <span>{message.toString()}</span>;
}
