import { json } from '@sveltejs/kit';
import { ULTRAVOX_API_KEY } from '$env/static/private';

export async function POST(event) {
    try {
        const body = await event.request.json();
        console.log('Attempting to call Ultravox API...');

        const response = await fetch('https://api.ultravox.ai/api/calls', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': ULTRAVOX_API_KEY
            },
            body: JSON.stringify(body)
        });

        console.log('Ultravox API response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Ultravox API error:', errorText);
            return json(
                { error: 'Error calling Ultravox API', details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();
        return json(data);
    } catch (error) {
        console.error('Error in API route:', error);
        if (error instanceof Error) {
            return json(
                { error: 'Error calling Ultravox API', details: error.message },
                { status: 500 }
            );
        } else {
            return json(
                { error: 'An unknown error occurred.' },
                { status: 500 }
            );
        }
    }
} 