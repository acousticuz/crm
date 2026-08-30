/** @type {import('tailwindcss').Config} */
// Soft Modern design tokens — see STYLE_GUIDE.md for the rationale.
// Every colour comes from the HSL CSS variables in src/index.css so the
// same names work in light + dark mode without component-level branching.
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1rem", sm: "1.5rem", lg: "2rem" },
      screens: { "2xl": "1400px" },
    },
    screens: {
      // Soft Modern brief — mobile-first breakpoints.
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      fontFamily: {
        // Body / UI face — Inter is the calm, exhaustively-supported choice
        // for an 8-hour-per-day operator workspace. No display flourishes.
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        // Headings + brand. Plus Jakarta Sans is geometric-humanist with
        // just enough character (single-storey 'a', round 'g') to feel
        // intentional without going retro. Used on h1–h4 by default.
        display: [
          "\"Plus Jakarta Sans\"",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        // Telephone numbers, extensions, durations, scores — anywhere a
        // column of digits has to line up. JetBrains Mono has tabular
        // numerals on by default and a friendly slashed zero.
        mono: [
          "\"JetBrains Mono\"",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: "hsl(var(--surface))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
          soft: "hsl(var(--accent-soft))",
          "soft-foreground": "hsl(var(--accent-soft-foreground))",
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
        // Semantic colours — every one ships as a pair (solid + soft).
        // Use the soft variant for chips/badges/banners; reserve solid for
        // primary buttons, dot indicators, focus rings.
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          soft: "hsl(var(--destructive-soft))",
          "soft-foreground": "hsl(var(--destructive-soft-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          soft: "hsl(var(--success-soft))",
          "soft-foreground": "hsl(var(--success-soft-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          soft: "hsl(var(--warning-soft))",
          "soft-foreground": "hsl(var(--warning-soft-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          soft: "hsl(var(--info-soft))",
          "soft-foreground": "hsl(var(--info-soft-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        // Soft Modern scale — 6 (subtle) / 10 (default) / 14 (cards) / 20 (sheets).
        sm: "0.375rem",   // 6px
        md: "0.625rem",   // 10px (= --radius)
        lg: "0.875rem",   // 14px
        xl: "1.25rem",    // 20px
      },
      boxShadow: {
        // Three soft tiers — card (resting), raised (hover), modal (overlay).
        // Shadows skew slightly cool so they don't muddy the warm canvas.
        card: "0 1px 3px rgba(15, 18, 16, 0.06), 0 1px 2px rgba(15, 18, 16, 0.04)",
        raised: "0 4px 12px rgba(15, 18, 16, 0.08), 0 2px 4px rgba(15, 18, 16, 0.04)",
        modal: "0 20px 60px rgba(15, 18, 16, 0.12), 0 8px 20px rgba(15, 18, 16, 0.06)",
        // Keep legacy aliases so we don't have to grep-replace every component
        // in this PR — they map to the new soft tiers.
        xs: "0 1px 3px rgba(15, 18, 16, 0.06), 0 1px 2px rgba(15, 18, 16, 0.04)",
        sm: "0 1px 3px rgba(15, 18, 16, 0.06), 0 1px 2px rgba(15, 18, 16, 0.04)",
        DEFAULT: "0 1px 3px rgba(15, 18, 16, 0.06), 0 1px 2px rgba(15, 18, 16, 0.04)",
        md: "0 4px 12px rgba(15, 18, 16, 0.08), 0 2px 4px rgba(15, 18, 16, 0.04)",
        lg: "0 8px 20px rgba(15, 18, 16, 0.10), 0 4px 8px rgba(15, 18, 16, 0.04)",
        overlay: "0 20px 60px rgba(15, 18, 16, 0.12), 0 8px 20px rgba(15, 18, 16, 0.06)",
      },
      fontSize: {
        // Type scale anchored on a 14px body. Display sizes get a slight
        // negative tracking so Plus Jakarta Sans reads compact at headline
        // sizes without losing its character.
        "2xs": ["0.6875rem", { lineHeight: "0.95rem" }],
        xs: ["0.75rem", { lineHeight: "1.05rem", letterSpacing: "0" }],
        sm: ["0.8125rem", { lineHeight: "1.2rem" }],
        base: ["0.875rem", { lineHeight: "1.4rem" }],
        md: ["1rem", { lineHeight: "1.55rem" }],
        lg: ["1.125rem", { lineHeight: "1.7rem", letterSpacing: "-0.005em" }],
        xl: ["1.25rem", { lineHeight: "1.8rem", letterSpacing: "-0.012em" }],
        "2xl": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.018em" }],
        "3xl": ["1.875rem", { lineHeight: "2.3rem", letterSpacing: "-0.025em" }],
        "4xl": ["2.25rem", { lineHeight: "2.55rem", letterSpacing: "-0.03em" }],
        "5xl": ["3rem", { lineHeight: "3.2rem", letterSpacing: "-0.035em" }],
      },
      letterSpacing: {
        tightish: "-0.012em",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
