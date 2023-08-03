import { parseImpl } from './parse';
import { JsonValue } from '../../../document';
import { stringifyImpl } from './stringify';

// V1 object notation

export function parse(s: string): JsonValue {
    return parseImpl(s);
}

export function stringify(v: JsonValue): string {
    return stringifyImpl(v);
}
