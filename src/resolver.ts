import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, relative, isAbsolute, extname } from "node:path";

// Extensions to try when resolving imports
const EXTENSIONS_TO_TRY = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".vue",
  ".svelte",
  ".astro",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".md",
  ".mdx",
];

// Index files to try
const INDEX_FILES = [
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
  "/index.mjs",
  "/index.cjs",
];

interface TsConfig {
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
}

interface PathAliases {
  baseUrl: string;
  paths: Map<string, string[]>;
}

export class Resolver {
  private rootDir: string;
  private aliases: PathAliases | null = null;
  private fileSet: Set<string>;

  constructor(rootDir: string, files: string[]) {
    this.rootDir = resolve(rootDir);
    this.fileSet = new Set(files.map((f) => f.replace(/\\/g, "/")));
    this.loadAliases();
  }

  private loadAliases(): void {
    // Try tsconfig.json first
    const tsconfigPath = join(this.rootDir, "tsconfig.json");
    if (existsSync(tsconfigPath)) {
      try {
        const content = readFileSync(tsconfigPath, "utf-8");
        // Remove comments (tsconfig allows them)
        const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
        const tsconfig: TsConfig = JSON.parse(noComments);

        if (tsconfig.compilerOptions) {
          const { baseUrl = ".", paths = {} } = tsconfig.compilerOptions;
          this.aliases = {
            baseUrl: resolve(this.rootDir, baseUrl),
            paths: new Map(Object.entries(paths)),
          };
        }
      } catch {
        // Invalid tsconfig
      }
    }

    // Try jsconfig.json as fallback
    if (!this.aliases) {
      const jsconfigPath = join(this.rootDir, "jsconfig.json");
      if (existsSync(jsconfigPath)) {
        try {
          const content = readFileSync(jsconfigPath, "utf-8");
          const jsconfig: TsConfig = JSON.parse(content);

          if (jsconfig.compilerOptions) {
            const { baseUrl = ".", paths = {} } = jsconfig.compilerOptions;
            this.aliases = {
              baseUrl: resolve(this.rootDir, baseUrl),
              paths: new Map(Object.entries(paths)),
            };
          }
        } catch {
          // Invalid jsconfig
        }
      }
    }
  }

  /**
   * Resolve an import path to a file path relative to rootDir
   */
  resolve(importPath: string, fromFile: string): string | null {
    // Skip external packages
    if (this.isExternalPackage(importPath)) {
      return null;
    }

    // Try different resolution strategies
    const strategies = [
      () => this.resolveRelative(importPath, fromFile),
      () => this.resolveAlias(importPath),
      () => this.resolveCommonAlias(importPath),
    ];

    for (const strategy of strategies) {
      const result = strategy();
      if (result) {
        return result;
      }
    }

    return null;
  }

  private isExternalPackage(importPath: string): boolean {
    // Relative imports
    if (importPath.startsWith(".") || importPath.startsWith("/")) {
      return false;
    }

    // Common aliases
    if (importPath.startsWith("@/") ||
        importPath.startsWith("~/") ||
        importPath.startsWith("#/") ||
        importPath.startsWith("$")) {
      return false;
    }

    // Check if it's a configured alias
    if (this.aliases) {
      for (const alias of this.aliases.paths.keys()) {
        const aliasPrefix = alias.replace(/\*$/, "");
        if (importPath.startsWith(aliasPrefix)) {
          return false;
        }
      }
    }

    // Scoped packages
    if (importPath.startsWith("@")) {
      // Check if it's not a common alias pattern
      const parts = importPath.split("/");
      if (parts.length >= 2 && !parts[0].endsWith("/")) {
        // Likely an npm scoped package like @org/package
        return true;
      }
    }

    // Check if it resolves to a file in the project
    // For now, assume non-relative, non-alias paths are external
    return true;
  }

