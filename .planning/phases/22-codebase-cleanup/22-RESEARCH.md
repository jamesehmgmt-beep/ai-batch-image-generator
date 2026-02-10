# Phase 22: Codebase Cleanup - Research

**Researched:** 2026-01-31
**Domain:** Codebase maintenance, dead code detection, TypeScript cleanup
**Confidence:** HIGH

## Summary

Codebase cleanup is a critical maintenance task that removes unused code, orphaned files, and development artifacts to reduce technical debt and improve maintainability. For TypeScript/Next.js projects, the standard approach combines automated detection tools with manual verification to safely identify and remove dead code without breaking production.

The research identified three primary cleanup categories: (1) unused dependencies and exports, (2) orphaned test files and unused source files, and (3) development debugging code like console.log statements. Modern tooling has matured significantly, with Knip emerging as the industry standard for comprehensive dead code detection in 2026, offering Next.js-specific plugins and reporting 300K+ lines of code removed at Vercel.

For this phase, the cleanup targets are specific: removing Gemini-related files after Claude migration (CLEN-01), cleaning orphaned test files (CLEN-02), and removing debugging code (CLEN-03). The recommended approach uses Knip for automated detection, eslint-plugin-unused-imports for import cleanup with autofix, and manual verification with git clean dry-runs before any deletions.

**Primary recommendation:** Use Knip for comprehensive dead code detection, verify findings with TypeScript compilation and existing tests, then delete in small batches with git commits after each verification cycle.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Knip | Latest | Find unused files, exports, dependencies | 100+ framework plugins, used at Vercel, most comprehensive 2026 solution |
| eslint-plugin-unused-imports | Latest | Remove unused imports with autofix | Provides automatic fixes, splits no-unused-vars rule for better control |
| TypeScript Compiler | 5.x | Detect unused locals with --noUnusedLocals | Built-in, zero config, catches unused variables during compilation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ts-prune | Latest (maintenance mode) | Find unused exports | Lightweight alternative to Knip, zero config, but limited to exports only |
| depcheck | Latest | Find unused npm dependencies | Specialized dependency analysis, use alongside Knip for verification |
| git clean | Built-in | Remove untracked files safely | Final cleanup step after code deletions create untracked artifacts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Knip | ts-prune + depcheck | Knip is comprehensive with framework awareness; alternatives require multiple tools and miss dead files |
| eslint-plugin-unused-imports | Manual import cleanup | Manual is error-prone and time-consuming; autofix is reliable and fast |
| Automated tools | Manual grep/find | Manual search cannot track usage relationships across files; tools use AST analysis |

**Installation:**
```bash
npm install --save-dev knip eslint-plugin-unused-imports
```

## Architecture Patterns

### Recommended Cleanup Workflow
```
1. Detection Phase
   ├── Run Knip to identify all unused code
   ├── Run ESLint with unused-imports plugin
   └── Review TypeScript compiler warnings

2. Verification Phase
   ├── Review Knip findings for false positives
   ├── Check if code is actively developed (has tests, used in Storybook)
   ├── Verify no dynamic imports or string-based usage
   └── Run full test suite to ensure no regressions

3. Deletion Phase (batched)
   ├── Delete Category 1 (e.g., old Gemini files)
   ├── Run TypeScript compilation
   ├── Run test suite
   ├── Git commit
   ├── Repeat for next category
   └── Final git clean for untracked artifacts

4. Validation Phase
   ├── Full TypeScript build
   ├── All tests passing
   ├── Manual smoke test of core flows
   └── Production build verification
```

### Pattern 1: Safe File Deletion with Git
**What:** Always use git clean dry-run before actual deletion to preview what will be removed
**When to use:** When removing untracked files or cleaning up after code deletions
**Example:**
```bash
# Step 1: Preview what will be deleted (ALWAYS DO THIS FIRST)
git clean -n

# Step 2: Review the list carefully - untracked files cannot be recovered

# Step 3: If safe, remove untracked files
git clean -f

# Step 4: For directories, add -d flag
git clean -fd

# Alternative: Use interactive mode for selective deletion
git clean -i
```

