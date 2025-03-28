import { betterAuth } from "better-auth";
import pkg from 'pg';
const { Pool } = pkg;

export const auth = betterAuth({
    database: new Pool({
        connectionString: process.env.DATABASE_URL
    }),
    emailAndPassword: {
        enabled: true,
        minimumPasswordLength: 8,
        autoConfirm: true
    },
    registration: {
        enabled: true,
        autoConfirm: true,
        defaultRole: 'user'
    },
    trustedOrigins: [
        'http://127.0.0.1:5173',
        'http://localhost:5173'
    ]
})