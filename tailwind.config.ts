import containerQueries from '@tailwindcss/container-queries';
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import type { Config } from 'tailwindcss';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],

	theme: {
		extend: {
			colors: {
				'prussian-blue': '#0C2D48',
				'timberwolf-1': '#D9CDC2',
				'timberwolf-2': '#E6E1DB',
				'linen': '#FFF6EC',
				'buff': '#DBAD75',
				'persian-orange': '#D08968',
				'rosy-brown': '#B88C84',
				'moss-green': '#8A9A5B'
			},
			fontFamily: {
				// Add custom fonts here if needed in the future
				'playfair-display': ['"Playfair Display"', 'serif'],
				'ibm-plex-sans': ['"IBM Plex Sans"', 'sans-serif']
			}
		}
	},

	plugins: [typography, forms, containerQueries]
} satisfies Config;
