import { h } from 'preact';
import { PureComponent, useState } from 'preact/compat';
import { ModulePlugin, ModulePluginProps, ByteSliceData, BlobData, PlainTextData, Data } from '../../document';
import base64js from 'base64-js';

export type ToBlobData = {
    mime: string,
    override: string | null,
    useOverride: boolean,
};

function ToBlob({ id, data, onChange, document }: ModulePluginProps<ToBlobData>) {
    const [loading, setLoading] = useState(false);

    const mimeId = Math.random().toString(36);
    const useOverrideId = Math.random().toString(36);
    const overrideId = Math.random().toString(36);

    const download = () => {
        setLoading(true);
        document.eval(id).then(result => {
            setLoading(false);

            if (result.type === 'output') {
                const blobUrl = (result.outputs.get(id) as BlobData).objectUrl;
                const a = window.document.createElement('a');
                a.href = blobUrl;
                a.download = '';
                a.click();

                result.drop();
            } else if (result.type === 'error') {
                alert('Could not generate file\n\n' + result.error);
            }
        });
    };

    return (
        <div>
            <div>
                <label for={mimeId}>MIME type:</label>
                {' '}
                <input
                    id={mimeId}
                    type="text"
                    placeholder="text/plain"
                    value={data.mime}
                    onChange={e => {
                        onChange({ ...data, mime: (e.target as HTMLInputElement).value });
                    }} />
            </div>
            <div>
                <button onClick={download} disabled={loading}>download file</button>
            </div>
            <hr />
            <div>
                <input
                    id={useOverrideId}
                    type="checkbox"
                    checked={data.useOverride}
                    onChange={e => {
                        onChange({ ...data, useOverride: (e.target as HTMLInputElement).checked });
                    }} />
                {' '}
                <label for={useOverrideId}>Override with uploaded file</label>
            </div>
            {data.useOverride && (
                <div>
                    <label for={overrideId}>URL:</label>
                    {' '}
                    <input
                        id={overrideId}
                        type="text"
                        placeholder="https://staging.cohostcdn.org/..."
                        value={data.override || ''}
                        onChange={e => {
                            onChange({ ...data, override: (e.target as HTMLInputElement).value || null });
                        }} />
                </div>
            )}
        </div>
    );
}

export default {
    id: 'transform.to-blob',
    acceptsInputs: true,
    acceptsNamedInputs: false,
    component: ToBlob as unknown,
    initialData() {
        return { mime: 'image/svg+xml', override: null, useOverride: false };
    },
    description() {
        return 'To blob';
    },
    async eval(data: ToBlobData, inputs: Data[]) {
        if (data.useOverride && data.override) return new PlainTextData(data.override);

        let buffers = [];
        let len = 0;
        for (const input of inputs) {
            let data;
            if (data = input.into(ByteSliceData)) {
                buffers.push(data.contents);
                len += data.contents.byteLength;
            } else {
                throw new Error(`don’t know how to convert ${input.typeDescription()} to a blob`);
            }
        }

        const buffer = new Uint8Array(len);
        let cursor = 0;
        for (const buf of buffers) {
            buffer.set(buf, cursor);
            cursor += buf.byteLength;
        }

        return new BlobData(buffer, data.mime);
    },
} as ModulePlugin<ToBlobData>;