  private resolveRelative(importPath: string, fromFile: string): string | null {
    if (!importPath.startsWith(".")) {
      return null;
    }

    const fromDir = dirname(fromFile);
    const absoluteFrom = resolve(this.rootDir, fromDir);
    const targetPath = resolve(absoluteFrom, importPath);
    const relativePath = relative(this.rootDir, targetPath).replace(/\\/g, "/");

    return this.tryExtensions(relativePath);
  }

  private resolveAlias(importPath: string): string | null {
    if (!this.aliases) return null;

    for (const [alias, targets] of this.aliases.paths) {
      if (alias.endsWith("/*")) {
        // Wildcard alias: "@/*" -> ["src/*"]
        const aliasPrefix = alias.slice(0, -2);
        if (importPath.startsWith(aliasPrefix + "/") || importPath === aliasPrefix) {
          for (const target of targets) {
            const targetPrefix = target.slice(0, -1); // Remove trailing *
            const restPath = importPath.slice(aliasPrefix.length);
            const fullTargetPath = join(this.aliases.baseUrl, targetPrefix + restPath);
            const relativePath = relative(this.rootDir, fullTargetPath).replace(/\\/g, "/");
            const resolved = this.tryExtensions(relativePath);
            if (resolved) return resolved;
          }
        }
      } else {
        // Exact alias
        if (importPath === alias) {
          for (const target of targets) {
            const fullTargetPath = join(this.aliases.baseUrl, target);
            const relativePath = relative(this.rootDir, fullTargetPath).replace(/\\/g, "/");
            const resolved = this.tryExtensions(relativePath);
            if (resolved) return resolved;
          }
        }
      }
    }

    return null;
  }

  private resolveCommonAlias(importPath: string): string | null {
    // Handle common aliases used in frameworks

    // @/ -> src/
    if (importPath.startsWith("@/")) {
      const restPath = importPath.slice(2);
      const resolved = this.tryExtensions(`src/${restPath}`);
      if (resolved) return resolved;

      // Also try without src/ prefix
      const directResolved = this.tryExtensions(restPath);
      if (directResolved) return directResolved;
    }

    // ~/ -> src/ (Nuxt style)
    if (importPath.startsWith("~/")) {
      const restPath = importPath.slice(2);
      const resolved = this.tryExtensions(`src/${restPath}`);
      if (resolved) return resolved;
    }

    // #/ -> src/ (some projects)
    if (importPath.startsWith("#/")) {
      const restPath = importPath.slice(2);
      const resolved = this.tryExtensions(`src/${restPath}`);
      if (resolved) return resolved;
    }

    // $lib/ -> src/lib/ (SvelteKit)
    if (importPath.startsWith("$lib/")) {
      const restPath = importPath.slice(5);
      const resolved = this.tryExtensions(`src/lib/${restPath}`);
      if (resolved) return resolved;
    }

    return null;
  }

  private tryExtensions(basePath: string): string | null {
    // Normalize path
    const normalizedBase = basePath.replace(/\\/g, "/");

    // If already has extension and exists
    if (extname(normalizedBase) && this.fileSet.has(normalizedBase)) {
      return normalizedBase;
    }

    // Try adding extensions
    for (const ext of EXTENSIONS_TO_TRY) {
      const pathWithExt = normalizedBase + ext;
      if (this.fileSet.has(pathWithExt)) {
        return pathWithExt;
      }
    }

    // Try index files
    for (const indexFile of INDEX_FILES) {
      const indexPath = normalizedBase + indexFile;
      if (this.fileSet.has(indexPath)) {
        return indexPath;
      }
    }

    // Handle the case where base path ends with extension but without it exists
    const withoutExt = normalizedBase.replace(/\.[^.]+$/, "");
    if (withoutExt !== normalizedBase) {
      for (const ext of EXTENSIONS_TO_TRY) {
        const pathWithExt = withoutExt + ext;
        if (this.fileSet.has(pathWithExt)) {
          return pathWithExt;
        }
      }
    }

    return null;
  }
}

export function createResolver(rootDir: string, files: string[]): Resolver {
  return new Resolver(rootDir, files);
}
