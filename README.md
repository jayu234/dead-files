# dead-files

Find unused files in your JavaScript/TypeScript codebase.

## Installation

```bash
npm install -g dead-files
```

Or with other package managers:

```bash
pnpm add -g dead-files
yarn global add dead-files
```

## Usage

```bash
# Scan current directory
dead-files

# Scan a specific directory
dead-files ./src

# Output as JSON (useful for CI/scripting)
dead-files --json

# Include asset files (images, fonts, etc.)
dead-files --include-assets

# Show absolute paths
dead-files --absolute

# Only specific extensions
dead-files -e ts,tsx

# Add custom ignore patterns
dead-files --ignore "**/__mocks__/**,**/fixtures/**"
```

## CLI Options

```
Usage: dead-files [directory] [options]

Arguments:
  directory              Root directory to scan (default: current directory)

Options:
  -e, --ext <exts>       Comma-separated extensions to include
  --include-assets       Also report unused image/font/svg files
  --json                 Output as JSON
  --absolute             Print absolute paths
  --ignore <patterns>    Additional glob patterns to ignore (comma-separated)
  --no-gitignore         Disable .gitignore respect
  -q, --quiet            Only print file paths, no summary
  -V, --version          Print version
  -h, --help             Print help
```

## Output

### Human-readable (default)

```
dead-files — 3 unused files found in ./src

  • src/components/OldButton.tsx
  • src/utils/deprecated-helper.ts
  • src/styles/legacy.css

  Scanned 142 files in 234ms
  Run with --json for machine-readable output.
```

### JSON mode

```json
{
  "root": "/Users/you/my-project",
  "scanned": 142,
  "unused": [
    "src/components/OldButton.tsx",
    "src/utils/deprecated-helper.ts",
    "src/styles/legacy.css"
  ],
  "durationMs": 234
}
```

## What it detects

dead-files parses all your source files and detects imports in:

- **ESM static imports**: `import x from "./foo"`
- **ESM dynamic imports**: `import("./lazy-module")`
- **CommonJS**: `require("./something")`
- **Re-exports**: `export { x } from "./module"`
- **CSS/SCSS imports**: `@import "./styles"`
- **Jest/Vitest mocks**: `jest.mock("./module")`
- **Webpack require.context**: `require.context("./icons")`
- **Vite glob imports**: `import.meta.glob("./modules/*")`

## Entry Point Detection

These files are **never** marked as unused (they're entry points):

### Package exports

- `package.json` `main`, `module`, `bin`, and `exports` fields

### Framework pages/routes

- **Next.js**: `pages/`**, `app/**/page.tsx`, `app/**/layout.tsx`, etc.
- **Remix**: `app/routes/`**
- **SvelteKit**: Uses `$lib` alias resolution

### Config files

- `*.config.js`, `*.config.ts`
- `vite.config.*`, `next.config.*`, `tailwind.config.*`
- `jest.config.*`, `vitest.config.*`, `eslint.config.*`
- `.babelrc`, `babel.config.*`

### Other entry points

- `src/index.*`, `src/main.*`, `src/App.*`
- `setupTests.*`, `vitest.setup.*`
- `public/`**, `scripts/`**
- Test files (`*.test.ts`, `*.spec.ts`, `__tests__/**`)
- Storybook stories (`*.stories.tsx`)

## Path Resolution

dead-files understands:

- **Relative imports**: `./foo`, `../bar/baz`
- **TypeScript paths**: Reads `tsconfig.json` `paths` and `baseUrl`
- **Common aliases**: `@/`, `~/`, `#/`, `$lib/`
- **Extensionless imports**: Tries `.ts`, `.tsx`, `.js`, etc.
- **Index files**: `./components` → `./components/index.ts`

## Default Ignores

These are always skipped:

```
node_modules/
.git/
dist/
build/
.next/
.nuxt/
.turbo/
coverage/
*.d.ts
*.min.js
*.map
```

## Adding Custom Ignores

Use `--ignore` to skip additional patterns:

```bash
dead-files --ignore "**/__mocks__/**,**/fixtures/**,**/generated/**"
```

Or disable `.gitignore` respect:

```bash
dead-files --no-gitignore
```

## CI Integration

dead-files exits with code 1 when unused files are found. Use in CI:

```yaml
# GitHub Actions
- name: Check for unused files
  run: npx dead-files --json
```

```yaml
# GitLab CI
dead-files:
  script:
    - npx dead-files
  allow_failure: false
```

## Performance

- Handles 10,000+ file codebases efficiently
- Uses async concurrency for parsing
- Shows progress spinner for large scans
- No heavy AST parsing (regex-based extraction)

## Requirements

- Node.js >= 18

## License

MIT