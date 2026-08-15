const js = require("@eslint/js");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-unused-vars": "off", // Handled by @typescript-eslint/no-unused-vars
      // TS 类型（如 NodeJS.Timeout、import type）由 tsc 检查，核心 no-undef 会产生误报
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn", 
        { 
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_",
          "ignoreRestSiblings": true,
          "args": "after-used"
        }
      ],
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
  {
    files: ["packages/widget/src/types.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off"
    }
  },
  {
    files: ["**/cypress/**/*.ts", "**/cypress/**/*.tsx"],
    languageOptions: {
      globals: {
        cy: "readonly",
        Cypress: "readonly",
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        before: "readonly",
        after: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        context: "readonly",
      },
    },
    rules: {
      "no-undef": "off", // Cypress 全局变量由类型定义提供
    },
  },
  {
    // Jest 单元测试：声明 jest 全局（含 jest-circus 的 fail）
    files: ["**/__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.jest,
        fail: "readonly", // jest-circus 提供
      },
    },
  },
  {
    files: ["**/tests/**/*.ts", "**/tests/**/*.tsx"],
    languageOptions: {
      globals: {
        // Playwright 全局变量在测试文件中通过导入使用，不需要额外配置
      },
    },
  },
  {
    files: ["playwright.config.ts"],
    languageOptions: {
      parserOptions: {
        project: "./playwright.tsconfig.json",
      },
    },
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "node_modules/**",
      "deer-flow/**",
      "temp/**",
      "eslint.config.js",
    ],
  },
];
