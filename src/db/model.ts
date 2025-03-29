import { t } from 'elysia'
import { docs } from './schema'

// Create models with type refinements
export const db = {
    insert: {
        docs: t.Object({
            content: t.Object({
                title: t.String(),
                body: t.String(),
                version: t.Number(),
                blocks: t.Array(t.Object({
                    type: t.String(),
                    text: t.Optional(t.String()),
                    language: t.Optional(t.String()),
                    code: t.Optional(t.String())
                }))
            }),
            metadata: t.Object({
                author: t.String(),
                tags: t.Array(t.String()),
                createdBy: t.String(),
                status: t.String()
            })
        })
    },
    select: {
        docs
    }
} as const; 