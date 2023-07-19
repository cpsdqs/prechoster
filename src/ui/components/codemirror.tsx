// from https://github.com/uiwjs/react-codemirror/blob/56fb55855a42888bf93d3d4dbe251cfc7c8e37ee/
// core/src/useCodeMirror.ts

import { forwardRef, useRef, useEffect, useState, useImperativeHandle } from 'react';
import { EditorState, StateEffect } from '@codemirror/state';
import { indentWithTab } from '@codemirror/commands';
import { EditorView, keymap, ViewUpdate, placeholder } from '@codemirror/view';
import { basicSetup } from '@uiw/codemirror-extensions-basic-setup';
import { ReactCodeMirrorRef, ReactCodeMirrorProps } from '@uiw/react-codemirror';

export interface UseCodeMirror extends ReactCodeMirrorProps {
    container?: HTMLDivElement | null;
}

export function useCodeMirror(props: UseCodeMirror) {
    const {
        value,
        selection,
        onChange,
        onCreateEditor,
        onUpdate,
        extensions = [],
        autoFocus,
        theme = 'light',
        height = '',
        minHeight = '',
        maxHeight = '',
        placeholder: placeholderStr = '',
        width = '',
        minWidth = '',
        maxWidth = '',
        editable = true,
        readOnly = false,
        indentWithTab: defaultIndentWithTab = true,
        basicSetup: defaultBasicSetup = true,
        root,
    } = props;
    const [container, setContainer] = useState<HTMLDivElement>();
    const [view, setView] = useState<EditorView>();
    const [state, setState] = useState<EditorState>();
    const updateListener = EditorView.updateListener.of((vu: ViewUpdate) => {
        if (vu.docChanged && typeof onChange === 'function') {
            const doc = vu.state.doc;
            const value = doc.toString();
            onChange(value, vu);
        }
        // onStatistics && onStatistics(getStatistics(vu));
    });

    let getExtensions = [updateListener];
    if (defaultIndentWithTab) {
        getExtensions.unshift(keymap.of([indentWithTab]));
    }
    if (defaultBasicSetup) {
        if (typeof defaultBasicSetup === 'boolean') {
            getExtensions.unshift(basicSetup());
        } else {
            getExtensions.unshift(basicSetup(defaultBasicSetup));
        }
    }

    if (placeholderStr) {
        getExtensions.unshift(placeholder(placeholderStr));
    }

    if (typeof theme !== 'string') {
        getExtensions.push(theme);
    }

    if (editable === false) {
        getExtensions.push(EditorView.editable.of(false));
    }
    if (readOnly) {
        getExtensions.push(EditorState.readOnly.of(true));
    }

    if (onUpdate && typeof onUpdate === 'function') {
        getExtensions.push(EditorView.updateListener.of(onUpdate));
    }
    getExtensions = getExtensions.concat(extensions);

    useEffect(() => {
        if (container && !state) {
            const stateCurrent = EditorState.create({
                doc: value,
                selection,
                extensions: getExtensions,
            });
            setState(stateCurrent);
            if (!view) {
                const viewCurrent = new EditorView({
                    state: stateCurrent,
                    parent: container,
                    root,
                });
                setView(viewCurrent);
                onCreateEditor && onCreateEditor(viewCurrent, stateCurrent);
            }
        }
        return () => {
            if (view) {
                setState(undefined);
                setView(undefined);
            }
        };
    }, [container, state]);

    useEffect(() => setContainer(props.container!), [props.container]);

    useEffect(
        () => () => {
            if (view) {
                view.destroy();
                setView(undefined);
            }
        },
        [view]
    );

    useEffect(() => {
        if (autoFocus && view) {
            view.focus();
        }
    }, [autoFocus, view]);

    useEffect(() => {
        if (view) {
            view.dispatch({ effects: StateEffect.reconfigure.of(getExtensions) });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        theme,
        extensions,
        height,
        minHeight,
        maxHeight,
        width,
        minWidth,
        maxWidth,
        placeholderStr,
        editable,
        readOnly,
        defaultIndentWithTab,
        defaultBasicSetup,
        onChange,
        onUpdate,
    ]);

    // don't useEffect on this so we can avoid desync
    {
        const currentValue = view ? view.state.doc.toString() : '';
        if (view && value !== currentValue) {
            view.dispatch({
                changes: { from: 0, to: currentValue.length, insert: value || '' },
                // keep selection
                selection: view.state.selection,
            });
        }
    }

    return { state, setState, view, setView, container, setContainer };
}

// from core/src/index.tsx
export default forwardRef<ReactCodeMirrorRef, ReactCodeMirrorProps>((props, ref) => {
    const {
        className,
        value = '',
        selection,
        extensions = [],
        onChange,
        onStatistics,
        onCreateEditor,
        onUpdate,
        autoFocus,
        theme,
        height,
        minHeight,
        maxHeight,
        width,
        minWidth,
        maxWidth,
        basicSetup,
        placeholder,
        indentWithTab,
        editable,
        readOnly,
        root,
        ...other
    } = props;
    const editor = useRef<HTMLDivElement>(null);
    const { state, view, container } = useCodeMirror({
        container: editor.current,
        root,
        value,
        autoFocus,
        theme,
        height,
        minHeight,
        maxHeight,
        width,
        minWidth,
        maxWidth,
        basicSetup,
        placeholder,
        indentWithTab,
        editable,
        readOnly,
        selection,
        onChange,
        onStatistics,
        onCreateEditor,
        onUpdate,
        extensions,
    });

    useImperativeHandle(ref, () => ({ editor: editor.current, state, view }), [
        editor,
        container,
        state,
        view,
    ]);

    const defaultClassNames = typeof theme === 'string' ? `cm-theme-${theme}` : 'cm-theme';
    return <div ref={editor} className={`${defaultClassNames} ${className}`} {...(other as any)} />;
});
