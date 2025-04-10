import { Elysia } from 'elysia';
import { ULTRAVOX_API_KEY } from '$env/static/private';

// Define the session type based on your auth context
interface AuthContext {
    session: {
        user: {
            id: string;
            [key: string]: unknown;
        }
    },
    body: unknown,
    set: {
        status: number;
    }
}

// Create call handlers without prefix
export const callHandlers = new Elysia()
    .post('/create', async ({ body, session, set }: AuthContext) => {
        try {
            // Cast body to handle unknown structure
            const requestData = body as Record<string, unknown>;

            // Log request for debugging
            console.log('Call API request with body:', JSON.stringify(requestData, null, 2));

            // Store vibeId in proper metadata field if provided
            // The API supports a 'metadata' field (without underscore)
            let requestBody: Record<string, unknown> = { ...requestData };

            // If _metadata exists (our temporary field), move it to the proper metadata field
            if (requestData._metadata && typeof requestData._metadata === 'object') {
                const metadata = requestData._metadata as Record<string, unknown>;
                if ('vibeId' in metadata) {
                    // Use object destructuring with rest to exclude _metadata
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { _metadata, ...rest } = requestData;
                    requestBody = {
                        ...rest,
                        metadata: {
                            vibeId: metadata.vibeId,
                            userId: session.user.id
                        }
                    };
                }
            } else {
                // Add userId to metadata if no custom metadata
                const existingMetadata = (requestData.metadata as Record<string, unknown> | undefined) || {};
                requestBody = {
                    ...requestData,
                    metadata: {
                        ...existingMetadata,
                        userId: session.user.id
                    }
                };
            }

            console.log('Calling Ultravox API with:', JSON.stringify(requestBody, null, 2));

            // Forward the request to the Ultravox API
            const response = await fetch('https://api.ultravox.ai/api/calls', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': ULTRAVOX_API_KEY
                },
                body: JSON.stringify(requestBody)
            });

            console.log('Ultravox API response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Ultravox API error:', errorText);
                set.status = response.status;
                return {
                    error: 'Error calling Ultravox API',
                    details: errorText
                };
            }

            // Return the Ultravox API response directly
            const data = await response.json();
            console.log('Ultravox API response data:', JSON.stringify(data, null, 2));
            return data;
        } catch (error) {
            console.error('Error creating call:', error);
            set.status = 500;
            return {
                error: 'Failed to create call',
                details: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });

export default callHandlers; 