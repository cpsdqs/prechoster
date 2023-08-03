import { IDENT_REGEX } from './parse';
import { JsonValue } from '../../../document';

const INDENT = '  ';
const STRING_INDENT = '  ';

function doubleQuoteString(s: string): string {
    let out = '"';
    for (const c of s) {
        if (c === '\n') out += '\\n';
        else if (c === '\r') out += '\\r';
        else if (c === '"') out += '\\"';
        else if (c === '\\') out += '\\\\';
        else out += c;
    }
    out += '"';
    return out;
}

function stringifyMapKey(s: string): string {
    const m = s.match(IDENT_REGEX);
    if (m && m[0].length === s.length) {
        return s;
    } else {
        return doubleQuoteString(s);
    }
}

const MAX_MAP_SINGLE_LINE_COUNT = 5;
const MAX_MAP_SINGLE_LINE_LEN = 50;
const MAX_LIST_SINGLE_LINE_COUNT = 10;
const MAX_LIST_SINGLE_LINE_LEN = 50;

function stringifyMap(value: Record<string, JsonValue>, indent: string) {
    const size = Object.keys(value).length;
    if (!size) return '{}';

    singleLine: while (size <= MAX_MAP_SINGLE_LINE_COUNT) {
        let out = '{ ';
        for (const [k, v] of Object.entries(value)) {
            out += stringifyMapKey(k);
            out += ' = ';
            out += stringifyOne(v, indent);
            out += '; ';

            if (out.includes('\n') || out.length > MAX_MAP_SINGLE_LINE_LEN) {
                // nope
                break singleLine;
            }
        }
        out += '}';
        return out;
    }

    let out = '{\n';
    const innerIndent = indent + INDENT;
    for (const [k, v] of Object.entries(value)) {
        out += innerIndent + stringifyMapKey(k);
        out += ' = ';
        out += stringifyOne(v, innerIndent);
        out += ';\n';
    }
    out += indent + '}';
    return out;
}

function stringifyList(value: JsonValue[], indent: string) {
    if (!value.length) return '[]';

    singleLine: while (value.length <= MAX_LIST_SINGLE_LINE_COUNT) {
        let out = '[';
        for (const item of value) {
            if (out.length > 1) out += ' ';
            out += stringifyOne(item, indent);

            if (out.includes('\n') || out.length > MAX_LIST_SINGLE_LINE_LEN) {
                // nope
                break singleLine;
            }
        }
        out += ']';
        return out;
    }

    let out = '[\n';
    const innerIndent = indent + INDENT;
    for (const item of value) {
        out += innerIndent;
        out += stringifyOne(item, innerIndent);
        out += '\n';
    }
    out += indent + ']';
    return out;
}

function stringifyString(value: string, indent: string) {
    if (value.includes('\n')) {
        const innerIndent = indent ? indent + STRING_INDENT : indent;

        const contents = value
            .split('\n')
            .map((line) => {
                // add escapes
                let out = '';
                let rest = line;
                while (rest.length) {
                    if (rest[0] === "'" && rest[1] === "'") {
                        out += "'''";
                        rest += rest.substring(2);
                    } else if (rest[0] === '$' && rest[1] === '{') {
                        out += "''${";
                        rest += rest.substring(2);
                    } else {
                        out += rest[0];
                        rest = rest.substring(1);
                    }
                }
                return out;
            })
            .map((line) => {
                // trim empty lines; add indentation
                if (!line.trim()) return '';
                return innerIndent + line;
            })
            .join('\n');

        if (contents.endsWith('\n')) {
            return `''\n${contents}${indent}''`;
        } else {
            return `''\n${contents}''`;
        }
    } else {
        return doubleQuoteString(value);
    }
}

function stringifyOne(value: JsonValue, indent: string): string {
    if (Array.isArray(value)) {
        return stringifyList(value, indent);
    } else if (typeof value === 'object' && value !== null) {
        return stringifyMap(value, indent);
    } else if (typeof value === 'string') {
        return stringifyString(value, indent);
    } else if (typeof value === 'boolean' || typeof value === 'number') {
        return value.toString();
    } else if (value === null) {
        return 'null';
    }

    throw new Error(`stringify not implemented for type ${typeof value}`);
}

export function stringifyImpl(v: JsonValue): string {
    return stringifyOne(v, '');
}
