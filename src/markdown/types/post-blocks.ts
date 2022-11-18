/**
 * Post Blocks
 *
 * Specifies all the types for the block-based Post system.
 * @module
 */

import { string, z } from 'zod';
import { AttachmentId } from './ids';

/**
 * @internal
 */
const BaseBlock = z.object({
    type: z.string(),
});
interface BaseBlock {
    type: string;
}

/**
 * @category Storage Blocks
 *
 * Blocks as they are stored in the database.
 * Only contains minimal information needed to reproduce content, used as the base to generate [[View Blocks]].
 */

/**
 * @category Storage Blocks
 */
export const MarkdownStorageBlock = BaseBlock.extend({
    type: z.literal('markdown'),
    markdown: z.object({
        /** Raw markdown to be parsed at render-time. */
        content: z.string(),
    }),
});
export type MarkdownStorageBlock = z.infer<typeof MarkdownStorageBlock>;

/**
 * @category Storage Blocks
 */
export const AttachmentStorageBlock = BaseBlock.extend({
    type: z.literal('attachment'),
    attachment: z.object({
        /** ID for the [[`Attachment`]] to be rendered. */
        attachmentId: AttachmentId,
        altText: z.string().optional(),
    }),
});
export type AttachmentStorageBlock = z.infer<typeof AttachmentStorageBlock>;

export const InvalidAttachmentStorageBlock = AttachmentStorageBlock.extend({
    attachment: AttachmentStorageBlock.shape.attachment.extend({
        attachmentId: z.null(),
    }),
});
export type InvalidAttachmentStorageBlock = z.infer<typeof InvalidAttachmentStorageBlock>;

/**
 * Union type used on the [[`Post`]] model
 *
 * @category Storage Blocks
 */
export const StorageBlock = z.union([MarkdownStorageBlock, AttachmentStorageBlock]);
export type StorageBlock = z.infer<typeof StorageBlock>;

/**
 * @category View Blocks
 * View Blocks _must_ contain all data needed to render the block.
 * This is a wire-safe type and as a result _must_ not contain anything the client can't see.
 *
 */

/**
 * No changes are currently required from the [[`MarkdownStorageBlock`]]
 * so this is currently a simple alias.
 *
 * @category View Blocks
 * */
export const MarkdownViewBlock = MarkdownStorageBlock.extend({});
export type MarkdownViewBlock = z.infer<typeof MarkdownViewBlock>;

/**
 * Adds the image URL for rendering
 *
 * @category View Blocks
 */
export const AttachmentViewBlock = AttachmentStorageBlock.extend({
    attachment: AttachmentStorageBlock.shape.attachment.and(
        z.object({
            previewURL: z.string(),
            fileURL: z.string(),
        })
    ),
});
export type AttachmentViewBlock = z.infer<typeof AttachmentViewBlock>;

/**
 * Union type used for [[`PostViewModel`]] and component renderers.
 * @category View Blocks
 */
export const ViewBlock = z.union([MarkdownViewBlock, AttachmentViewBlock]);
export type ViewBlock = z.infer<typeof ViewBlock>;

export function isAttachmentViewBlock(test: unknown): test is AttachmentViewBlock {
    return AttachmentViewBlock.safeParse(test).success;
}

export function isMarkdownViewBlock(test: unknown): test is MarkdownViewBlock {
    return MarkdownViewBlock.safeParse(test).success;
}

export function isAttachmentStorageBlock(test: unknown): test is AttachmentStorageBlock {
    return AttachmentStorageBlock.safeParse(test).success;
}

export function isMarkdownStorageBlock(test: unknown): test is MarkdownStorageBlock {
    return MarkdownStorageBlock.safeParse(test).success;
}

// via https://github.com/colinhacks/zod/issues/627#issuecomment-911679836
// could be worth investigating a factory function?
export function parseAttachmentStorageBlocks(originalBlocks: unknown[]) {
    return z
        .preprocess(
            (blocks) => z.array(z.any()).parse(blocks).filter(isAttachmentStorageBlock),
            z.array(AttachmentStorageBlock)
        )
        .parse(originalBlocks);
}

export function summaryContent(block: ViewBlock): string {
    switch (block.type) {
        case 'markdown':
            return block.markdown.content;
        case 'attachment': {
            const encodedFilename = block.attachment.fileURL.split('/').pop();

            return encodedFilename ? `[image: ${decodeURIComponent(encodedFilename)}]` : `[image]`;
        }
    }
}
