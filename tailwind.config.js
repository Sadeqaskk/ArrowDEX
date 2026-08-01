/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        black: '#050508',
        panel: '#0A0A10',
        indigo: {
          DEFAULT: '#6C63FF',
          bright: '#8B7FFF',
        },
        laser: '#4D8AFF',
        violetglow: '#B98CFF',
        ivory: '#F2F1F7',
        dim: '#7B7A8C',
        success: '#5FE0A8',
        danger: '#FF6B7A',
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        card: '22px',
      },
      boxShadow: {
        glow: '0 10px 30px -10px rgba(108,99,255,0.8)',
      },
    },
  },
  plugins: [],
};
