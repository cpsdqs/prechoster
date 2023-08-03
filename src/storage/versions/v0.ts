import { Document, JsonValue, Module, UnloadedPlugin } from '../../document';

export function deserializeV0(_data: JsonValue) {
    const data = _data as any; // just assume it's fine

    const doc = new Document();
    const modules = data.modules.map((module: JsonValue) => deserializeModule(doc, module));
    doc.init({
        title: '',
        titleInPost: false,
        modules,
    });
    return doc;
}
function deserializeModule(document: Document, _data: JsonValue) {
    // just assume it's fine
    const data = _data as any;

    const module = new Module(new UnloadedPlugin(data.pluginId, document), data.data);
    module.id = data.id;
    module.sends = data.sends;
    for (const k in data.namedSends) {
        module.namedSends.set(k, new Set(data.namedSends[k]));
    }
    if (data.graphPos) {
        module.graphPos = { x: data.graphPos[0], y: data.graphPos[1] };
    }
    return module;
}

export function serializeV0(self: Document): JsonValue {
    return { modules: self.modules.map((module) => serializeModule(module)) };
}
function serializeModule<T extends JsonValue>(self: Module<T>): JsonValue {
    const namedSends: JsonValue = {};
    for (const [k, v] of self.namedSends) namedSends[k] = [...v];

    return {
        id: self.id,
        data: self.data,
        pluginId: self.plugin.id,
        sends: self.sends,
        namedSends,
        graphPos: self.graphPos ? [self.graphPos.x, self.graphPos.y] : null,
    };
}
