import React, { PureComponent } from 'react';
import './form.css';

export class Form extends PureComponent<Form.Props> {
    render() {
        return (
            <div className={'uikit-form-container ' + (this.props.className || '')}>
                {this.props.children}
            </div>
        );
    }
}

namespace Form {
    export interface Props {
        className?: string;
        children: React.ReactNode;
    }
}

/** Renders a form item. Must be inside a <Form>! */
export class FormItem extends PureComponent<FormItem.Props> {
    render() {
        const { stack, label, description, children, itemId } = this.props;
        let className = 'form-item';
        if (stack) className += ' is-stacked';

        let desc = null;
        if (description) {
            desc = <div className="item-description">{description}</div>;
        }

        return (
            <div className={className}>
                <div className="item-inner">
                    <div className="item-label">
                        <label htmlFor={itemId}>{label}</label>
                    </div>
                    {stack && desc}
                    <div className="item-contents">{children}</div>
                </div>
                {!stack && desc}
            </div>
        );
    }
}

namespace FormItem {
    export interface Props {
        label: React.ReactNode;
        children: React.ReactNode;
        stack?: boolean;
        description?: React.ReactNode;
        itemId?: string;
    }
}

export class FormDescription extends PureComponent<FormDescription.Props> {
    render() {
        return <div className="form-description">{this.props.children}</div>;
    }
}

namespace FormDescription {
    export interface Props {
        children: React.ReactNode;
    }
}

export class FormFooter extends PureComponent<FormFooter.Props> {
    render() {
        return <div className="form-footer">{this.props.children}</div>;
    }
}

namespace FormFooter {
    export interface Props {
        children: React.ReactNode;
    }
}
