import { h, createRef as createPreactRef } from 'preact';
import { PureComponent } from 'preact/compat';
import { createElement, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import InnerReactFlow, { Controls, Background } from 'reactflow';
import { GRID_SIZE } from './consts';
import { ModuleNode } from './module-node';
import { OutputNode } from './output-node';

// reactflow doesnt work in preact :(
// well i’m not rewriting this whole thing in react
// and so we commit crimes

const nodeTypes = {
    module: ModuleNode,
    modOutput: OutputNode,
};

export class ReactFlow extends PureComponent<any> {
    rootNode = createPreactRef();
    reactRoot: any = null;

    renderReact() {
        return createElement(
            InnerReactFlow,
            { ...this.props, nodeTypes },
            createElement(Controls),
            createElement(Background, { gap: GRID_SIZE }),
        );
    }

    componentDidMount() {
        this.reactRoot = createRoot(this.rootNode.current);
        this.reactRoot.render(this.renderReact());
    }

    componentDidUpdate(prevProps: any) {
        this.reactRoot.render(this.renderReact());
    }

    render() {
        return h('div', {
            class: 'react-flow-bridge',
            ref: this.rootNode,
        });
    }
}
