import { t } from 'elysia'
import { docs, content } from './schema'

// Create models with type refinements
export const db = {
    insert: {
        docs: t.Object({
            pubKey: t.String(),
            snapshotCid: t.String(),
            updateCids: t.Array(t.String()),
            ownerId: t.String(),
            title: t.String(),
            description: t.Optional(t.String())
        }),
        content: t.Object({
            cid: t.String(),
            type: t.Union([t.Literal('snapshot'), t.Literal('update')]),
            data: t.Any() // For Loro-doc binary content
        })
    },
    select: {
        docs,
        content
    }
} as const; 