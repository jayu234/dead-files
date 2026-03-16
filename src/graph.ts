import { Resolver } from "./resolver.js";

export interface DependencyGraph {
  // Map from file -> files that import it
  importedBy: Map<string, Set<string>>;
  // Map from file -> files it imports
  imports: Map<string, Set<string>>;
  // Files that couldn't be resolved
  unresolvedImports: Map<string, string[]>;
}

export function buildDependencyGraph(
  files: string[],
  parsedImports: Map<string, string[]>,
  resolver: Resolver
): DependencyGraph {
  const importedBy = new Map<string, Set<string>>();
  const imports = new Map<string, Set<string>>();
  const unresolvedImports = new Map<string, string[]>();

  // Initialize all files with empty sets
  for (const file of files) {
    importedBy.set(file, new Set());
    imports.set(file, new Set());
  }

  // Build the graph
  for (const [file, fileImports] of parsedImports) {
    const unresolved: string[] = [];

    for (const importPath of fileImports) {
      const resolved = resolver.resolve(importPath, file);

      if (resolved) {
        // Add to imports map
        const fileImportsSet = imports.get(file);
        if (fileImportsSet) {
          fileImportsSet.add(resolved);
        }

        // Add to importedBy map
        let importers = importedBy.get(resolved);
        if (!importers) {
          importers = new Set();
          importedBy.set(resolved, importers);
        }
        importers.add(file);
      } else if (isLocalPath(importPath)) {
        // Track unresolved local imports
        unresolved.push(importPath);
      }
    }

    if (unresolved.length > 0) {
      unresolvedImports.set(file, unresolved);
    }
  }

  return {
    importedBy,
    imports,
    unresolvedImports,
  };
}

function isLocalPath(importPath: string): boolean {
  return (
    importPath.startsWith("./") ||
    importPath.startsWith("../") ||
    importPath.startsWith("@/") ||
    importPath.startsWith("~/") ||
    importPath.startsWith("#/") ||
    importPath.startsWith("$lib/")
  );
}

export function findDeadFiles(
  graph: DependencyGraph,
  entryPoints: Set<string>
): string[] {
  const deadFiles: string[] = [];

  for (const [file, importers] of graph.importedBy) {
    // A file is dead if:
    // 1. No other file imports it (importers.size === 0)
    // 2. It's not an entry point
    if (importers.size === 0 && !isEntryPointFile(file, entryPoints)) {
      deadFiles.push(file);
    }
  }

  // Sort alphabetically for consistent output
  return deadFiles.sort();
}

function isEntryPointFile(file: string, entryPoints: Set<string>): boolean {
  // Direct match
  if (entryPoints.has(file)) {
    return true;
  }

  // Normalize and check
  const normalized = file.replace(/\\/g, "/");
  if (entryPoints.has(normalized)) {
    return true;
  }

  // Check patterns in entryPoints set
  for (const entry of entryPoints) {
    // Handle glob-like matches
    if (matchesEntry(normalized, entry)) {
      return true;
    }
  }

  return false;
}

function matchesEntry(file: string, entryPattern: string): boolean {
  // Exact match
  if (file === entryPattern) return true;

  // Handle common patterns
  const normalizedFile = file.replace(/\\/g, "/");
  const normalizedPattern = entryPattern.replace(/\\/g, "/");

  // Check if file starts with pattern (for directory matches)
  if (normalizedPattern.endsWith("/") && normalizedFile.startsWith(normalizedPattern)) {
    return true;
  }

  // Simple glob matching for ** patterns
  if (normalizedPattern.includes("**")) {
    const parts = normalizedPattern.split("**");
    if (parts.length === 2) {
      const [prefix, suffix] = parts;
      const matchesPrefix = prefix === "" || normalizedFile.startsWith(prefix);
      const matchesSuffix = suffix === "" || normalizedFile.endsWith(suffix.replace(/^\//, ""));
      if (matchesPrefix && matchesSuffix) {
        return true;
      }
    }
  }

  return false;
}

export function getFileStats(graph: DependencyGraph): {
  totalFiles: number;
  totalImports: number;
  averageImportsPerFile: number;
  filesWithMostImporters: Array<{ file: string; count: number }>;
} {
  let totalImports = 0;
  const importerCounts: Array<{ file: string; count: number }> = [];

  for (const [file, importers] of graph.importedBy) {
    totalImports += importers.size;
    importerCounts.push({ file, count: importers.size });
  }

  // Sort by count descending
  importerCounts.sort((a, b) => b.count - a.count);

  return {
    totalFiles: graph.importedBy.size,
    totalImports,
    averageImportsPerFile: graph.importedBy.size > 0 ? totalImports / graph.importedBy.size : 0,
    filesWithMostImporters: importerCounts.slice(0, 10),
  };
}
