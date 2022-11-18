const IFRAMELY_KEY = 'ec9f0026fa60dcc3683e13d7b2625b71';
import React, {
    FunctionComponent,
    useContext,
    useEffect,
    useState,
    createElement as h,
} from 'preact/compat';
import pMemoize from 'p-memoize';
import pDebounce from 'p-debounce';
import '../iframely.cjs';
import thinkbug from './thinkbug.js';

export type IframelyEmbedProps = {
    url: string;
};

type IframelyResponse =
    | { html: string; error: undefined }
    | { html: undefined; status: number; error: string }
    | null;

declare const window: Window &
    typeof globalThis & {
        iframely: {
            load: () => unknown;
            on: (event: string, cb: (...args: unknown[]) => void) => void;
        };
    };

const iframelyFetch = pMemoize(
    pDebounce(async function (url: string): Promise<IframelyResponse> {
        try {
            return await fetch(
                `https://cdn.iframe.ly/api/iframely?url=${encodeURIComponent(
                    url
                )}&key=${IFRAMELY_KEY}&iframe=1&omit_script=1`
            ).then((res) => res.json());
        } catch (e) {
            return { html: undefined, status: 500, error: String(e) };
        }
    }, 1000)
);

export const IframelyEmbed: FunctionComponent<IframelyEmbedProps> = (props) => {
    const featureFlag = true;

    const [data, setData] = useState<IframelyResponse>(null);
    useEffect(() => {
        iframelyFetch(props.url).then((data) => setData(data));
    }, [props.url]);

    if (!featureFlag) {
        // this user doesn't have the embeds feature flag; just pretend to be
        // a normal link
        return (
            <p>
                <a href={props.url} target="_blank" rel="noopener noreferrer nofollow">
                    {props.url}
                </a>
            </p>
        );
    }

    let embedBody = undefined;

    // prioritize states where we have data so that we don't accidentally swap
    // to `loading...` on refetch
    if (data && data.error) {
        embedBody = (
            <div className="not-prose flex flex-row gap-8 bg-longan-200 py-8 pl-8">
                <img className="max-w-[106px] object-contain" src={thinkbug} />
                <div className="self-center" data-testid="iframely-error">
                    <p className="font-league text-2xl font-semibold">hmm...</p>
                    <p className="font-atkinson text-2xl">
                        something went wrong with this preview.
                    </p>
                    <p className="font-atkinson text-2xl">here's why: {data.error}</p>
                </div>
            </div>
        );
    } else if (data && data.html) {
        embedBody = <div dangerouslySetInnerHTML={{ __html: data.html }} />;
    } else if (data === null) {
        // display `loading...` immediately instead of waiting for the request to
        // actually start
        embedBody = (
            <div className="not-prose flex flex-row gap-8 bg-longan-200 py-8 pl-8">
                {/* TODO: add throbber */}
                <div className="h-[102px] w-[106px]">&nbsp;</div>
                <div className="self-center">
                    <p className="font-atkinson text-2xl">loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-longan-100">
            {embedBody}
            <p className="mt-0 p-3 text-right text-gray-800">
                <a href={props.url} target="_blank" rel="noopener noreferrer nofollow">
                    {props.url}
                </a>
            </p>
        </div>
    );
};

IframelyEmbed.displayName = 'IframelyEmbed';
