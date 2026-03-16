import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import ignore, { Ignore } from "ignore";

// Default directories to always skip
const DEFAULT_IGNORE_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "coverage",
  ".nyc_output",
  ".vercel",
  ".netlify",
  ".svelte-kit",
  ".output",
  ".parcel-cache",
];

// Default file patterns to skip
const DEFAULT_IGNORE_FILES = [
  "*.d.ts",
  "*.min.js",
  "*.min.css",
  "*.map",
  "*.lock",
  "*.log",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
];

// Source file extensions to scan
const SOURCE_EXTENSIONS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".svelte",
  ".astro",
  ".md",
  ".mdx",
];

// Style file extensions
const STYLE_EXTENSIONS = [
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".styl",
  ".stylus",
];

// Asset file extensions
const ASSET_EXTENSIONS = [
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".mp4",
  ".webm",
  ".ogg",
  ".mp3",
  ".wav",
  ".json",
];

export interface ScanOptions {
  extensions?: string[];
  includeAssets?: boolean;
  ignorePatterns?: string[];
  respectGitignore?: boolean;
}

export interface ScanResult {
  files: string[];
  sourceFiles: string[];
  styleFiles: string[];
  assetFiles: string[];
}

function createIgnoreMatcher(rootDir: string, respectGitignore: boolean): Ignore {
  const ig = ignore();

  // Add default ignores
  for (const dir of DEFAULT_IGNORE_DIRS) {
    ig.add(`${dir}/`);
    ig.add(`**/${dir}/`);
  }
  for (const pattern of DEFAULT_IGNORE_FILES) {
    ig.add(pattern);
  }

  // Read .gitignore if requested
  if (respectGitignore) {
    const gitignorePath = join(rootDir, ".gitignore");
    if (existsSync(gitignorePath)) {
      try {
        const gitignoreContent = readFileSync(gitignorePath, "utf-8");
        ig.add(gitignoreContent);
      } catch {
        // Ignore read errors
      }
    }
  }

  return ig;
}

export async function scanDirectory(
  rootDir: string,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const {
    extensions,
    includeAssets = false,
    ignorePatterns = [],
    respectGitignore = true,
  } = options;

  // Verify directory exists
  if (!existsSync(rootDir)) {
    throw new Error(`Directory not found: ${rootDir}`);
  }

  const stat = statSync(rootDir);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${rootDir}`);
  }

  // Build extension list
  let extList: string[];
  if (extensions && extensions.length > 0) {
    extList = extensions.map((e) => (e.startsWith(".") ? e : `.${e}`));
  } else {
    extList = [...SOURCE_EXTENSIONS, ...STYLE_EXTENSIONS];
    if (includeAssets) {
      extList.push(...ASSET_EXTENSIONS);
    }
  }

  // Build glob patterns
  const patterns = extList.map((ext) => `**/*${ext}`);

  // Build ignore patterns
  const ignoreList = [
    ...DEFAULT_IGNORE_DIRS.map((d) => `**/${d}/**`),
    ...DEFAULT_IGNORE_FILES,
    ...ignorePatterns,
  ];

  // Create gitignore matcher
  const ig = createIgnoreMatcher(rootDir, respectGitignore);

  // Scan files
  const allFiles = await fg(patterns, {
    cwd: rootDir,
    ignore: ignoreList,
    dot: false,
    absolute: false,
    followSymbolicLinks: false,
    onlyFiles: true,
  });

  // Filter through gitignore
  const files = allFiles.filter((f) => !ig.ignores(f));

  // Categorize files
  const sourceFiles: string[] = [];
  const styleFiles: string[] = [];
  const assetFiles: string[] = [];

  for (const file of files) {
    const ext = getExtension(file);
    if (SOURCE_EXTENSIONS.includes(ext)) {
      sourceFiles.push(file);
    } else if (STYLE_EXTENSIONS.includes(ext)) {
      styleFiles.push(file);
    } else if (ASSET_EXTENSIONS.includes(ext)) {
      assetFiles.push(file);
    }
  }

  return {
    files,
    sourceFiles,
    styleFiles,
    assetFiles,
  };
}

function getExtension(filePath: string): string {
  const match = filePath.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : "";
}

export function getSourceExtensions(): string[] {
  return [...SOURCE_EXTENSIONS];
}

export function getStyleExtensions(): string[] {
  return [...STYLE_EXTENSIONS];
}

export function getAssetExtensions(): string[] {
  return [...ASSET_EXTENSIONS];
}