### Pattern 2: Batch Deletion with Verification
**What:** Delete code in small batches, verify after each batch, commit immediately
**When to use:** All cleanup operations to enable rollback and catch regressions early
**Example:**
```bash
# Batch 1: Remove Gemini files
rm lib/ai/gemini.ts lib/ai/gemini-parser.ts lib/ai/gemini-parser.test.ts

# Verify TypeScript compiles
npm run build

# Verify tests pass
npm test

# Commit immediately
git add -A
git commit -m "chore: remove Gemini AI integration files"

# Batch 2: Next category
# ... repeat process
```

### Pattern 3: ESLint Autofix for Import Cleanup
**What:** Configure ESLint to automatically remove unused imports across the entire codebase
**When to use:** After removing code that was being imported elsewhere, or as regular maintenance
**Example:**
```json
// .eslintrc.json or eslint.config.js
{
  "plugins": ["unused-imports"],
  "rules": {
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "unused-imports/no-unused-imports": "error",
    "unused-imports/no-unused-vars": [
      "warn",
      {
        "vars": "all",
        "varsIgnorePattern": "^_",
        "args": "after-used",
        "argsIgnorePattern": "^_"
      }
    ]
  }
}
```

```bash
# Run autofix across entire project
npx eslint . --fix
```

### Pattern 4: Knip Configuration for Next.js
**What:** Configure Knip with Next.js plugin for accurate detection
**When to use:** Initial setup before running cleanup
**Example:**
```json
// knip.json
{
  "entry": ["app/**/*.{ts,tsx}", "lib/**/*.ts", "components/**/*.tsx"],
  "project": ["**/*.{ts,tsx}"],
  "ignore": [
    "**/__tests__/**",
    "**/*.test.{ts,tsx}",
    "**/*.spec.{ts,tsx}",
    "e2e/**",
    ".next/**",
    "node_modules/**"
  ],
  "ignoreDependencies": ["@types/*"]
}
```

```bash
# Run Knip to detect dead code
npx knip

# For production mode (stricter, finds code with only test usage)
npx knip --production
```

### Anti-Patterns to Avoid
- **Deleting everything Knip reports without review:** Tools can have false positives for dynamic imports, string-based imports, or work-in-progress code tested via Storybook
- **No verification between deletions:** One big deletion followed by debugging is harder than small batches with immediate verification
- **Skipping test runs:** Deleting "unused" code that's actually loaded dynamically will only surface at runtime
- **Manual import cleanup:** Time-consuming and error-prone; use eslint-plugin-unused-imports autofix instead
- **Using git clean without dry-run:** Deleted untracked files cannot be recovered from git history

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Finding unused exports | Manual grep for export statements | Knip or ts-prune | Tools use TypeScript AST to track imports/exports relationships across files; grep cannot detect actual usage |
| Removing console.log statements | Manual search and delete | ESLint no-console rule + build-time removal | Easily miss statements, manual is error-prone; ESLint catches all + prevents future additions |
| Detecting unused dependencies | Check package.json manually | Knip or depcheck | Dependencies may be used indirectly or in config files; tools parse all requires/imports |
| Cleaning orphaned test files | Manual file comparison | Knip with test file detection | Test files may test deleted code; Knip identifies tests with no corresponding source |
| Finding dead files | Search for references | Knip unused files detection | Files may be imported via aliases, dynamic imports, or webpack loaders; tools understand module resolution |

**Key insight:** Code relationships are complex graphs, not simple lists. Manual analysis cannot track transitive dependencies, dynamic imports, or framework-specific loading patterns. Modern tools use AST parsing and module resolution to build accurate usage graphs.

## Common Pitfalls

### Pitfall 1: False Positives from Dynamic Imports
**What goes wrong:** Knip reports a file as unused, but it's actually loaded via dynamic import() or require() with string variables
**Why it happens:** Static analysis tools cannot always resolve dynamic string-based imports
**How to avoid:**
- Review Knip findings for files in plugin directories, config loaders, or route handlers
- Search codebase for the filename as a string literal
- Check for Next.js dynamic imports: `dynamic(() => import('./component'))`
**Warning signs:** File in `/api/`, `/plugins/`, or has "loader", "handler", "strategy" in name

