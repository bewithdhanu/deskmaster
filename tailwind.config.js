/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./dist/**/*.html",
  ],
  theme: {
    extend: {
      colors: {
        // System Monitor Pro color scheme
        'bg-primary': 'rgba(20, 20, 30, 0.95)',
        'bg-secondary': 'rgba(30, 30, 40, 0.95)',
        'bg-card': 'rgba(255, 255, 255, 0.05)',
        'bg-card-hover': 'rgba(255, 255, 255, 0.1)',
        'border-color': 'rgba(255, 255, 255, 0.1)',
        'text-primary': '#ffffff',
        'text-secondary': 'rgba(255, 255, 255, 0.7)',
        'text-muted': 'rgba(255, 255, 255, 0.5)',
        'accent-cpu': '#ff6b6b',
        'accent-ram': '#4ecdc4',
        'accent-disk': '#45b7d1',
        'accent-net': '#96ceb4',
        'success-color': '#51cf66',
        'warning-color': '#ffd43b',
        'alert-color': '#ff6b6b',
      },
      fontFamily: {
        'mono': ['SF Mono', 'Monaco', 'monospace'],
      },
      animation: {
        'pulse': 'pulse 2s infinite',
        'fade-in': 'fadeIn 0.5s ease-in',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
