/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17211f',
        mint: '#b8f2d2',
        spruce: '#14524a',
        paper: '#fbfaf6',
      },
    },
  },
  plugins: [],
}

