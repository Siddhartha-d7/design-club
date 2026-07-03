/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          black: '#000000',
          white: '#ffffff',
          dark: '#0a0a0a',
          light: '#f9f9f9',
          gray: {
            50: '#fafdff',
            100: '#f4f4f5',
            200: '#e4e4e7',
            300: '#d4d4d8',
            400: '#a1a1aa',
            500: '#71717a',
            600: '#52525b',
            700: '#3f3f46',
            800: '#27272a',
            900: '#18181b',
            950: '#09090b',
          }
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'neo': '4px 4px 0px 0px #000000',
        'neo-white': '4px 4px 0px 0px #ffffff',
        'neo-sm': '2px 2px 0px 0px #000000',
        'neo-lg': '8px 8px 0px 0px #000000',
      }
    },
  },
  plugins: [],
}
