import { createRef, PureComponent } from 'react';
import { ModulePlugin, ModulePluginProps, PlainTextData, BlobData } from '../../document';
import base64js from 'base64-js';
import './file-data.less';

export type FileDataPluginData = {
    dataBase64: string;
    mime: string;
    outputMode: 'blob' | 'text';
};

class FileDataEditor extends PureComponent<ModulePluginProps<FileDataPluginData>> {
    fileInput = createRef<HTMLInputElement>();

    onFile = () => {
        const fileInput = this.fileInput.current! as HTMLInputElement;
        if (fileInput.files!.length) {
            const file = fileInput.files![0];

            const fileReader = new FileReader();
            fileReader.onload = () => {
                this.props.onChange({
                    ...this.props.data,
                    dataBase64: base64js.fromByteArray(
                        new Uint8Array(fileReader.result as ArrayBuffer)
                    ),
                    mime: file.type,
                });
            };
            fileReader.readAsArrayBuffer(file);
        }
    };

    render() {
        const { data, onChange } = this.props;
        const type = data.mime;
        let preview = null;

        if (type.startsWith('text/')) {
            const buf = base64js.toByteArray(data.dataBase64);
            const contents = new TextDecoder().decode(buf);
            preview = <textarea readOnly>{contents}</textarea>;
        } else if (type.startsWith('image/')) {
            const dataUrl = `data:${type};base64,${data.dataBase64}`;

            preview = <img src={dataUrl} />;
        }

        if (data.dataBase64.length && !preview) {
            preview = `(no preview for ${type})`;
        }

        const outputId = Math.random().toString(36);

        return (
            <div className="plugin-file-data-editor">
                <input ref={this.fileInput} type="file" onChange={this.onFile} />
                <div className="file-preview">{preview}</div>
                <div>
                    <label htmlFor={outputId}>Output as:</label>{' '}
                    <select
                        value={data.outputMode}
                        onChange={(e) => {
                            onChange({
                                ...data,
                                outputMode: (e.target as HTMLSelectElement).value as any,
                            });
                        }}
                    >
                        <option value="blob">data blob</option>
                        <option value="text">text (UTF-8)</option>
                    </select>
                </div>
            </div>
        );
    }
}

export default {
    id: 'source.file-data',
    acceptsInputs: false,
    acceptsNamedInputs: false,
    component: FileDataEditor as unknown, // typescript cant figure it out
    initialData(): FileDataPluginData {
        return { dataBase64: '', mime: 'application/octet-stream', outputMode: 'blob' };
    },
    description() {
        return 'File data';
    },
    async eval(data: FileDataPluginData) {
        if (data.outputMode === 'text') {
            return new PlainTextData(
                new TextDecoder().decode(base64js.toByteArray(data.dataBase64))
            );
        }
        return new BlobData(base64js.toByteArray(data.dataBase64), data.mime);
    },
} as ModulePlugin<FileDataPluginData>;
