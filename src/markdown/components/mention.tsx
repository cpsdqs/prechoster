import { ProjectHandle } from '../types/ids';
import React, { FunctionComponent, createElement as h } from 'preact/compat';

export const Mention: FunctionComponent<{ handle: ProjectHandle }> = ({ handle }) => {
    return (
        <a
            href={'https://cohost.org/' + encodeURIComponent(handle)}
            className="!font-bold !no-underline hover:!underline"
        >
            @{handle}
        </a>
    );
};

/**
 * Default props included because Mention is used outside of typescript and we
 * need an easy way to see when it's fucked instead of just crashing
 */
Mention.defaultProps = {
    handle: 'ERROR' as ProjectHandle,
};