### Pitfall 2: Deleting Work-In-Progress Code
**What goes wrong:** Code appears unused but is actively being developed and tested via Storybook or isolated unit tests
**Why it happens:** Knip correctly identifies code as unused in the main app, but doesn't know it's WIP
**How to avoid:**
- Check git log for recent commits to the file
- Look for corresponding .stories.tsx or .test.ts files
- Ask team if unsure about unfamiliar code
- Use Knip's ignore patterns for WIP directories
**Warning signs:** Recent commits, test files exist, Storybook stories present

### Pitfall 3: Breaking Production with Batch Delete
**What goes wrong:** Delete many files at once, run into TypeScript errors, can't easily identify which deletion caused the issue
**Why it happens:** Trying to cleanup too much at once without verification checkpoints
**How to avoid:**
- Delete in small batches (5-10 files max)
- Run `npm run build` after each batch
- Run `npm test` after each batch
- Commit after each successful verification
- If errors occur, easy to revert last commit
**Warning signs:** TypeScript errors mentioning multiple missing modules, cannot find module errors cascading

### Pitfall 4: Permanently Losing Untracked Files
**What goes wrong:** Run `git clean -f` without dry-run, delete important untracked config files or local development artifacts
**Why it happens:** git clean is destructive and irreversible for untracked files
**How to avoid:**
- ALWAYS run `git clean -n` first (dry-run)
- Review the list carefully before proceeding
- Check .gitignore to understand what's untracked
- Consider `git stash` as safer alternative for temporary cleanup
- Use interactive mode `git clean -i` for selective control
**Warning signs:** Files with .env, .local, config in name; files in root directory

### Pitfall 5: Removing Console Logs That Are Actually Needed
**What goes wrong:** Automated removal deletes console.error or console.warn that provide critical debugging info in production
**Why it happens:** Overly aggressive ESLint rules or build tools remove ALL console statements
**How to avoid:**
- Configure ESLint to allow console.error and console.warn
- Only remove console.log and console.debug
- Keep structured logging for production errors
- Review removal PRs manually
**Warning signs:** Error handling code loses visibility, production debugging becomes harder

### Pitfall 6: Not Verifying Unused Dependencies Before Removal
**What goes wrong:** Remove package from package.json that's actually used indirectly or in config files
**Why it happens:** Dependency used in tailwind.config.js, next.config.js, or imported by another dependency
**How to avoid:**
- Run `npm run build` after removing any dependency
- Check for the package name in all config files
- Verify it's not a peer dependency of another package
- Use `npm ls <package-name>` to see dependency tree
**Warning signs:** Build failures mentioning "cannot find module", config parsing errors

## Code Examples

Verified patterns from official sources:

### Safe Knip Execution and Review
```bash
# Install Knip
npm install --save-dev knip

# Run Knip in reporting mode (no changes)
npx knip

# Output shows:
# - Unused files
# - Unused dependencies
# - Unused exports
# - Unused types

# Review findings carefully - look for:
# 1. Dynamic imports (may be false positive)
# 2. Work-in-progress code
# 3. Framework-specific patterns

# Create .kniprc.json to ignore false positives
cat > .kniprc.json << 'EOF'
{
  "ignore": [
    "lib/plugins/**",
    "**/*.stories.tsx"
  ],
  "ignoreDependencies": [
    "@types/node"
  ]
}
EOF

# Run again with ignore rules
npx knip
```

### ESLint Plugin for Unused Imports - Configuration and Usage
```javascript
// eslint.config.js (ESLint 9+)
import unusedImports from "eslint-plugin-unused-imports";

export default [
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      // Turn off base rules as they are handled by unused-imports
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",

      // Enable unused-imports rules
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          "vars": "all",
          "varsIgnorePattern": "^_",
          "args": "after-used",
          "argsIgnorePattern": "^_",
        },
      ],
    },
  },
];

// Or for .eslintrc.json (legacy config)
{
  "plugins": ["unused-imports"],
  "rules": {
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "unused-imports/no-unused-imports": "error",
    "unused-imports/no-unused-vars": [
      "warn",
      {
        "vars": "all",
        "varsIgnorePattern": "^_",
        "args": "after-used",
        "argsIgnorePattern": "^_"
      }
    ]
  }
}
```

