import { env } from '$env/dynamic/private';
import { betterAuth } from "better-auth";
import pkg from 'pg';
const { Pool } = pkg;


export const auth = betterAuth({
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
    ]
})