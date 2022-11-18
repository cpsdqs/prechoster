// Adapted from https://github.com/twitter/twitter-text

function regexSupplant(regex: RegExp | string, map: Record<string, string | RegExp>, flags = '') {
    if (typeof regex !== 'string') {
        if (regex.global && flags.indexOf('g') < 0) {
            flags += 'g';
        }
        if (regex.ignoreCase && flags.indexOf('i') < 0) {
            flags += 'i';
        }
        if (regex.multiline && flags.indexOf('m') < 0) {
            flags += 'm';
        }

        regex = regex.source;
    }

    return new RegExp(
        regex.replace(/#\{(\w+)\}/g, function (match, name: string) {
            let newRegex = map[name] || '';
            if (typeof newRegex !== 'string') {
                newRegex = newRegex.source;
            }
            return newRegex;
        }),
        flags
    );
}

const latinAccentChars =
    /\xC0-\xD6\xD8-\xF6\xF8-\xFF\u0100-\u024F\u0253\u0254\u0256\u0257\u0259\u025B\u0263\u0268\u026F\u0272\u0289\u028B\u02BB\u0300-\u036F\u1E00-\u1EFF/;
const atSigns = /[@ï¼ ]/;
const validMentionPrecedingChars = /(?:^|[^a-zA-Z0-9_!#$%&*@ï¼ \\/]|(?:^|[^a-zA-Z0-9_+~.-\\/]))/;

const validMention = regexSupplant(
    '(#{validMentionPrecedingChars})' + // $1: Preceding character
        '(#{atSigns})' + // $2: At mark
        '([a-zA-Z0-9-]{3,})', // $3: handle
    { validMentionPrecedingChars, atSigns },
    'g'
);
const endMentionMatch = regexSupplant(/^(?:#{atSigns}|[#{latinAccentChars}]|:\/\/)/, {
    atSigns,
    latinAccentChars,
});

type MentionToken = {
    handle: string;
    indices: [startPosition: number, endPosition: number];
};
export function extractMentions(text: string): MentionToken[] {
    if (!text.match(atSigns)) {
        return [];
    }

    const possibleNames: MentionToken[] = [];

    text.replace(
        validMention,
        function (
            match,
            before: string,
            atSign: string,
            handle: string,
            offset: number,
            chunk: string
        ) {
            const after = chunk.slice(offset + match.length);

            if (!after.match(endMentionMatch)) {
                const startPosition = offset + before.length;
                const endPosition = startPosition + handle.length + 1;
                possibleNames.push({
                    handle,
                    indices: [startPosition, endPosition],
                });
            }

            return '';
        }
    );

    return possibleNames;
}