```bash
# Run ESLint with autofix to remove all unused imports
npx eslint . --fix

# For specific directory
npx eslint lib/ --fix

# Check what would be fixed without making changes
npx eslint . --fix-dry-run
```

### Removing Console Logs - ESLint Configuration
```json
// .eslintrc.json
{
  "rules": {
    // Disallow console.log and console.debug
    "no-console": ["error", {
      "allow": ["warn", "error", "info"]
    }]
  }
}
```

```typescript
// Alternative: Environment-based console override
// app/layout.tsx or equivalent entry point
if (process.env.NODE_ENV === 'production') {
  console.log = () => {};
  console.debug = () => {};
  // Keep console.warn and console.error for production debugging
}
```

### Git Clean Safe Workflow
```bash
# Step 1: Check repository status
git status

# Step 2: Dry-run to preview deletions (CRITICAL - ALWAYS DO THIS)
git clean -n

# Output shows what WOULD be deleted:
# Would remove file1.txt
# Would remove folder/

# Step 3: Review carefully - these files CANNOT be recovered

# Step 4: If safe, execute removal
git clean -f      # Remove untracked files
git clean -fd     # Remove untracked files and directories

# Alternative: Interactive mode for control
git clean -i

# Interactive options:
# 1: clean
# 2: filter by pattern
# 3: select by numbers
# 4: ask each
# 5: quit
# 6: help

# Step 5: Verify with git status
git status  # Should show clean working tree
```

### Batch Deletion Verification Script
```bash
#!/bin/bash
# cleanup-batch.sh - Safe batch deletion with verification

# Exit on any error
set -e

echo "=== Batch Cleanup with Verification ==="

# Batch 1: Remove Gemini files
echo "Batch 1: Removing Gemini files..."
rm -f lib/ai/gemini.ts lib/ai/gemini-parser.ts lib/ai/gemini-parser.test.ts

echo "Verifying TypeScript compilation..."
npm run build

echo "Running tests..."
npm test

echo "Committing Batch 1..."
git add -A
git commit -m "chore(cleanup): remove Gemini AI integration

- Removed lib/ai/gemini.ts
- Removed lib/ai/gemini-parser.ts
- Removed lib/ai/gemini-parser.test.ts

Claude migration complete in Phase 21."

echo "✓ Batch 1 complete"

# Batch 2: Remove unused imports
echo "Batch 2: Removing unused imports..."
npx eslint . --fix

echo "Verifying TypeScript compilation..."
npm run build

echo "Running tests..."
npm test

echo "Committing Batch 2..."
git add -A
git commit -m "chore(cleanup): remove unused imports

Automated cleanup via eslint-plugin-unused-imports."

echo "✓ Batch 2 complete"

# Final verification
echo "=== Final Verification ==="
npm run build
npm test
echo "✓ All batches completed successfully"
```

### TypeScript Compiler Options for Cleanup Detection
```json
// tsconfig.json
{
  "compilerOptions": {
    // Enable unused variable detection
    "noUnusedLocals": true,

    // Enable unused parameter detection
    "noUnusedParameters": true,

    // These will cause compilation errors for unused code
    // Helps catch issues before runtime
  }
}
```

