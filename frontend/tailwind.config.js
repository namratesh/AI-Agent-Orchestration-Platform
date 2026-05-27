module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['Monaco', 'Menlo', '"Courier New"', 'monospace'],
      },
      colors: {
        primary: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
      },
      animation: {
        'fade-in':    'fadeIn 250ms ease-out',
        'slide-up':   'slideUp 350ms ease-out',
        'slide-in-r': 'slideInRight 300ms ease-out',
        'bounce-in':  'bounceIn 400ms ease-out',
      },
      keyframes: {
        fadeIn:       { from: { opacity: '0' },                                to: { opacity: '1' } },
        slideUp:      { from: { transform: 'translateY(12px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        slideInRight: { from: { transform: 'translateX(20px)', opacity: '0' }, to: { transform: 'translateX(0)', opacity: '1' } },
        bounceIn:     { '0%': { transform: 'scale(0.9)', opacity: '0' }, '60%': { transform: 'scale(1.03)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
      },
      boxShadow: {
        card:       '0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.06)',
        'card-hover': '0 8px 25px rgba(0,0,0,0.12), 0 3px 8px rgba(0,0,0,0.08)',
        modal:      '0 20px 60px rgba(0,0,0,0.3)',
      },
    },
  },
  plugins: [],
}
