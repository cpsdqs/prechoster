import React, { createRef, PureComponent } from 'react';
import { AnimationController, Spring } from './frame-animation';
import { shouldReduceMotion } from './animation';
import './dir-popover.css';
import { LayoutRootContext } from './layout-root-context';

const WINDOW_MARGIN = 16;
const ARROW_SIZE = 16;
const ARROW_MARGIN = 10;

export class DirPopover extends PureComponent<DirPopover.Props> {
    animCtrl = new AnimationController();
    presence = new Spring({
        target: this.props.open ? 1 : 0,
        stiffness: 439,
        damping: 31,
    });
    snapToNextPosition = false;
    anchorLoc = [0, 0];
    arrowLoc: [string, number, number] = ['none', 0, 0];
    positionX = new Spring({ stiffness: 439, damping: 42 });
    positionY = new Spring({ stiffness: 439, damping: 42 });
    width = new Spring({ stiffness: 439, damping: 42 });
    height = new Spring({ stiffness: 439, damping: 42 });
    dialog = createRef<HTMLDialogElement>();
    popover = createRef<HTMLDivElement>();
    popoverContent: { current: HTMLElement | null } = { current: null };
    popoverContentRef = (node: HTMLElement | null) => {
        this.popoverContent.current = node;
        if (node) this.resizeObserver.observe(node);
    };
    shouldRenderContents = false;
    isReadyToShow = false;

    snapToNextContentSize = false;
    resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            // we're only observing one element
            this.width.target = entry.contentRect.width;
            this.height.target = entry.contentRect.height;

            if (this.snapToNextContentSize) {
                this.width.value = this.width.target;
                this.height.value = this.height.target;
                this.snapToNextContentSize = false;
            }