```bash
# Run TypeScript compiler to check for unused code
npx tsc --noEmit

# Output will show errors like:
# error TS6133: 'unusedVariable' is declared but its value is never read.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual grep for unused code | Knip with AST-based analysis | 2023-2024 | 100+ framework plugins, catches 10x more dead code with fewer false positives |
| ts-prune only | Knip (comprehensive) | 2023 | ts-prune entered maintenance mode; Knip adds unused files + dependencies detection |
| Remove console.log manually | ESLint rules + build-time removal | Ongoing best practice | Automated enforcement prevents regressions, consistent across team |
| Delete all at once, debug later | Small batches with verification | Industry standard 2020+ | Easier rollback, faster debugging, safer cleanup process |
| Ignore cleanup until major issues | Monthly Knip audits in CI/CD | 2024-2026 trend | Proactive tech debt reduction, prevents accumulation |

**Deprecated/outdated:**
- **ts-prune as primary tool**: Entered maintenance mode Sep 2025, use Knip instead for comprehensive detection
- **next-unused**: Last updated 5+ years ago, doesn't support Next.js 15+, use Knip with Next.js plugin
- **Manual dependency checking**: Use Knip or depcheck for reliable automated detection
- **Terser drop_console only**: Still works but ESLint no-console prevents console statements from being added in first place

## Open Questions

Things that couldn't be fully resolved:

1. **Knip exact version and Next.js 16 compatibility**
   - What we know: Knip has Next.js plugin and is actively maintained
   - What's unclear: Specific version compatibility with Next.js 16.1.4
   - Recommendation: Install latest version, test on project, check for errors. Knip is actively maintained and should support latest Next.js

2. **Dynamic import detection accuracy**
   - What we know: Static analysis tools struggle with dynamic string-based imports
   - What's unclear: How accurately Knip 2026 version handles Next.js 16 dynamic imports
   - Recommendation: Manually review all files in `/api/` routes and dynamic route handlers before deletion

3. **Optimal batch size for this codebase**
   - What we know: Small batches (5-10 files) are safer than large batches
   - What's unclear: For 78K LOC codebase, what's the optimal trade-off between safety and speed
   - Recommendation: Start with very small batches (3-5 files), increase if verifications are consistently clean

4. **@google/generative-ai dependency removal timing**
   - What we know: Package is in dependencies, Gemini files exist in codebase
   - What's unclear: Whether package is still imported elsewhere or can be safely removed
   - Recommendation: Use Knip to verify, then remove from package.json and verify build succeeds

## Sources

### Primary (HIGH confidence)
- [Knip Official Website](https://knip.dev) - Features, installation, usage patterns
- [ts-prune GitHub Repository](https://github.com/nadeesha/ts-prune) - Maintenance mode status, limitations
- [eslint-plugin-unused-imports npm](https://www.npmjs.com/package/eslint-plugin-unused-imports) - Configuration and autofix capabilities
- [ESLint no-console Rule](https://eslint.org/docs/latest/rules/no-console) - Official console.log removal
- [Git Clean Documentation](https://git-scm.com/docs/git-clean) - Official git clean usage and flags

### Secondary (MEDIUM confidence)
- [How to Clean Up Your Codebase with Knip](https://www.timsanteford.com/posts/how-to-clean-up-your-codebase-with-knip/) - Verified real-world patterns
- [Using Knip to find dead code in a high-traffic git repo](https://madelinemiller.dev/blog/knip-dead-code/) - Production usage at scale
- [Effective TypeScript: Use knip to detect dead code and types](https://effectivetypescript.com/2023/07/29/knip/) - Industry expert recommendation
- [Automatically Remove Unused Imports From Your JS Projects](https://simondosda.github.io/posts/2021-05-10-eslint-imports.html) - ESLint unused imports workflow
- [Git Clean: Remove Untracked Files and Keep Repos Tidy](https://www.datacamp.com/tutorial/git-clean) - Safe removal strategies

### Tertiary (LOW confidence)
- [Best Practices for Writing Clean TypeScript Code](https://dev.to/alisamir/best-practices-for-writing-clean-typescript-code-57hf) - General cleanup principles
- [5 Tips for Cleaning Up Your TypeScript Codebase](https://www.webdevtutor.net/blog/typescript-cleanup) - Cleanup strategies overview
- WebSearch results: "TypeScript codebase cleanup best practices 2026" - Community patterns and recommendations

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Knip verified as industry standard via official docs + Effective TypeScript + production usage reports; eslint-plugin-unused-imports verified via npm registry
- Architecture: HIGH - Batch deletion pattern is industry standard; git clean workflow verified via official Git documentation; ESLint patterns verified via official docs
- Pitfalls: HIGH - False positive patterns confirmed via Knip documentation and real-world usage reports; git clean risks verified via multiple official sources

**Research date:** 2026-01-31
**Valid until:** 2026-03-15 (45 days - tooling is stable but Knip actively maintained)
