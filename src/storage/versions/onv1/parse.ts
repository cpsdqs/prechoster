import { JsonValue } from '../../../document';

export const IDENT_REGEX = /^[a-zA-Z_][\w_']*/;

type LexToken =
    | {
          type: 'ident';
          value: string;
      }
    | {
          type: 'number';
          value: number;
      }
    | {
          type: 'string';
          value: string;
      }
    | {
          type: 'punct';
          value: ';' | '{' | '}' | '[' | ']' | '=';
      }
    | {
          type: 'whitespace';
          value: string;
      };

function translateStringEscape(e: string): string {
    if (e === 'n') return '\n';
    if (e === 'r') return '\r';
    if (e === 't') return '\t';
    if (e === '\n') return '';
    return e;
}

interface Span {
    start: number;
    end: number;
}

class LexError extends Error {
    source: string;
    pos: number;
    innerMessage: string;
    constructor(reader: Reader, message: string) {
        super(`${message} at ${formatStringPos(reader.source, reader.pos)}`);
        this.source = reader.source;
        this.pos = reader.pos;
        this.innerMessage = message;
    }
}
class ParseError extends Error {
    source: string;
    span: Span;
    innerMessage: string;
    constructor(source: string, span: Span, message: string, message2: string = '') {
        if (span.end - span.start > 0) {
            let excerpt;
            if (span.end - span.start < 50) {
                excerpt = source.substring(span.start, span.end);
            } else {
                excerpt = source.substring(span.start, span.start + 49) + '…';
            }

            super(`${message} at ${formatStringPos(source, span.start)}: ${excerpt}${message2}`);
        } else {
            super(`${message} at ${formatStringPos(source, span.start)}${message2}`);
        }
        this.innerMessage = message + message2;
        this.source = source;
        this.span = span;
    }
}

function formatStringPos(source: string, pos: number): string {
    let line = 1;
    let chars = '';
    for (let i = 0; i < source.length && pos > i; i++) {
        if (source[i] === '\n') {
            line++;
            chars = '';
        } else {
            chars += source[i];
        }
    }
    return `${line}:${1 + [...chars].length}`;
}

class Reader {
    source: string;
    pos: number = 0;

    constructor(source: string) {
        this.source = source;
    }

    advanceByTaken(s: string) {
        this.pos += s.length;
    }

    peekChar(): string {
        const res = this.source.slice(this.pos)[Symbol.iterator]().next();
        if (res.done) return '';
        return res.value;
    }

    takeChar(): string {
        const ch = this.peekChar();
        this.advanceByTaken(ch);
        return ch;
    }

    // Note: regex must start with ^
    peekMatch(re: RegExp): boolean {
        return re.test(this.source.slice(this.pos));
    }

    // Note: regex must start with ^
    consumeMatch(re: RegExp): RegExpMatchArray | null {
        const m = this.source.slice(this.pos).match(re);
        if (m) {
            this.advanceByTaken(m[0]);
            return m;
        }
        return null;
    }
}

function lexOne(reader: Reader): LexToken {
    let m;
    if ((m = reader.consumeMatch(/^[;{}[\]=]/))) {
        return { type: 'punct', value: m[0] as any };
    }

    if ((m = reader.consumeMatch(/^("|'')/))) {
        const startPos = reader.pos;
        const isDouble = m[1] === '"';

        let value = '';
        let closed = false;
        while (reader.peekChar()) {
            if (isDouble && (m = reader.consumeMatch(/^\\([\s\S])/))) {
                value += translateStringEscape(m[1]);
                continue;
            }
            if (!isDouble && (m = reader.consumeMatch(/^'''/))) {
                value += "''";
                continue;
            }
            if (!isDouble && (m = reader.consumeMatch(/^''\$/))) {
                value += '$';
                continue;
            }
            if (!isDouble && (m = reader.consumeMatch(/^''\\([\s\S])/))) {
                value += translateStringEscape(m[1]);
                continue;
            }

            if (isDouble && (m = reader.consumeMatch(/^"/))) {
                closed = true;
                break;
            }
            if (!isDouble && (m = reader.consumeMatch(/^''/))) {
                closed = true;
                break;
            }

            value += reader.takeChar();
        }

        if (!closed) {
            reader.pos = startPos;
            throw new LexError(reader, 'unclosed string');
        }

        if (!isDouble) {
            const lines = value.split('\n');
            if (!lines[0].trim()) lines.shift(); // skip first line if empty

            let minIndentation = value.length;
            for (const line of lines) {
                if (!line.trim()) continue; // ignore empty lines
                const indentation = line.match(/^\s*/)![0].length;
                minIndentation = Math.min(indentation, minIndentation);
            }
            value = lines.map((line) => line.substring(minIndentation)).join('\n');
        }

        return { type: 'string', value };
    }

    if ((m = reader.peekMatch(/^[+-]?(\d|\.\d)/))) {
        let sign = 1;
        if ((m = reader.consumeMatch(/^[+-]/))) {
            sign = m[1] === '+' ? 1 : -1;
        }

        const mIntPart = reader.consumeMatch(/^(\d+)/);

        if (reader.peekMatch(/^[.eE]/)) {
            // float
            if (mIntPart) {
                m = reader.consumeMatch(/^(\.\d*)?([eE]\d+)?/)!;
                const value = parseFloat(mIntPart[0] + m[0]);
                return { type: 'number', value: value * sign };
            } else if ((m = reader.consumeMatch(/^(\.\d+)([eE]\d+)?/))) {
                const value = parseFloat(m[0]);
                return { type: 'number', value: value * sign };
            } else {
                throw new LexError(reader, 'invalid number');
            }
        } else if (mIntPart) {
            // int
            const value = parseInt(mIntPart[0], 10);
            return { type: 'number', value: value * sign };
        } else {
            throw new LexError(reader, 'invalid number');
        }
    }

    if ((m = reader.consumeMatch(IDENT_REGEX))) {
        return { type: 'ident', value: m[0] };
    }

    if ((m = reader.consumeMatch(/^\s+/))) {
        return { type: 'whitespace', value: m[0] };
    }

    throw new LexError(reader, `unexpected ${reader.peekChar()}`);
}

interface SpannedLexToken {
    token: LexToken;
    span: Span;
}
function lex(source: string): SpannedLexToken[] {
    const tokens: SpannedLexToken[] = [];

    const reader = new Reader(source);
    while (reader.peekChar()) {
        const posBefore = reader.pos;
        const token = lexOne(reader);
        const span = {
            start: posBefore,
            end: reader.pos,
        };
        tokens.push({ token, span });
    }

    return tokens;
}

function isToken(token: SpannedLexToken, type: any, value: any) {
    return token.token.type === type && token.token.value === value;
}
function throwUnexpectedToken(
    token: SpannedLexToken,
    expected: string,
    path: string[],
    source: string
): never {
    let pathFmt = path.join('') || '<root>';
    throw new ParseError(
        source,
        token.span,
        'unexpected token in ' + pathFmt,
        ` (expected ${expected})`
    );
}
function throwExpectedTokenAtEof(what: string, source: string): never {
    throw new ParseError(
        source,
        {
            start: source.length,
            end: source.length,
        },
        'expected ' + what
    );
}

function parseOne(tokens: SpannedLexToken[], path: string[], source: string): [JsonValue] | [] {
    const token = tokens.shift();
    if (!token) return [];

    if (isToken(token, 'punct', '{')) {
        const items: Record<string, JsonValue> = {};

        while (true) {
            const tok = tokens.shift();
            if (!tok) throwExpectedTokenAtEof('a token after {', source);

            if (isToken(tok, 'punct', '}')) break;

            if (tok.token.type === 'string' || tok.token.type === 'ident') {
                const key = tok.token.value;
                if (key === '__proto__')
                    throw new ParseError(source, tok.span, '__proto__ key not supported');

                const equals = tokens.shift();
                if (!equals) throwExpectedTokenAtEof('`=`', source);
                if (!isToken(equals, 'punct', '='))
                    throwUnexpectedToken(equals, '`=`', path, source);

                const value = parseOne(tokens, path.concat(`.${key}`), source);
                if (!value.length) throwExpectedTokenAtEof('a value', source);

                const semi = tokens.shift();
                if (!semi) throwExpectedTokenAtEof('`;`', source);
                if (!isToken(semi, 'punct', ';')) throwUnexpectedToken(semi, '`;`', path, source);

                items[key] = value[0];
            } else {
                throwUnexpectedToken(tok, 'a map key', path, source);
            }
        }

        return [items];
    } else if (isToken(token, 'punct', '[')) {
        const items = [];

        while (true) {
            if (isToken(tokens[0], 'punct', ']')) {
                tokens.shift();
                break;
            }

            const value = parseOne(tokens, path.concat(`[${items.length}]`), source);
            if (!value.length) throwExpectedTokenAtEof('a list item', source);
            items.push(value[0]);
        }

        return [items];
    } else if (['number', 'string'].includes(token.token.type)) {
        return [token.token.value];
    } else if (isToken(token, 'ident', 'null')) return [null];
    else if (isToken(token, 'ident', 'false')) return [false];
    else if (isToken(token, 'ident', 'true')) return [true];

    throwUnexpectedToken(token, 'an expression', path, source);
}

export function parseImpl(s: string): JsonValue {
    const tokens = lex(s.trim()).filter((token) => token.token.type !== 'whitespace');
    const token = parseOne(tokens, [], s);
    if (!token.length) throw new ParseError(s, { start: 0, end: 0 }, 'expected a token');
    if (tokens.length) throwUnexpectedToken(tokens[0], 'EOF', [], s);
    return token[0];
}
