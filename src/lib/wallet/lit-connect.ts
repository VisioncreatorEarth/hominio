import * as LitJsSdk from "@lit-protocol/lit-node-client";
import { currentLitEnvironment } from "./config"; // Import environment setting from config

/**
 * Initializes and connects the Lit Protocol client.
 * Uses the network specified in the config (currentLitEnvironment).
 * @returns A promise that resolves to the connected LitNodeClient instance.
 */
export const initializeLitClient = async (): Promise<LitJsSdk.LitNodeClient> => {
    console.log(`Attempting to connect to Lit Network configured as: ${currentLitEnvironment}...`);
    const client = new LitJsSdk.LitNodeClient({
        litNetwork: currentLitEnvironment, // Use the environment string from config
        debug: false,
        alertWhenUnauthorized: false,
    });

    try {
        await client.connect();
        console.log(`Successfully connected to Lit Network: ${currentLitEnvironment}.`);
        return client;
    } catch (error) {
        console.error(`Failed to connect to Lit Network ${currentLitEnvironment}:`, error);
        // Propagate the error to be handled by the caller
        throw error;
    }
}; 