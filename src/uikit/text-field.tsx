import { createRef, FocusEvent, InputHTMLAttributes, PureComponent } from 'react';
import './text-field.css';

export namespace TextField {
    export interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
        value: string;
        onChange: (v: string) => void;
        narrow?: boolean;
    }
}
export class TextField extends PureComponent<TextField.Props> {
    state = {
        focused: false,
    };

    input = createRef<HTMLInputElement>();

    onFocus = (e: FocusEvent<HTMLInputElement>) => {
        this.setState({ focused: true });
        if (this.props.onFocus) this.props.onFocus(e);
    };

    onBlur = (e: FocusEvent<HTMLInputElement>) => {
        this.setState({ focused: false });
        if (this.props.onBlur) this.props.onBlur(e);
    };

    focus() {
        this.input.current?.focus();
    }

    blur() {
        this.input.current?.blur();
    }

    render() {
        const { className: pClassName, value, onChange, ...extra } = this.props;
        let className = 'uikit-text-field ';
        if (this.state.focused) className += 'is-focused ';
        if (this.props.narrow) className += 'is-narrow ';
        className += pClassName || '';

        return (
            <span className={className}>
                <input
                    autoComplete="off" // default this to off because you’d rarely ever want this
                    {...extra}
                    ref={this.input}
                    value={value}
                    onChange={(e) => {
                        onChange(e.target.value);
                    }}
                    onFocus={this.onFocus}
                    onBlur={this.onBlur}
                    className="i-inner-field"
                />
            </span>
        );
    }
}
