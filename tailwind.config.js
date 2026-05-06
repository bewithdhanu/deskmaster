/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./dist/**/*.html",
    "./node_modules/@blocknote/shadcn/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* shadcn / BlockNote menu surfaces — required for bg-popover, bg-muted, etc. */
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
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
