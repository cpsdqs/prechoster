import { ButtonHTMLAttributes, createRef, MouseEvent, PureComponent, ReactNode } from 'react';
import { ElAnim, Spring } from './animation';
import { ButtonPopout } from './button-popout';
import './button.css';

export namespace Button {
    export interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
        run: (e?: MouseEvent) => Promise<unknown> | void;
        /** external loading state. Can be used to force loading animation */
        loading?: boolean;
        primary?: boolean;
        danger?: boolean;
        children?: ReactNode;
    }
}

export class Button extends PureComponent<Button.Props> {
    state = {
        loading: false,
        popoutOpen: false,
        popoutMessage: null,
        popoutAction: null,
    };

    #node = createRef<HTMLSpanElement>();
    #button = createRef<HTMLButtonElement>();
    #loadingNode = createRef<HTMLDivElement>();
    #loadingSpin = createRef<HTMLDivElement>();

    get node(): HTMLSpanElement | null {
        return this.#node.current;
    }

    elAnim = new ElAnim(
        ({ loading, width }) => {
            const buttonWidth = loading ? (this.#circleSize - width) * loading + width : 0;

            let buttonStyle = {
                opacity: Math.min(1, 1 - loading / 0.1),
            };

            const loadingNodeStyle = {
                width: buttonWidth.toFixed(3) + 'px',
                opacity: Math.max(0, loading / 0.1),
            };

            const loadingSpinStyle = {
                opacity: Math.max(0, loading - 0.9) / 0.1,
                zIndex: Math.round(Math.max(0, loading - 0.9) * 2),
            };

            return [buttonStyle, loadingNodeStyle, loadingSpinStyle];
        },
        [this.#button, this.#loadingNode, this.#loadingSpin]
    );

    widthAnim = new ElAnim(
        ({ width }) => {
            return { width: width.toFixed(3) + 'px' };
        },
        [this.#button],
        {
            useAnimationFillForwards: false,
        }
    );

    #loading = new Spring();
    #width = new Spring();
    #circleSize = 0;

    updateWidth = (animate: boolean) => {
        const button = this.#button.current;
        if (!button) return;

        this.widthAnim.cancel(); // to get actual width
        this.#width.setTarget(button.offsetWidth);

        if (!animate) {
            this.#width.setValue(this.#width.target);
        }
        this.elAnim.resolve();
        this.widthAnim.resolve();
    };

    get loading() {
        return this.state.loading || this.props.loading;
    }

    componentDidMount() {
        this.elAnim.didMount();
        this.widthAnim.didMount();
        this.updateMetrics(true);
    }

    componentDidUpdate(prevProps: Button.Props) {
        if (this.props.loading !== prevProps.loading) {
            if (this.props.loading) {
                this.setState({ popoutOpen: false });
            }
        }
        if (
            this.props.loading !== prevProps.loading ||
            this.props.children !== prevProps.children
        ) {
            this.updateMetrics();
        }
    }

    componentWillUnmount() {
        this.elAnim.drop();
    }

    showError(error: any, action?: ButtonPopout.Action) {
        this.setState({ popoutOpen: true, popoutMessage: error, popoutAction: action || null });
    }

    showAction(label: ReactNode, run: () => Promise<any>) {
        this.setState({
            popoutOpen: true,
            popoutMessage: null,
            popoutAction: {
                label,
                run: () =>
                    this.setState({ loading: true, popoutOpen: false }, () => {
                        this.elAnim.resolve();

                        run()
                            .catch((error: any) => {
                                this.showError(error);
                            })
                            .then(() =>
                                this.setState({ loading: false }, () => this.updateMetrics())
                            );
                    }),
            },
        });
    }

    updateMetrics(skipAnimation = false) {
        this.#circleSize = this.#button.current?.offsetHeight || 0;
        this.updateWidth(!skipAnimation);
    }

    run = (e?: any) => {
        if (this.loading) return;
        this.setState({ popoutOpen: false });
        this.updateMetrics();

        this.setState({ loading: true }, () => {
            this.elAnim.resolve();

            const res = this.props.run(e) ?? Promise.resolve();

            res.catch((error) => {
                console.error('button error', error);
                this.showError(error);
            }).then(() => {
                this.setState({ loading: false }, () => this.updateMetrics());
            });
        });
    };

    onClick = (e: MouseEvent) => {
        if (this.props.onClick) this.props.onClick(e as any);
        this.run();
    };

    render() {
        const { className: pClassName, disabled, primary, danger, children } = this.props;

        let className = 'uikit-button ';
        if (this.loading || this.#loading.getValue() > 0.5) className += 'is-loading ';
        if (disabled) className += 'is-disabled ';
        if (!primary) className += 'is-muted ';
        if (danger) className += 'is-danger ';
        className += pClassName || '';

        this.#loading.setTarget(this.loading ? 1 : 0);
        this.elAnim.setInputs({
            loading: this.#loading,
            width: this.#width,
        });
        this.widthAnim.setInputs({ width: this.#width });

        return (
            <span className={className} ref={this.#node}>
                <button
                    ref={this.#button}
                    disabled={disabled}
                    className="button-inner"
                    onClick={this.onClick}
                >
                    {children}
                </button>
                <div ref={this.#loadingNode} className="button-loading"></div>
                <div ref={this.#loadingSpin} className="button-loading-spin">
                    <div
                        className="button-loading-spin-inner"
                        style={{
                            width: this.#circleSize,
                        }}
                    />
                </div>

                <ButtonPopout
                    location="below"
                    message={this.state.popoutMessage}
                    action={this.state.popoutAction}
                    open={this.state.popoutOpen}
                    onClose={() => this.setState({ popoutOpen: false })}
                />
            </span>
        );
    }
}
