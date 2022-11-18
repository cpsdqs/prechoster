import React, { FunctionComponent, createElement as h } from 'preact/compat';
import brokenImage from './broken-image';
export const CustomEmoji: FunctionComponent<{
    name: string;
    url: string;
}> = React.memo(({ name = 'missing', url = brokenImage }) => {
    return (
        <img
            src={url}
            alt={`:${name}:`}
            title={`:${name}:`}
            className="m-0 inline-block aspect-square object-contain align-middle"
            style={{
                height: 'var(--emoji-scale)',
            }}
        />
    );
});
CustomEmoji.displayName = 'CustomEmoji';
