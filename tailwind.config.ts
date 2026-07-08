import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50:  '#FDFCFA',
          100: '#FAF7F2',
          200: '#F2EBE0',
          300: '#EAE0D2',
        },
        terracotta: {
          100: '#F5E8E2',
          200: '#E9CABF',
          400: '#D0846A',
          500: '#C16B4A',
          600: '#A8583A',
          700: '#8B4A2F',
        },
        olive: {
          100: '#D5D9D1',
          200: '#B0B8A9',
          400: '#6B7A60',
          500: '#4A5240',
          600: '#3A4133',
          700: '#2F3528',
          800: '#1E2319',
        },
        sand: {
          100: '#F5F0E8',
          200: '#EDE4D8',
          300: '#E2D5C4',
          400: '#D4C4B0',
        },
        charcoal: {
          400: '#6B6B6B',
          500: '#4A4A4A',
          700: '#2C2C2C',
          900: '#1A1A1A',
        },
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-playfair)', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 4px 0 rgba(44, 44, 44, 0.06)',
        'card-hover': '0 4px 16px 0 rgba(44, 44, 44, 0.10)',
      },
    },
  },
  plugins: [],
}

export default config
