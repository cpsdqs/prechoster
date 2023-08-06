import { InputHTMLAttributes, PureComponent } from 'react';
import './checkbox.css';

export namespace Checkbox {
    export interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
        checked: boolean;
        onChange?: (b: boolean) => void;
        falseCross?: boolean;
    }
}
export default class Checkbox extends PureComponent<Checkbox.Props> {
    state = {
        focused: false,
    };

    wasChecked = this.props.checked;
    prevPropsChecked = this.props.checked;

    onFocus = (e: any) => {
        if (this.props.onFocus) this.props.onFocus(e);
        if (!e.defaultPrevented) this.setState({ focused: true });
    };
    onBlur = (e: any) => {
        if (this.props.onBlur) this.props.onBlur(e);
        if (!e.defaultPrevented) this.setState({ focused: false });
    };

    render() {
        const { checked, className: pClassName, onChange, falseCross, ...extra } = this.props;

        if (checked !== this.prevPropsChecked) {
            this.wasChecked = this.prevPropsChecked;
            this.prevPropsChecked = checked;
        }

        let className = 'uikit-checkbox ';
        if (checked) className += 'is-checked ';
        if (this.wasChecked) className += 'was-checked ';
        if (this.state.focused) className += 'is-focused ';
        className += pClassName || '';

        return (
            <span className={className}>
                <input
                    {...extra}
                    checked={checked}
                    className="inner-checkbox"
                    type="checkbox"
                    onFocus={this.onFocus}
                    onBlur={this.onBlur}
                    onChange={(e) => onChange && onChange(e.target.checked)}
                />
                <span className="inner-check" />
                {!!falseCross && <span className="inner-cross" />}
            </span>
        );
    }
}
