import { readFileSync } from "node:fs";

export interface ParsedImports {
  imports: string[];
  filePath: string;
}

// Regex patterns for different import types
const PATTERNS = {
  // ESM static imports: import x from "path", import { x } from "path", import "path"
  esmImport: /import\s+(?:(?:[\w*{}\s,]+)\s+from\s+)?["']([^"']+)["']/g,

  // Dynamic imports: import("path")
  dynamicImport: /import\s*\(\s*["']([^"']+)["']\s*\)/g,

  // CommonJS require: require("path"), require.resolve("path")
  commonjsRequire: /require(?:\.resolve)?\s*\(\s*["']([^"']+)["']\s*\)/g,

  // ESM re-exports: export { x } from "path", export * from "path"
  esmReexport: /export\s+(?:(?:[\w*{}\s,]+)\s+)?from\s+["']([^"']+)["']/g,

  // CSS @import: @import "path" or @import url("path")
  cssImport: /@import\s+(?:url\s*\(\s*)?["']?([^"';\s)]+)["']?(?:\s*\))?/g,

  // CSS url(): url("path")
  cssUrl: /url\s*\(\s*["']?([^"')]+)["']?\s*\)/g,

  // Jest mocks: jest.mock("path")
  jestMock: /jest\.mock\s*\(\s*["']([^"']+)["']/g,

  // Vitest mocks: vi.mock("path")
  vitestMock: /vi\.mock\s*\(\s*["']([^"']+)["']/g,

  // require.context (webpack): require.context("./path", ...)
  requireContext: /require\.context\s*\(\s*["']([^"']+)["']/g,

  // import.meta.glob (vite): import.meta.glob("./path/**/*")
  importMetaGlob: /import\.meta\.glob(?:Eager)?\s*\(\s*["']([^"']+)["']/g,
};

export function parseFile(filePath: string): ParsedImports {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return { imports: [], filePath };
  }

  const imports = new Set<string>();

  // Get file extension to determine parsing strategy
  const ext = getExtension(filePath);
  const isStyleFile = [".css", ".scss", ".sass", ".less", ".styl"].includes(ext);
  const isJsLike = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte", ".astro", ".md", ".mdx"].includes(ext);

  if (isJsLike) {
    // Remove comments to avoid false positives
    const noComments = removeComments(content);

    // Extract ESM imports
    extractMatches(noComments, PATTERNS.esmImport, imports);

    // Extract dynamic imports
    extractMatches(noComments, PATTERNS.dynamicImport, imports);

    // Extract CommonJS requires
    extractMatches(noComments, PATTERNS.commonjsRequire, imports);

    // Extract re-exports
    extractMatches(noComments, PATTERNS.esmReexport, imports);

    // Extract Jest mocks
    extractMatches(noComments, PATTERNS.jestMock, imports);

    // Extract Vitest mocks
    extractMatches(noComments, PATTERNS.vitestMock, imports);

    // Extract require.context
    extractMatches(noComments, PATTERNS.requireContext, imports);

    // Extract import.meta.glob
    extractMatches(noComments, PATTERNS.importMetaGlob, imports);

    // Extract CSS imports from JS (import "./style.css")
    // Already covered by ESM import pattern
  }

  if (isStyleFile) {
    // Extract CSS @import
    extractMatches(content, PATTERNS.cssImport, imports);

    // Extract url() references (images, fonts, etc.)
    extractMatches(content, PATTERNS.cssUrl, imports);
  }

  // Handle Vue/Svelte/Astro files - they may have style sections
  if (ext === ".vue" || ext === ".svelte" || ext === ".astro") {
    const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    if (styleMatch) {
      for (const style of styleMatch) {
        extractMatches(style, PATTERNS.cssImport, imports);
        extractMatches(style, PATTERNS.cssUrl, imports);
      }
    }
  }

  return {
    imports: Array.from(imports),
    filePath,
  };
}

function extractMatches(content: string, pattern: RegExp, imports: Set<string>): void {
  // Reset regex state
  pattern.lastIndex = 0;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath && isValidImportPath(importPath)) {
      imports.add(importPath);
    }
  }
}

function isValidImportPath(path: string): boolean {
  // Skip data URIs
  if (path.startsWith("data:")) return false;

  // Skip http/https URLs
  if (path.startsWith("http://") || path.startsWith("https://")) return false;

  // Skip protocol-relative URLs
  if (path.startsWith("//")) return false;

  // Skip empty paths
  if (!path.trim()) return false;

  // Skip Node.js built-in modules
  if (isBuiltinModule(path)) return false;

  return true;
}

function isBuiltinModule(name: string): boolean {
  const builtins = new Set([
    "assert", "buffer", "child_process", "cluster", "console", "constants",
    "crypto", "dgram", "dns", "domain", "events", "fs", "http", "https",
    "module", "net", "os", "path", "perf_hooks", "process", "punycode",
    "querystring", "readline", "repl", "stream", "string_decoder", "sys",
    "timers", "tls", "tty", "url", "util", "v8", "vm", "wasi", "worker_threads", "zlib",
    // Node.js with node: prefix handled separately
  ]);

  // Handle node: prefix
  const normalized = name.startsWith("node:") ? name.slice(5) : name;

  // Handle subpaths like fs/promises
  const baseName = normalized.split("/")[0];

  return builtins.has(baseName);
}

function removeComments(code: string): string {
  // Remove single-line comments
  let result = code.replace(/\/\/[^\n]*/g, "");

  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, "");

  return result;
}

function getExtension(filePath: string): string {
  const match = filePath.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : "";
}

export async function parseFiles(
  filePaths: string[],
  rootDir: string,
  concurrency: number = 10,
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, string[]>> {
  const { default: pLimit } = await import("p-limit");
  const limit = pLimit(concurrency);

  const results = new Map<string, string[]>();
  let completed = 0;

  const tasks = filePaths.map((relativePath) =>
    limit(async () => {
      const fullPath = `${rootDir}/${relativePath}`;
      const parsed = parseFile(fullPath);
      results.set(relativePath, parsed.imports);

      completed++;
      if (onProgress) {
        onProgress(completed, filePaths.length);
      }
    })
  );

  await Promise.all(tasks);

  return results;
}
