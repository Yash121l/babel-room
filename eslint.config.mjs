import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ["scripts/**/*.{mjs,cjs,js}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "apps/web/public/**",
      "apps/worker/worker-configuration.d.ts",
    ],
  },
);
