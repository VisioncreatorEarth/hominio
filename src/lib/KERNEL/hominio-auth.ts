import { createAuthClient } from "better-auth/svelte"

export const authClient = createAuthClient({
    baseURL: "http://localhost:5173",
    session: {
        cookieCache: {
            enabled: true,
            maxAge: 24 * 60 * 60 // 1 day in seconds
        }
    }
})