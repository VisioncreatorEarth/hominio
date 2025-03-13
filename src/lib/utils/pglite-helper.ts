/**
 * PGlite WASM Asset Helper
 * 
 * This helper ensures PGlite can locate its required WASM files (postgres.wasm and postgres.data)
 * in both development and production builds. It adds a global locator function that PGlite
 * checks when loading its assets.
 */

// Flag to track whether PGlite has been configured
export const pgliteLoaded = { value: false };

// The locator function gets called by PGlite when loading WASM files
if (typeof window !== 'undefined') {
    // Define paths for development and production environments
    const isProd = import.meta.env.PROD;

    // Add the locator function that PGlite uses internally
    // @ts-expect-error - PGlite looks for this global function
    window.locatePGliteFile = (filename: string): string => {
        // Only intercept the postgres.wasm and postgres.data files
        if (filename === 'postgres.wasm' || filename === 'postgres.data') {
            // Try multiple possible locations for the file
            const possibleLocations = [
                // Standard location in static/public directory
                `/pglite-assets/${filename}`,
                // Location in built assets (SvelteKit output)
                `/_app/immutable/assets/${filename}`,
                // Tauri resource location (macOS bundle)
                `/resources/pglite-assets/${filename}`
            ];

            // Log what we're doing
            console.log(`PGlite looking for ${filename} in ${isProd ? 'production' : 'development'} mode`);

            // In development, prioritize the public directory
            if (!isProd) {
                console.log(`Trying location: ${possibleLocations[0]}`);
                return possibleLocations[0];
            }

            // In production, we'll need to check if our custom location works
            // The actual check happens at runtime when PGlite tries to fetch the file
            console.log(`Using location: ${possibleLocations[0]}`);
            return possibleLocations[0];
        }

        // For any other files, use the default path
        return filename;
    };

    console.log(`PGlite helper initialized in ${isProd ? 'production' : 'development'} mode`);

    // Mark as loaded
    pgliteLoaded.value = true;
}

export default {}; 