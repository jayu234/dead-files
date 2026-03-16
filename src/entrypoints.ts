import { existsSync, readFileSync } from "node:fs";
import { join, relative, basename, dirname } from "node:path";
import fg from "fast-glob";

interface PackageJson {
  main?: string;
  module?: string;
  bin?: string | Record<string, string>;
  exports?: string | Record<string, unknown>;
}

// Patterns that are always entry points
const ENTRY_POINT_PATTERNS = [
  // Config files
  "*.config.js",
  "*.config.ts",
  "*.config.mjs",
  "*.config.cjs",
  "vite.config.*",
  "next.config.*",
  "nuxt.config.*",
  "tailwind.config.*",
  "postcss.config.*",
  "jest.config.*",
  "vitest.config.*",
  "eslint.config.*",
  "babel.config.*",
  ".babelrc",
  ".babelrc.js",
  ".babelrc.cjs",
  "webpack.config.*",
  "rollup.config.*",
  "tsup.config.*",
  "esbuild.config.*",
  "playwright.config.*",
  "cypress.config.*",

  // Next.js app router
  "app/**/page.tsx",
  "app/**/page.jsx",
  "app/**/page.ts",
  "app/**/page.js",
  "app/**/layout.tsx",
  "app/**/layout.jsx",
  "app/**/layout.ts",
  "app/**/layout.js",
  "app/**/loading.tsx",
  "app/**/loading.jsx",
  "app/**/error.tsx",
  "app/**/error.jsx",
  "app/**/not-found.tsx",
  "app/**/not-found.jsx",
  "app/**/route.tsx",
  "app/**/route.ts",
  "app/**/route.js",
  "app/**/template.tsx",
  "app/**/template.jsx",
  "app/**/default.tsx",
  "app/**/default.jsx",
  "app/**/global-error.tsx",
  "app/**/global-error.jsx",

  // Next.js pages router
  "pages/**/*.tsx",
  "pages/**/*.jsx",
  "pages/**/*.ts",
  "pages/**/*.js",
  "src/pages/**/*.tsx",
  "src/pages/**/*.jsx",
  "src/pages/**/*.ts",
  "src/pages/**/*.js",

  // Remix routes
  "app/routes/**/*.tsx",
  "app/routes/**/*.jsx",

  // Common entry points
  "src/index.*",
  "src/main.*",
  "src/App.*",
  "src/app.*",
  "index.ts",
  "index.js",
  "main.ts",
  "main.js",

  // Test setup files
  "setupTests.*",
  "vitest.setup.*",
  "jest.setup.*",
  "test/setup.*",
  "tests/setup.*",
  "__tests__/setup.*",

  // Public assets (should be in public/ folder)
  "public/**",

  // Scripts folder
  "scripts/**",

  // Documentation
  "README*",
  "readme*",
  "LICENSE*",
  "license*",
  "CHANGELOG*",
  "changelog*",
  "CONTRIBUTING*",
  "contributing*",

  // Environment files
  ".env*",
  "env.*",

  // CI/CD and Docker
  "Dockerfile",
  "Dockerfile.*",
  "docker-compose.*",
  ".github/**",
  ".gitlab-ci.*",
  ".circleci/**",
  ".travis.yml",
  "Jenkinsfile",
  "azure-pipelines.yml",

  // Storybook
  ".storybook/**",
  "**/*.stories.tsx",
  "**/*.stories.jsx",
  "**/*.stories.ts",
  "**/*.stories.js",
  "**/*.story.tsx",
  "**/*.story.jsx",

  // Test files (commonly run directly)
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.test.js",
  "**/*.test.jsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/*.spec.js",
  "**/*.spec.jsx",
  "__tests__/**",
];

export function getEntryPointPatterns(): string[] {
  return [...ENTRY_POINT_PATTERNS];
}

export async function detectEntryPoints(rootDir: string): Promise<Set<string>> {
  const entryPoints = new Set<string>();

  // Read package.json if exists
  const packageJsonPath = join(rootDir, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg: PackageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

      // Add main
      if (pkg.main) {
        const mainPath = join(rootDir, pkg.main);
        entryPoints.add(relative(rootDir, mainPath));
      }

      // Add module
      if (pkg.module) {
        const modulePath = join(rootDir, pkg.module);
        entryPoints.add(relative(rootDir, modulePath));
      }

      // Add bin entries
      if (pkg.bin) {
        if (typeof pkg.bin === "string") {
          entryPoints.add(relative(rootDir, join(rootDir, pkg.bin)));
        } else {
          for (const binPath of Object.values(pkg.bin)) {
            entryPoints.add(relative(rootDir, join(rootDir, binPath)));
          }
        }
      }

      // Add exports entries
      if (pkg.exports) {
        extractExportPaths(pkg.exports, rootDir, entryPoints);
      }
    } catch {
      // Ignore invalid package.json
    }
  }

  // Match glob patterns for entry points
  const patternMatches = await fg(ENTRY_POINT_PATTERNS, {
    cwd: rootDir,
    ignore: ["node_modules/**", "dist/**", "build/**", ".next/**"],
    dot: true,
  });

  for (const match of patternMatches) {
    entryPoints.add(match);
  }

  return entryPoints;
}

function extractExportPaths(
  exports: unknown,
  rootDir: string,
  entryPoints: Set<string>
): void {
  if (typeof exports === "string") {
    entryPoints.add(relative(rootDir, join(rootDir, exports)));
  } else if (typeof exports === "object" && exports !== null) {
    for (const value of Object.values(exports)) {
      extractExportPaths(value, rootDir, entryPoints);
    }
  }
}

export function isEntryPoint(filePath: string, entryPoints: Set<string>): boolean {
  // Normalize the path
  const normalizedPath = filePath.replace(/\\/g, "/");

  // Direct match
  if (entryPoints.has(normalizedPath)) {
    return true;
  }

  // Check if any entry point pattern matches
  const name = basename(normalizedPath);
  const dir = dirname(normalizedPath);

  // Config files at root
  if (name.endsWith(".config.js") ||
      name.endsWith(".config.ts") ||
      name.endsWith(".config.mjs") ||
      name.endsWith(".config.cjs")) {
    return true;
  }

  // Storybook stories
  if (name.includes(".stories.") || name.includes(".story.")) {
    return true;
  }

  // Test files
  if (name.includes(".test.") || name.includes(".spec.") || dir.includes("__tests__")) {
    return true;
  }

  // Scripts folder
  if (normalizedPath.startsWith("scripts/")) {
    return true;
  }

  // Public folder
  if (normalizedPath.startsWith("public/")) {
    return true;
  }

  // GitHub/GitLab CI
  if (normalizedPath.startsWith(".github/") || normalizedPath.startsWith(".gitlab-ci")) {
    return true;
  }

  return false;
}
