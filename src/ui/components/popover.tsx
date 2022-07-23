import { h, createRef, ComponentChildren } from 'preact';
import { PureComponent } from 'preact/compat';
import { AnimationController, Spring } from '../animation';
import './popover.less';

export class Popover extends PureComponent<Popover.Props> {
    animCtrl = new AnimationController();
    presence = new Spring({
        target: this.props.open ? 1 : 0,
        stiffness: 439,
        damping: 31,
    });
    width = new Spring({ stiffness: 439, damping: 42 });
    height = new Spring({ stiffness: 439, damping: 42 });
    dialog = createRef();
    popover = createRef();

    update(dt: number) {
        {
            const popover = this.popover.current!;
            const { width, height } = popover.style.width;
            popover.style.width = '';
            popover.style.height = '';
            this.width.target = popover.offsetWidth;
            this.height.target = popover.offsetHeight;
            popover.style.width = this.width.value;
            popover.style.height = this.height.value;
        }

        if (this.presence.value < 0.01) {
            this.width.value = this.width.target;
            this.height.value = this.height.target;
        }

        let done = true;
        done = this.presence.update(dt) && done;
        done = this.width.update(dt) && done;
        done = this.height.update(dt) && done;

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
    }

    componentDidUpdate(prevProps: Popover.Props) {
        if (prevProps.open !== this.props.open) {
            this.presence.target = this.props.open ? 1 : 0;
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

        const popoverSize = [this.width.target, this.height.target];
        // just center it for now...
        const popoverLoc = [
            (window.innerWidth - popoverSize[0]) / 2,
            (window.innerHeight - popoverSize[1]) / 2,
        ];
        const anchorLoc = [window.innerWidth / 2, window.innerHeight / 2];
        if (anchor) {
            const anchorRect = anchor.getBoundingClientRect();
            anchorLoc[0] = anchorRect.left + anchorRect.width / 2;
            anchorLoc[1] = anchorRect.top + anchorRect.height / 2;
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
                        transform: `translate(${popoverLoc[0]}px, ${popoverLoc[1]}px) scale(${presence})`,
                        transformOrigin: `${anchorLoc[0] - popoverLoc[0]}px ${anchorLoc[1] - popoverLoc[1]}px`,
                        opacity: popoverOpacity,
                    }}>
                    {children}
                </div>
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
