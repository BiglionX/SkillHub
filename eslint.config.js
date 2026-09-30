const js = require("@eslint/js");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const reactHooksPlugin = require("eslint-plugin-react-hooks");
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
      "react-hooks": reactHooksPlugin,
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
      // react-hooks: 主规则 error（保 hooks 调用合法）；exhaustive-deps 仅 warn（存量 stagger 不阻断）
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
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
    // .mjs 脚本：与 .js 同样暴露 Node 全局；ESLint flat config 默认不会把 *.mjs 归入 *.js glob
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // 脚本里大量使用 console/process/Buffer/fetch 等 Node / Web 全局，避免与 *.js block 行为不一致
      "no-undef": "off",
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
