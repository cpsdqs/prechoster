import { h } from 'preact';
import { PureComponent } from 'preact/compat';
import { ModulePlugin, ModulePluginProps, ByteSliceData, PlainTextData, Data } from '../../document';
import base64js from 'base64-js';

export type ToDataUrlData = {
    mime: string,
};

function ToDataUrl({ data, onChange }: ModulePluginProps<ToDataUrlData>) {
    const mimeId = Math.random().toString(36);

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
        </div>
    );
}

export default {
    id: 'transform.to-data-url',
    acceptsInputs: true,
    acceptsNamedInputs: false,
    component: ToDataUrl as unknown,
    initialData() {
        return { mime: 'text/plain' };
    },
    description() {
        return 'To data URL';
    },
    async eval(data: ToDataUrlData, inputs: Data[]) {
        let buffers = [];
        let len = 0;
        for (const input of inputs) {
            let data;
            if (data = input.into(ByteSliceData)) {
                buffers.push(data.contents);
                len += data.contents.byteLength;
            } else {
                throw new Error(`don’t know how to convert ${input.typeDescription()} to a data URL`);
            }
        }

        const buffer = new Uint8Array(len);
        let cursor = 0;
        for (const buf of buffers) {
            buffer.set(buf, cursor);
            cursor += buf.byteLength;
        }

        const url = `data:${data.mime};base64,${base64js.fromByteArray(buffer)}`;

        return new PlainTextData(url);
    },
} as ModulePlugin<ToDataUrlData>;
