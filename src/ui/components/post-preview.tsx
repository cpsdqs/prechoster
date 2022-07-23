import { h } from 'preact';
import { PureComponent } from 'preact/compat';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import './post-preview.less';

const STRIP_ELEMENTS = [
    'script',
    'style',
    'frame',
    'iframe',
    'applet',
    'embed',
    'object',
    'link',
    'svg',
];

export function PostPreview({ markdown, error, stale }: PostPreview.Props) {
    const doc = new DOMParser().parseFromString([
        '<!doctype html><html><head></head><body>',
        micromark(markdown, {
            allowDangerousHtml: true,
            extensions: [gfm({ singleTilde: false })],
            htmlExtensions: [gfmHtml()],
        }),
        '</body></html>',
    ].join(''), 'text/html');
    for (const node of doc.querySelectorAll(STRIP_ELEMENTS.join(', ')) as any) {
        node.remove();
    }
    const html = doc.body.innerHTML;

    return (
        <div class={'post-preview' + (stale ? ' is-stale' : '')}>
            <div class="post-header"></div>
            <hr />
            <div class="prose-container p-prose-outer">
                {error ? (
                    <div class="inner-prose p-prose is-error">
                        {error.toString().split('\n').map((line, i) => <div key={i}>{line}</div>)}
                    </div>
                ) : (
                    <div class="inner-prose p-prose" dangerouslySetInnerHTML={{ __html: html }} />
                )}
            </div>
            <hr />
            <div class="post-footer">
                <ByteSize size={html.length} />
                <CopyToClipboard disabled={!!error} data={html} label="Copy HTML to clipboard" />
            </div>
        </div>
    );
}
namespace PostPreview {
    export interface Props {
        markdown: string;
        error?: Error | null;
        stale?: boolean;
    }
}

function ByteSize({ size }: { size: number }) {
    let label;
    if (size < 1000) {
        label = size + ' bytes';
    } else {
        size = +(size / 1000).toFixed(2);
        if (size < 1000) {
            label = size + ' kB';
        } else {
            size = +(size / 1000).toFixed(2);
            label = size + ' MB';
        }
    }
    return <span>{label}</span>;
}

class CopyToClipboard extends PureComponent<CopyToClipboard.Props> {
    state = {
        copied: false,
    };

    copy = () => {
        try {
            navigator.clipboard.writeText(this.props.data);
            this.setState({ copied: true });
            setTimeout(() => {
                this.setState({ copied: false });
            }, 1000);
        } catch (err) {
            alert('Could not copy to clipboard\n\n' + err);
        }
    };

    render({ label, disabled }: CopyToClipboard.Props) {
        return (
            <button
                disabled={disabled}
                class={'copy-to-clipboard' + (this.state.copied ? ' did-copy' : '')}
                onClick={this.copy}>
                {label}
            </button>
        );
    }
}
namespace CopyToClipboard {
    export interface Props {
        data: string;
        label: string;
        disabled?: boolean;
    }
}
