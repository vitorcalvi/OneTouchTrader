/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ['./index.html', './src/frontend/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: "var(--bg-base)",
        foreground: "var(--tx-primary)",
        base: "var(--bg-base)",
        surface: "var(--bg-surface)",
        card: "var(--bg-card)",
        input: "var(--bg-input)",
        border: "var(--border)",
        "border-soft": "var(--border-soft)",
        "border-focus": "var(--border-focus)",
        primary: "var(--tx-primary)",
        secondary: "var(--tx-secondary)",
        muted: "var(--tx-muted)",
        success: {
          DEFAULT: "var(--bull)",
          light: "var(--bull-light)",
          bg: "var(--bull-bg)",
          border: "var(--bull-border)",
        },
        danger: {
          DEFAULT: "var(--bear)",
          light: "var(--bear-light)",
          bg: "var(--bear-bg)",
          border: "var(--bear-border)",
        },
        warning: {
          DEFAULT: "var(--warn)",
          light: "var(--warn-light)",
          bg: "var(--warn-bg)",
        },
        info: {
          DEFAULT: "var(--accent)",
          light: "var(--accent-light)",
          bg: "var(--accent-bg)",
          border: "var(--accent-border)",
        },
        bull: {
          DEFAULT: "var(--bull)",
          light: "var(--bull-light)",
          bg: "var(--bull-bg)",
        },
        bear: {
          DEFAULT: "var(--bear)",
          light: "var(--bear-light)",
          bg: "var(--bear-bg)",
        },
        warn: {
          DEFAULT: "var(--warn)",
          light: "var(--warn-light)",
          bg: "var(--warn-bg)",
        },
accent: {
           DEFAULT: "var(--accent)",
           light: "var(--accent-light)",
           bg: "var(--accent-bg)",
         },
app: {
            bg: '#121826',
            card: '#1e2532',
            button: '#2a3241',
            buttonHover: '#353f52',
            green: '#2eeb72',
            red: '#f44336',
            blue: '#4a89f3',
            text: '#ffffff',
            textMuted: '#8b96a5',
          },
       },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        'brand': '0 10px 15px -3px rgba(129, 140, 248, 0.2)',
        'bullish': '0 10px 15px -3px rgba(34, 197, 94, 0.2)',
        'bearish': '0 10px 15px -3px rgba(239, 68, 68, 0.2)',
        'glow-green': '0 0 15px rgba(46, 235, 114, 0.5)',
        'glow-red': '0 0 15px rgba(244, 67, 54, 0.5)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(99, 102, 241, 0.4)" },
          "50%": { boxShadow: "0 0 20px 4px rgba(99, 102, 241, 0.4)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
