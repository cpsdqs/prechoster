import { z } from 'zod';
import { LEGAL_REGEX } from '../username-verifier';
import { DateTime } from 'luxon';

// based on https://github.com/colinhacks/zod/issues/678#issuecomment-962387521
type Tagged<T, Tag> = T & { __tag: Tag };
function refinement<Type extends Tagged<T, any>, T>() {
    return function (val: T): val is Type {
        return true;
    };
}

export type AttachmentId = Tagged<string, 'AttachmentId'>;
export const AttachmentId = z.string().uuid().refine(refinement<AttachmentId, string>());

export type PostId = Tagged<number, 'PostId'>;
export const PostId = z.number().int().refine(refinement<PostId, number>());

export type ProjectId = Tagged<number, 'ProjectId'>;
export const ProjectId = z.number().int().refine(refinement<ProjectId, number>());

export type UserId = Tagged<number, 'UserId'>;
export const UserId = z.number().int().refine(refinement<UserId, number>());

export type ProjectHandle = Tagged<string, 'ProjectHandle'>;
export const ProjectHandle = z
    .string()
    .regex(LEGAL_REGEX)
    .refine(refinement<ProjectHandle, string>());

export type CommentId = Tagged<string, 'CommentId'>;
export const CommentId = z.string().uuid().refine(refinement<CommentId, string>());

export type TagId = Tagged<number, 'TagId'>;
export const TagId = z.number().int().refine(refinement<TagId, number>());

export type InviteId = Tagged<string, 'InviteId'>;
export const InviteId = z.string().uuid().refine(refinement<InviteId, string>());

export type BookmarkId = Tagged<string, 'BookmarkId'>;
export const BookmarkId = z.string().uuid().refine(refinement<BookmarkId, string>());

export const ISODateString = z.string().refine((string) => DateTime.fromISO(string).isValid, {
    message: 'Not a valid ISO date!',
});