            this.animCtrl.add(this);
        }
    });

    update(dt: number) {
        const popoverSize = [this.width.target, this.height.target];
        const anchorMin = [window.innerWidth / 2, window.innerHeight / 2];
        const anchorCenter = [window.innerWidth / 2, window.innerHeight / 2];
        const anchorMax = [window.innerWidth / 2, window.innerHeight / 2];
        if (this.props.anchor instanceof HTMLElement) {
            const anchorRect = this.props.anchor.getBoundingClientRect();
            anchorMin[0] = anchorRect.left;
            anchorMin[1] = anchorRect.top;
            anchorMax[0] = anchorRect.right;
            anchorMax[1] = anchorRect.bottom;
            anchorCenter[0] = anchorRect.left + anchorRect.width / 2;
            anchorCenter[1] = anchorRect.top + anchorRect.height / 2;
        } else if (Array.isArray(this.props.anchor)) {
            anchorMin[0] = anchorMax[0] = anchorCenter[0] = this.props.anchor[0];
            anchorMin[1] = anchorMax[1] = anchorCenter[1] = this.props.anchor[1];
        }

        const popoverMinLoc = [WINDOW_MARGIN, WINDOW_MARGIN];
        const popoverMaxLoc = [
            window.innerWidth - popoverSize[0] - WINDOW_MARGIN,
            window.innerHeight - popoverSize[1] - WINDOW_MARGIN,
        ];

        // default: just center it
        let popoverLoc = [
            anchorCenter[0] - popoverSize[0] / 2,
            anchorCenter[1] - popoverSize[1] / 2,
        ];
        this.anchorLoc = anchorCenter;
        let arrowLocType = 'none';

        const hasEnoughSpaceAbove = anchorMin[1] - ARROW_SIZE - popoverSize[1] > popoverMinLoc[0];
        const hasEnoughSpaceBelow = anchorMax[1] + ARROW_SIZE < popoverMaxLoc[1];
        const hasEnoughSpaceOnLeft = anchorMin[0] - ARROW_SIZE > popoverMinLoc[0];
        const hasEnoughSpaceOnRight = anchorMax[0] + ARROW_SIZE < popoverMaxLoc[0];

        const placeAbove = () => {
            popoverLoc = [
                anchorCenter[0] - popoverSize[0] / 2,
                anchorMin[1] - ARROW_SIZE - popoverSize[1],
            ];
            this.anchorLoc = [anchorCenter[0], anchorMin[1]];
            arrowLocType = 'bottom';
        };
        const placeBelow = () => {
            popoverLoc = [anchorCenter[0] - popoverSize[0] / 2, anchorMax[1] + ARROW_SIZE];
            this.anchorLoc = [anchorCenter[0], anchorMax[1]];
            arrowLocType = 'top';
        };
        const placeLeft = () => {
            popoverLoc = [
                anchorMin[0] - ARROW_SIZE - popoverSize[0],
                anchorCenter[1] - popoverSize[1] / 2,
            ];
            this.anchorLoc = [anchorMin[0], anchorCenter[1]];
            arrowLocType = 'right';
        };
        const placeRight = () => {
            popoverLoc = [anchorMax[0] + ARROW_SIZE, anchorCenter[1] - popoverSize[1] / 2];
            this.anchorLoc = [anchorMax[0], anchorCenter[1]];
            arrowLocType = 'left';
        };

        if (this.props.anchorBias === 'above' && hasEnoughSpaceAbove) {
            placeAbove();
        } else if (this.props.anchorBias === 'below' && hasEnoughSpaceBelow) {
            placeBelow();
        } else if (this.props.anchorBias === 'left' && hasEnoughSpaceOnLeft) {
            placeLeft();
        } else if (this.props.anchorBias === 'right' && hasEnoughSpaceOnRight) {
            placeRight();
        } else if (hasEnoughSpaceAbove) {
            placeAbove();
        } else if (hasEnoughSpaceBelow) {
            placeBelow();
        } else if (hasEnoughSpaceOnRight) {
            placeRight();
        } else if (hasEnoughSpaceOnLeft) {
            placeLeft();
        }

        popoverLoc[0] = Math.max(popoverMinLoc[0], Math.min(popoverLoc[0], popoverMaxLoc[0]));
        popoverLoc[1] = Math.max(popoverMinLoc[1], Math.min(popoverLoc[1], popoverMaxLoc[1]));

        // round target location so we don't get subpixel blurriness
        this.positionX.target = Math.round(popoverLoc[0]);
        this.positionY.target = Math.round(popoverLoc[1]);

        if (!this.snapToNextContentSize && this.snapToNextPosition) {
            // only snap to next position once content size has been resolved
            this.positionX.value = this.positionX.target;
            this.positionY.value = this.positionY.target;
            this.snapToNextPosition = false;
            this.isReadyToShow = true;
        }

        let done = true;
        done = this.presence.update(dt) && done;
        done = this.width.update(dt) && done;
        done = this.height.update(dt) && done;
        done = this.positionX.update(dt) && done;
        done = this.positionY.update(dt) && done;

        this.arrowLoc = ['none', 0, 0];
        if (arrowLocType === 'left') {
            const x = 0;
            const y = this.anchorLoc[1] - this.positionY.value;
            if (y > ARROW_MARGIN && y < this.height.value - ARROW_MARGIN) {
                this.arrowLoc = ['left', x, y];
            }
        } else if (arrowLocType === 'right') {
            const x = this.width.value;
            const y = this.anchorLoc[1] - this.positionY.value;
            if (y > ARROW_MARGIN && y < this.height.value - ARROW_MARGIN) {
                this.arrowLoc = ['right', x, y];
            }
        } else if (arrowLocType === 'top' || arrowLocType === 'bottom') {
            const x = this.anchorLoc[0] - this.positionX.value;
            const y = arrowLocType === 'top' ? 0 : this.height.value;
            if (x > ARROW_MARGIN && x < this.width.value - ARROW_MARGIN) {
                this.arrowLoc = [arrowLocType, x, y];
            }
        }

        const shouldShow = this.presence.value > 0.01;

        // render only if there is something visible
        if (shouldShow) this.forceUpdate();

        if (shouldShow && !this.dialog.current?.open) {
            this.dialog.current?.showModal();
            this.shouldRenderContents = true;
        } else if (!shouldShow && this.dialog.current?.open) {
            this.dialog.current?.close();
            this.isReadyToShow = false;
        }

        return done;
    }

    componentDidMount() {
        this.dialog.current!.addEventListener('close', this.onDialogClose);
        this.dialog.current!.addEventListener('cancel', this.onDialogClose);
        window.addEventListener('resize', this.onResize);

        if (this.props.open) {
            this.presence.target = 1;
            this.snapToNextContentSize = true;
            this.snapToNextPosition = true;
            this.animCtrl.add(this);
        }
    }

    componentDidUpdate(prevProps: DirPopover.Props) {
        if (prevProps.open !== this.props.open) {
            if (this.props.open) {
                this.presence.target = 1;
                if (this.presence.value < 0.01) {
                    this.snapToNextContentSize = true;
                    this.snapToNextPosition = true;
                }
            } else {
                this.presence.target = 0;
            }

            this.animCtrl.add(this);
        }
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.onResize);
    }

    onResize = () => {
        this.animCtrl.add(this);
    };

    onDialogClose = (e: React.MouseEvent | Event) => {
        e.preventDefault();
        this.props.onClose();
    };

    render() {
        const { children } = this.props;
        const reduceMotion = shouldReduceMotion();

        const presence = this.presence.value;

        const popoverOpacity = this.props.open
            ? this.isReadyToShow
                ? reduceMotion
                    ? presence
                    : 1
                : 0
            : presence;

        const anchorLoc = this.anchorLoc;
        const popoverLoc = [this.positionX.value, this.positionY.value];

        const popoverTransform = `translate(${popoverLoc[0]}px, ${popoverLoc[1]}px)`;
        const popoverTransformScale = ` scale(${Math.max(0, presence)})`;
        const popoverTransformOrigin = `${anchorLoc[0] - popoverLoc[0]}px ${
            anchorLoc[1] - popoverLoc[1]
        }px`;

        let arrow = null;

        if (this.arrowLoc[0] !== 'none') {
            arrow = (
                <div
                    className="i-arrow"
                    data-type={this.arrowLoc[0]}
                    style={{
                        transform: [
                            popoverTransform + (reduceMotion ? '' : popoverTransformScale),
                            `translate(${this.arrowLoc[1]}px, ${this.arrowLoc[2]}px)`,
                        ].join(' '),
                        transformOrigin: popoverTransformOrigin,
                        opacity: popoverOpacity,
                    }}
                />
            );
        }

        return (
            <dialog className="dir-popover-dialog" ref={this.dialog}>
                <div
                    className="inner-backdrop"
                    onClick={this.onDialogClose}
                    style={{ opacity: presence }}
                />
                <div
                    ref={this.popover}
                    className="inner-popover"
                    style={{
                        width: this.width.value + 'px',
                        height: this.height.value + 'px',
                        transform: popoverTransform + (reduceMotion ? '' : popoverTransformScale),
                        transformOrigin: popoverTransformOrigin,
                        opacity: popoverOpacity,
                    }}
                >
                    <LayoutRootContext.Provider value={this.dialog}>
                        <div className="i-content" ref={this.popoverContentRef}>
                            {this.shouldRenderContents && children}
                        </div>
                    </LayoutRootContext.Provider>
                </div>
                {arrow}
            </dialog>
        );
    }
}

namespace DirPopover {
    export interface Props {
        /** Anchor where the popover will appear from. Either an element or client coordinates */
        anchor?: HTMLElement | [number, number] | null;
        anchorBias?: 'above' | 'below' | 'left' | 'right';
        /** Whether the popover is open */
        open: boolean;
        /** Close callback. */
        onClose: () => void;
        /** Popover contents */
        children: React.ReactNode;
    }
}
