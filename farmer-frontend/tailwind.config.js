/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontSize: {
        stat: ['2rem', { lineHeight: '1.2', fontWeight: '700' }],
        'week-date': ['2.5rem', { lineHeight: '1.15', fontWeight: '800' }],
      },
      height: {
        navbar: '3.5rem',
      },
      spacing: {
        navbar: '3.5rem',
      },
    },
  },
  plugins: [],
}
