/** @type {import('tailwindcss').Config} */
// Design tokens — see STYLE_GUIDE.md for the rationale and usage rules.
// Color tokens come from index.css (HSL CSS variables) so the same names
// work in light + dark mode without component-level branches.
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      // Tighter horizontal padding than the old 2rem — the new look favors
      // breathing room from whitespace, not from outer gutters.
      padding: { DEFAULT: "1rem", sm: "1.5rem", lg: "2rem" },
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        // Inter loaded in index.html. Fallbacks cover the SSR-empty render
        // window and any offline state.
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        // Subtle elevation layer between background and card — for nested
        // surfaces (table headers, inset panels) that need to recede.
        surface: "hsl(var(--surface))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        // Semantic states — use these instead of raw red/green/amber/blue
        // so the design system stays the single source of truth.
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        // Tightened from the old 8px to 6px — smaller rounding reads as
        // more precise / modern at our text size.
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 3px)",
      },
      boxShadow: {
        // Soft elevation ladder — minimalist designs lean on shadow weight
        // rather than borders for visual hierarchy.
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.04)",
        sm: "0 1px 2px 0 rgb(0 0 0 / 0.05), 0 1px 3px 0 rgb(0 0 0 / 0.05)",
        DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        md: "0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
        lg: "0 10px 15px -3px rgb(0 0 0 / 0.06), 0 4px 6px -4px rgb(0 0 0 / 0.04)",
        // Used for floating panels (Sheet, dropdown). Slightly heavier so the
        // surface clearly separates from the page.
        overlay: "0 24px 48px -16px rgb(15 23 42 / 0.16), 0 4px 12px -2px rgb(15 23 42 / 0.06)",
      },
      fontSize: {
        // Tight scale tuned to Inter at 14–15px body. Letter-spacing reduces
        // slightly at larger sizes to keep headings from feeling loose.
        "2xs": ["0.6875rem", { lineHeight: "0.95rem" }],
        xs: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0" }],
        sm: ["0.8125rem", { lineHeight: "1.15rem" }],
        base: ["0.875rem", { lineHeight: "1.35rem" }],
        lg: ["1rem", { lineHeight: "1.5rem" }],
        xl: ["1.125rem", { lineHeight: "1.65rem", letterSpacing: "-0.005em" }],
        "2xl": ["1.375rem", { lineHeight: "1.85rem", letterSpacing: "-0.012em" }],
        "3xl": ["1.75rem", { lineHeight: "2.1rem", letterSpacing: "-0.02em" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem", letterSpacing: "-0.025em" }],
      },
      letterSpacing: {
        tightish: "-0.01em",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
