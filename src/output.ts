import { resolve } from "node:path";

export interface OutputOptions {
  json?: boolean;
  absolute?: boolean;
  quiet?: boolean;
  rootDir: string;
}

export interface ScanSummary {
  root: string;
  scanned: number;
  unused: string[];
  durationMs: number;
}

export function formatOutput(
  deadFiles: string[],
  totalScanned: number,
  rootDir: string,
  durationMs: number,
  options: OutputOptions
): string {
  const { json = false, absolute = false, quiet = false } = options;

  // Convert paths if needed
  const filePaths = absolute
    ? deadFiles.map((f) => resolve(rootDir, f))
    : deadFiles;

  if (json) {
    return formatJson(filePaths, totalScanned, rootDir, durationMs);
  }

  if (quiet) {
    return formatQuiet(filePaths);
  }

  return formatHuman(filePaths, totalScanned, rootDir, durationMs);
}

function formatJson(
  files: string[],
  scanned: number,
  root: string,
  durationMs: number
): string {
  const output: ScanSummary = {
    root: resolve(root),
    scanned,
    unused: files,
    durationMs: Math.round(durationMs),
  };

  return JSON.stringify(output, null, 2);
}

function formatQuiet(files: string[]): string {
  return files.join("\n");
}

function formatHuman(
  files: string[],
  scanned: number,
  root: string,
  durationMs: number
): string {
  const lines: string[] = [];

  // Header
  const count = files.length;
  const rootDisplay = root === "." ? "current directory" : root;

  if (count === 0) {
    lines.push("");
    lines.push(`\x1b[32m✓\x1b[0m No unused files found in ${rootDisplay}`);
    lines.push(`  Scanned ${scanned} files in ${formatDuration(durationMs)}`);
    lines.push("");
  } else {
    lines.push("");
    lines.push(
      `\x1b[33mdead-files\x1b[0m — ${count} unused file${count === 1 ? "" : "s"} found in ${rootDisplay}`
    );
    lines.push("");

    // File list
    for (const file of files) {
      lines.push(`  \x1b[31m•\x1b[0m ${file}`);
    }

    lines.push("");
    lines.push(
      `  Scanned ${scanned} files in ${formatDuration(durationMs)}`
    );
    lines.push(`  Run with \x1b[36m--json\x1b[0m for machine-readable output.`);
    lines.push("");
  }

  return lines.join("\n");
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

export function printError(message: string): void {
  console.error(`\x1b[31mError:\x1b[0m ${message}`);
}

export function printWarning(message: string): void {
  console.error(`\x1b[33mWarning:\x1b[0m ${message}`);
}
