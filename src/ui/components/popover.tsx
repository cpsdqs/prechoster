import { h, createRef, ComponentChildren } from 'preact';
import { PureComponent } from 'preact/compat';
import { AnimationController, Spring } from '../animation';
import './popover.less';

const WINDOW_MARGIN = 16;
const ARROW_SIZE = 16;
const ARROW_MARGIN = 10;

export class Popover extends PureComponent<Popover.Props> {
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
    dialog = createRef();
    popover = createRef();
    popoverContent: { current: HTMLElement | null } = { current: null };
    popoverContentRef = (node: HTMLElement | null) => {
        this.popoverContent.current = node;
        if (node) this.resizeObserver.observe(node);
    };

    snapToNextContentSize = false;
    resizeObserver = new ResizeObserver(entries => {
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
        if (this.props.anchor) {
            const anchorRect = this.props.anchor.getBoundingClientRect();
            anchorMin[0] = anchorRect.left;
            anchorMin[1] = anchorRect.top;
            anchorMax[0] = anchorRect.right;
            anchorMax[1] = anchorRect.bottom;
            anchorCenter[0] = anchorRect.left + anchorRect.width / 2;
            anchorCenter[1] = anchorRect.top + anchorRect.height / 2;
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
        const hasEnoughSpaceOnRight = anchorMax[0] + ARROW_SIZE < popoverMaxLoc[0];
        if (hasEnoughSpaceAbove) {
            popoverLoc = [anchorCenter[0] - popoverSize[0] / 2, anchorMin[1] - ARROW_SIZE - popoverSize[1]];
            this.anchorLoc = [anchorCenter[0], anchorMin[1]];
            arrowLocType = 'bottom';
        } else if (hasEnoughSpaceBelow) {
            popoverLoc = [anchorCenter[0] - popoverSize[0] / 2, anchorMax[1] + ARROW_SIZE];
            this.anchorLoc = [anchorCenter[0], anchorMax[1]];
            arrowLocType = 'top';
        } else if (hasEnoughSpaceOnRight) {
            popoverLoc = [anchorMax[0] + ARROW_SIZE, anchorCenter[1] - popoverSize[1] / 2];
            this.anchorLoc = [anchorMax[0], anchorCenter[1]];
            arrowLocType = 'left';
        }

        popoverLoc[0] = Math.max(popoverMinLoc[0], Math.min(popoverLoc[0], popoverMaxLoc[0]));
        popoverLoc[1] = Math.max(popoverMinLoc[1], Math.min(popoverLoc[1], popoverMaxLoc[1]));

        this.positionX.target = popoverLoc[0];
        this.positionY.target = popoverLoc[1];

        if (!this.snapToNextContentSize && this.snapToNextPosition) {
            // only snap to next position once content size has been resolved
            this.positionX.value = this.positionX.target;
            this.positionY.value = this.positionY.target;
            this.snapToNextPosition = false;
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
        } else if (arrowLocType === 'top' || arrowLocType === 'bottom') {
            const x = this.anchorLoc[0] - this.positionX.value;
            const y = arrowLocType === 'top' ? 0 : this.height.value;
            if (x > ARROW_MARGIN && x < this.width.value - ARROW_MARGIN) {
                this.arrowLoc = [arrowLocType, x, y];
            }
        }

        this.forceUpdate();

        const shouldShow = this.presence.value > 0.01;
        if (shouldShow && !this.dialog.current.open) {
            this.dialog.current.showModal();
        } else if (!shouldShow && this.dialog.current.open) {
            this.dialog.current.close();
        }


        return done;
    }

    componentDidMount() {
        this.dialog.current.addEventListener('close', this.onDialogClose);
        this.dialog.current.addEventListener('cancel', this.onDialogClose);
        window.addEventListener('resize', this.onResize);

        if (this.props.open) {
            this.presence.target = 1;
            this.snapToNextContentSize = true;
            this.snapToNextPosition = true;
            this.animCtrl.add(this);
        }
    }

    componentDidUpdate(prevProps: Popover.Props) {
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

    onDialogClose = (e: Event) => {
        e.preventDefault();
        this.props.onClose();
    };

    render({ anchor, children }: Popover.Props) {
        const presence = this.presence.value;
        const popoverOpacity = this.props.open ? 1 : this.presence.value;
        const anchorLoc = this.anchorLoc;
        const popoverLoc = [this.positionX.value, this.positionY.value];
        const popoverTransform = `translate(${popoverLoc[0]}px, ${popoverLoc[1]}px) scale(${Math.max(0, presence)})`;
        const popoverTransformOrigin = `${anchorLoc[0] - popoverLoc[0]}px ${anchorLoc[1] - popoverLoc[1]}px`;
        let arrow = null;

        if (this.arrowLoc[0] !== 'none') {
            arrow = (
                <div
                    class="i-arrow"
                    data-type={this.arrowLoc[0]}
                    style={{
                        transform: [
                            popoverTransform,
                            `translate(${this.arrowLoc[1]}px, ${this.arrowLoc[2]}px)`,
                        ].join(' '),
                        transformOrigin: popoverTransformOrigin,
                        opacity: popoverOpacity,
                    }} />
            );
        }

        return (
            <dialog class="popover-dialog" ref={this.dialog}>
                <div
                    class="inner-backdrop"
                    onClick={this.onDialogClose}
                    style={{ opacity: presence }} />
                <div
                    ref={this.popover}
                    class="inner-popover"
                    style={{
                        width: this.width.value + 'px',
                        height: this.height.value + 'px',
                        transform: popoverTransform,
                        transformOrigin: popoverTransformOrigin,
                        opacity: popoverOpacity,
                    }}>
                    <div
                        class="i-content"
                        ref={this.popoverContentRef}>
                        {children}
                    </div>
                </div>
                {arrow}
            </dialog>
        );
    }
}
namespace Popover {
    export interface Props {
        /** Anchor where the popover will appear from */
        anchor?: HTMLElement | null;
        /** Whether the popover is open */
        open: boolean;
        /** Close callback. */
        onClose: () => void;
        /** Popover contents */
        children: ComponentChildren;
    }
}
