import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    ignores: [
      "node_modules/**",
      "main.js",
      "scripts/**",
      "tests/.cli.js",
      "tests/.smoke.js",
      "skills/spaced-dive/spaced-dive.cjs",
    ],
  },

  // The rules the community review runs.
  ...obsidianmd.configs.recommended,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*"],
        },
      },
    },
  },

  // The command-line entry point is a Node program, not plugin code: it is
  // bundled separately, shipped as a build artifact, and never loaded by
  // Obsidian. The mobile-compatibility and Vault-API rules therefore do not
  // apply to it.
  {
    files: ["src/cli.ts", "src/cli/**/*.ts"],
    languageOptions: {
      globals: {
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        console: "readonly",
      },
    },
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/no-unsupported-api": "off",
      // It runs outside Obsidian, so there is no Vault#configDir to ask. The
      // only way to find a vault from the command line is to look for its
      // configuration folder on disk.
      "obsidianmd/hardcoded-config-path": "off",
    },
  },
]);
