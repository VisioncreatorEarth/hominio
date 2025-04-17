import { env } from '$env/dynamic/private';
import { betterAuth } from "better-auth";
import pkg from 'pg';
const { Pool } = pkg;

let authInstance: ReturnType<typeof betterAuth> | null = null;

export function getAuthClient(): ReturnType<typeof betterAuth> {
    if (!authInstance) {
        // Initialize only when first requested
        if (!env.SECRET_DATABASE_URL_AUTH || !env.SECRET_GOOGLE_CLIENT_ID || !env.SECRET_GOOGLE_CLIENT_SECRET) {
            // In a pure client-side context (like Tauri build), these might not be available.
            // Handle this gracefully, maybe throw an error or return a mock/dummy client
            // if auth functionality is expected during build (which it usually shouldn't be).
            console.error("Auth environment variables are not available. Auth client cannot be initialized.");
            // For now, we'll throw an error, adjust as needed for your specific build/runtime needs.
            throw new Error("Auth environment variables missing during initialization.");
        }

        authInstance = betterAuth({
            database: new Pool({
                connectionString: env.SECRET_DATABASE_URL_AUTH
            }),
            socialProviders: {
                google: {
                    clientId: env.SECRET_GOOGLE_CLIENT_ID,
                    clientSecret: env.SECRET_GOOGLE_CLIENT_SECRET,
                    redirectUri: 'http://localhost:5173/auth/callback/google'
                },
            },
            trustedOrigins: [
                'http://localhost:5173'
            ],
            session: {
                expiresIn: 60 * 60 * 24 * 7, // 7 days
                updateAge: 60 * 60 * 24 // 1 day (every 1 day the session expiration is updated)
            }
        });
    }
    return authInstance;
}