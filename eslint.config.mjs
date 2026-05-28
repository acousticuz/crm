// Flat ESLint config for the whole monorepo (backend, frontend,
// telephony-worker, ai-worker, shared). Non-type-checked recommended set —
// fast and no per-file tsconfig project needed. TypeScript itself handles
// type errors at build time; ESLint catches lint-level issues.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.prisma/**",
      "**/coverage/**",
      // Generated / config / plain-JS scripts are not linted.
      "**/*.config.js",
      "**/*.config.mjs",
      "**/*.config.cjs",
      "**/*.config.ts",
      "**/scripts/**",
      "prisma/**",
      "eslint.config.mjs",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      // Both Node and browser globals — backend/workers are Node, frontend is
      // browser. TypeScript already enforces correct usage per package.
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // TypeScript handles undefined-symbol checking; no-undef double-reports.
      "no-undef": "off",
      // We intentionally use a few `any`/casts at framework boundaries
      // (Prisma extension, NestJS guards). Build-time strictness covers types.
      "@typescript-eslint/no-explicit-any": "off",
      // Dynamic require is intentional in the AMI client (optional native dep).
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",
      // shadcn/ui components legitimately declare empty interfaces that extend
      // a DOM props type (e.g. InputProps extends InputHTMLAttributes).
      "@typescript-eslint/no-empty-object-type": "off",
      // Unused vars are warnings, not errors; underscore-prefixed are ignored.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-console": "off",
    },
  },

  // Jest globals for the backend test suite.
  {
    files: ["**/test/**/*.ts", "**/*.spec.ts"],
    languageOptions: {
      globals: { ...globals.jest },
    },
  },
);
