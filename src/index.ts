import { Command } from "commander";
import ora from "ora";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { scanDirectory } from "./scanner.js";
import { parseFiles } from "./parser.js";
import { createResolver } from "./resolver.js";
import { buildDependencyGraph, findDeadFiles } from "./graph.js";
import { detectEntryPoints, isEntryPoint } from "./entrypoints.js";
import { formatOutput, printError } from "./output.js";

interface CliOptions {
  ext?: string;
  includeAssets?: boolean;
  json?: boolean;
  absolute?: boolean;
  ignore?: string;
  gitignore?: boolean;
  quiet?: boolean;
}

async function getVersion(): Promise<string> {
  try {
    // Try to read version from package.json
    const packageJsonPath = new URL("../package.json", import.meta.url);
    const content = await readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    return pkg.version || "0.1.0";
  } catch {
    return "0.1.0";
  }
}

async function main(): Promise<void> {
  const version = await getVersion();

  const program = new Command();

  program
    .name("dead-files")
    .description("Find unused files in your codebase")
    .version(version)
    .argument("[directory]", "Root directory to scan", ".")
    .option("-e, --ext <exts>", "Comma-separated extensions to include")
    .option("--include-assets", "Also report unused image/font/svg files")
    .option("--json", "Output as JSON")
    .option("--absolute", "Print absolute paths")
    .option("--ignore <patterns>", "Additional glob patterns to ignore (comma-separated)")
    .option("--no-gitignore", "Disable .gitignore respect")
    .option("-q, --quiet", "Only print file paths, no summary")
    .action(async (directory: string, options: CliOptions) => {
      await run(directory, options);
    });

  await program.parseAsync();
}

async function run(directory: string, options: CliOptions): Promise<void> {
  const startTime = performance.now();
  const rootDir = resolve(directory);

  // Validate directory
  if (!existsSync(rootDir)) {
    printError(`Directory not found: ${rootDir}`);
    process.exit(1);
  }

  // Parse options
  const extensions = options.ext
    ? options.ext.split(",").map((e) => e.trim())
    : undefined;

  const ignorePatterns = options.ignore
    ? options.ignore.split(",").map((p) => p.trim())
    : [];

  // Create spinner
  const spinner = ora({
    text: "Scanning files...",
    discardStdin: false,
  });

  try {
    // Step 1: Scan directory
    spinner.start();
    spinner.text = "Scanning directory...";

    const scanResult = await scanDirectory(rootDir, {
      extensions,
      includeAssets: options.includeAssets,
      ignorePatterns,
      respectGitignore: options.gitignore !== false,
    });

    const allFiles = scanResult.files;
    const fileCount = allFiles.length;

    if (fileCount === 0) {
      spinner.stop();
      console.log("\nNo source files found in the directory.\n");
      return;
    }

    spinner.text = `Found ${fileCount} files. Parsing imports...`;

    // Step 2: Parse all files for imports
    const parsedImports = await parseFiles(
      allFiles,
      rootDir,
      10,
      (current, total) => {
        if (total > 100) {
          spinner.text = `Parsing imports... ${current}/${total}`;
        }
      }
    );

    spinner.text = "Building dependency graph...";

    // Step 3: Create resolver and build dependency graph
    const resolver = createResolver(rootDir, allFiles);
    const graph = buildDependencyGraph(allFiles, parsedImports, resolver);

    spinner.text = "Detecting entry points...";

    // Step 4: Detect entry points
    const entryPoints = await detectEntryPoints(rootDir);

    // Add manual entry point detection for files that match patterns
    for (const file of allFiles) {
      if (isEntryPoint(file, entryPoints)) {
        entryPoints.add(file);
      }
    }

    spinner.text = "Finding unused files...";

    // Step 5: Find dead files
    const deadFiles = findDeadFiles(graph, entryPoints);

    spinner.stop();

    // Step 6: Output results
    const endTime = performance.now();
    const durationMs = endTime - startTime;

    const output = formatOutput(deadFiles, fileCount, directory, durationMs, {
      json: options.json,
      absolute: options.absolute,
      quiet: options.quiet,
      rootDir,
    });

    console.log(output);

    // Exit with code 1 if unused files found (useful for CI)
    if (deadFiles.length > 0 && !options.json) {
      process.exit(1);
    }
  } catch (error) {
    spinner.stop();
    const message = error instanceof Error ? error.message : String(error);
    printError(message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
