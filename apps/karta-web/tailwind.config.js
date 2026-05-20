/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        // DOMOVINA brand
        brand: {
          navy: "#002F6C",
          red: "#FF0000",
        },
        // Semantic UI tokens — both light and dark resolve via CSS vars in styles.css
        ink: "var(--ink)",
        bg: "var(--bg)",
        "bg-2": "var(--bg-2)",
        "bg-3": "var(--bg-3)",
        line: "var(--line)",
        muted: "var(--muted)",
        text: "var(--text)",
        "ui-accent": "var(--ui-accent)",
        "accent-2": "var(--accent-2)",
        good: "var(--good)",
      },
    },
  },
  plugins: [],
};
