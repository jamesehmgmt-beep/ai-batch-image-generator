# Phase 24: Final Quality Assurance - Research

**Researched:** 2026-02-01
**Domain:** Quality Assurance, Test Orchestration, UAT
**Confidence:** HIGH

## Summary

Final Quality Assurance involves executing and verifying all automated test suites (unit, integration, E2E) and conducting manual User Acceptance Testing (UAT) before production deployment. The standard approach uses existing test frameworks (Vitest for unit/integration, Playwright for E2E) in non-watch/CI mode with comprehensive verification gates and structured UAT workflows.

Research focused on three domains: automated test orchestration (running all tests systematically), quality gates (verification criteria before deployment), and manual UAT best practices (structured end-to-end workflow validation). For 2026, best practices emphasize test isolation, production-like environments, clear pass/fail criteria, and automated reporting with manual UAT focused on real user workflows.

The key challenge is distinguishing between "tests pass" and "system is production-ready." Successful QA phases use layered verification: automated tests validate technical correctness, smoke tests verify deployment configuration, and UAT confirms business value. This phase is a verification checkpoint, not a discovery phase - all tests should already exist from Phase 20-23 implementation.

**Primary recommendation:** Execute automated tests in CI mode (`vitest run` and `playwright test`), verify all pass with no flaky tests, then conduct structured UAT covering critical user workflows end-to-end. Document all findings and establish clear go/no-go criteria before deployment approval.

## Standard Stack

The established tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | 4.0+ | Unit/Integration test runner | Fast, native ESM support, same API as Jest, built for modern development |
| Playwright | 1.58+ | E2E test framework | Cross-browser testing, auto-wait, traces for debugging, official Next.js recommendation |
| npm scripts | Built-in | Test orchestration | Simple, universal, works in CI/CD |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| GitHub Actions | Latest | CI/CD automation | When project uses GitHub, free for public repos |
| @vitest/coverage-v8 | 4.0+ | Code coverage reporting | When measuring test coverage, faster than istanbul |
| Playwright HTML Reporter | Built-in | E2E test reporting | Visualizing E2E test results, debugging failures |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest | Jest | Jest more established but slower, no native ESM support |
| Playwright | Cypress | Cypress has better DX but only runs in browser, no multi-tab support |
| npm scripts | Task runners (Gulp, Grunt) | Task runners add complexity without benefit for simple test orchestration |

**Installation:**
Already installed from Phase 20. No new dependencies required.

## Architecture Patterns

### Recommended Test Execution Flow
```
Phase 24 QA Execution:
├── 1. Automated Test Suite
│   ├── Unit tests (vitest run)
│   ├── Integration tests (vitest run)
│   └── E2E tests (playwright test)
├── 2. Verification Gates
│   ├── All tests pass (0 failures)
│   ├── No flaky tests (consistent results)
│   └── Coverage meets threshold (if applicable)
├── 3. Manual UAT
│   ├── Smoke test critical paths
│   ├── End-to-end workflow verification
│   └── Edge case exploration
└── 4. Go/No-Go Decision
    ├── Document results
    ├── Log any issues
    └── Approve or block deployment
```

### Pattern 1: Layered Test Execution
**What:** Run tests in order of speed and scope (unit → integration → E2E)
**When to use:** Final QA before deployment, CI/CD pipelines
**Example:**
```bash
# Source: Vitest official docs https://vitest.dev/guide/cli
# Run unit and integration tests (fast)
npm run test

# If unit/integration pass, run E2E tests (slower)
npm run test:e2e

# Pattern: Fail fast - stop at first layer that fails
npm run test && npm run test:e2e
```

### Pattern 2: Quality Gate Verification
**What:** Define clear pass/fail criteria that must be met before proceeding
**When to use:** Final QA checkpoint, deployment decisions
**Example:**
```typescript
// Quality gate criteria (conceptual, not actual code)
interface QualityGate {
  allTestsPass: boolean;        // No test failures
  noFlakyTests: boolean;        // Tests pass consistently
  criticalPathsVerified: boolean; // UAT confirms workflows
  knownIssuesDocumented: boolean; // Any blockers logged
}

// Gate must be GREEN to proceed to deployment
function canDeploy(gate: QualityGate): boolean {
  return Object.values(gate).every(v => v === true);
}
```

### Pattern 3: UAT Workflow Structure
**What:** Structured manual testing covering end-to-end user journeys
**When to use:** Final manual verification before production
**Example:**
```markdown
# UAT Test Scenario Template
## Scenario: [Name of user workflow]
**User Role:** [Who performs this]
**Prerequisites:** [What must be set up first]

### Steps:
1. [Action 1]
   - Expected: [What should happen]
   - Actual: [What did happen]
   - Pass/Fail: [Result]

2. [Action 2]
   - Expected: [What should happen]
   - Actual: [What did happen]
   - Pass/Fail: [Result]

### Result: PASS/FAIL
### Issues Found: [List or "None"]
### Tested By: [Name]
### Date: [YYYY-MM-DD]
```

### Anti-Patterns to Avoid
- **Skipping manual UAT because tests pass:** Automated tests verify technical correctness, not user experience or business value
- **Running tests in watch mode for final verification:** Watch mode is for development, use `run` mode for final QA to match CI behavior
- **Testing in development environment:** Must test in production-like environment to catch configuration and deployment issues
- **No clear go/no-go criteria:** Without defined criteria, QA becomes subjective and inconsistent
- **Testing only happy paths in UAT:** Real users encounter edge cases, errors, and unexpected workflows

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test reporting | Custom JSON parser/HTML generator | Vitest built-in reporters, Playwright HTML reporter | Built-in reporters handle edge cases, provide filtering, history tracking |
| Test parallelization | Custom worker pools | Vitest `test.concurrent`, Playwright `fullyParallel: true` | Framework handles process management, race conditions, resource cleanup |
| Flaky test detection | Manual retry logic | Playwright `retries` config, test.retry() | Official retry mechanisms handle screenshots, traces, proper cleanup |
| Coverage collection | Manual instrumentation | `@vitest/coverage-v8` | Coverage providers handle source mapping, thresholds, multiple formats |
| UAT tracking | Spreadsheets or custom tool | GitHub Issues with labels, or dedicated UAT tools | Issue tracking provides history, collaboration, integration with development workflow |

**Key insight:** Test framework features are battle-tested across thousands of projects. Custom solutions introduce bugs and maintenance burden without benefit.

## Common Pitfalls

### Pitfall 1: Flaky Tests Accepted as "Good Enough"
**What goes wrong:** Tests pass sometimes but fail intermittently without code changes. Team accepts this as normal.
**Why it happens:** Timing issues, race conditions, external dependencies, non-isolated tests
**How to avoid:**
- Use Playwright's auto-wait features (no manual `sleep()` calls)
- Ensure test isolation (each test sets up its own data)
- Mock external dependencies
- Fix flaky tests immediately, don't accumulate them
**Warning signs:** "Just re-run it, it'll pass" becomes common phrase

### Pitfall 2: Environment Mismatch Between Test and Production
**What goes wrong:** Tests pass in dev/test environment but fail in production due to configuration differences
**Why it happens:** Different environment variables, database states, API endpoints, infrastructure
**How to avoid:**
- Test against production-like environment (staging)
- Use same environment variables structure
- Verify deployment configuration separately
- Run smoke tests in actual production after deployment
**Warning signs:** "It works on my machine" or "Tests passed but production broke"

### Pitfall 3: No Clear Definition of "Done"
**What goes wrong:** QA phase drags on indefinitely, unclear when testing is "complete"
**Why it happens:** No defined exit criteria, scope creep, perfectionism
**How to avoid:**
- Define quality gates upfront (all tests pass, UAT scenarios complete)
- Set time-box for UAT (e.g., 2 days intensive testing)
- Distinguish blockers from nice-to-haves
- Document known issues and defer non-critical items
**Warning signs:** "Just one more test" repeated daily

### Pitfall 4: Testing Discovery Instead of Verification
**What goes wrong:** QA phase becomes exploratory testing, finding gaps in test coverage or new requirements
**Why it happens:** Tests weren't written during implementation, requirements unclear
**How to avoid:**
- Phase 20-23 should have already built tests
- QA phase only runs existing tests + UAT
- New issues found become post-deployment tickets
- Don't expand scope during final QA
**Warning signs:** Writing new tests during Phase 24

### Pitfall 5: Manual UAT Without Structure
**What goes wrong:** UAT becomes random clicking, missing critical workflows, no documentation
**Why it happens:** No UAT plan, no test scenarios, ad-hoc testing
**How to avoid:**
- Create UAT scenarios before testing
- Focus on critical end-to-end workflows
- Document steps and expected results
- Track what was tested and what wasn't
**Warning signs:** "I clicked around and it seems fine"

### Pitfall 6: Ignoring Test Failure Root Causes
**What goes wrong:** Tests fail, team fixes symptoms not causes, failures recur
**Why it happens:** Time pressure, unclear error messages, complexity
**How to avoid:**
- Use Playwright traces for E2E failures
- Check Vitest error output for exact assertion failures
- Investigate why test failed, not just how to make it pass
- Fix root cause, not test code
**Warning signs:** Frequently updating test assertions without fixing code

## Code Examples

Verified patterns from official sources:

### Running Complete Test Suite (CI Mode)
```bash
# Source: Vitest CLI docs https://vitest.dev/guide/cli
# Run all unit/integration tests once (no watch)
vitest run

# Run with coverage
vitest run --coverage

# Stop on first failure (fail-fast for CI)
vitest run --bail=1

# Run E2E tests
playwright test

# Run E2E in headed mode for debugging
playwright test --headed

# Run specific E2E test file
playwright test e2e/job-workflow.spec.ts
```

### Package.json Test Scripts (Current Project)
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

### Parallel Test Execution
```bash
# Source: Playwright docs https://playwright.dev/docs/test-parallel
# Playwright runs tests in parallel by default
# Configure in playwright.config.ts:
{
  fullyParallel: true,  // Already configured
  workers: process.env.CI ? 1 : undefined  // Already configured
}

# Vitest runs tests in parallel by default
# No special configuration needed
```

### Quality Gate Check (Bash Script Example)
```bash
#!/bin/bash
# Source: CI/CD best practices patterns

echo "Running Quality Gate Checks..."

# 1. Run unit and integration tests
echo "Step 1: Unit & Integration Tests"
npm run test
if [ $? -ne 0 ]; then
  echo "❌ Unit/Integration tests failed"
  exit 1
fi

# 2. Run E2E tests
echo "Step 2: E2E Tests"
npm run test:e2e
if [ $? -ne 0 ]; then
  echo "❌ E2E tests failed"
  exit 1
fi

echo "✅ All automated tests passed"
echo "Ready for manual UAT"
```

### UAT Scenario Documentation Template
```markdown
# UAT Scenario: Complete Job Workflow

**Tester:** [Name]
**Date:** [YYYY-MM-DD]
**Build:** [Version/Commit]

## Prerequisites
- Clean database state
- Valid test images prepared
- Auth credentials available

## Test Steps

### 1. Upload Images
- Navigate to upload page
- Select 5 test images
- Click upload
- **Expected:** Progress bar shows, all images upload successfully
- **Actual:** [Record result]
- **Status:** PASS / FAIL

### 2. Configure Job Settings
- Enter job parameters
- Select model settings
- Set per-folder prompts
- **Expected:** Form validation works, settings saved
- **Actual:** [Record result]
- **Status:** PASS / FAIL

### 3. Review and Confirm
- Review interpretation summary
- Verify per-image assignments
- Confirm job
- **Expected:** Shows cost estimate, confirmation works
- **Actual:** [Record result]
- **Status:** PASS / FAIL

### 4. Monitor Job Progress
- View job progress page
- Watch status updates
- Check generation list
- **Expected:** Real-time updates, accurate progress
- **Actual:** [Record result]
- **Status:** PASS / FAIL

### 5. Download Results
- Wait for completion
- Click download button
- Verify ZIP file
- **Expected:** ZIP contains all generated images
- **Actual:** [Record result]
- **Status:** PASS / FAIL

## Overall Result: PASS / FAIL

## Issues Found
1. [Issue description] - Severity: [High/Medium/Low]
2. [Issue description] - Severity: [High/Medium/Low]

## Notes
[Any additional observations]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual regression testing | Automated test suites | 2020s | Faster feedback, consistent coverage |
| End-of-cycle QA | Continuous testing | 2020s | Earlier bug detection, shift-left |
| Sequential test execution | Parallel test execution | ~2018 | Faster CI/CD pipelines |
| Screenshot-based debugging | Trace viewer with DOM snapshots | Playwright 1.20+ (2022) | Faster failure investigation |
| Jest for all testing | Vitest for unit, Playwright for E2E | 2023+ | Better performance, native ESM |
| Manual UAT tracking in spreadsheets | Integrated UAT tools | Ongoing | Better collaboration, traceability |

**Deprecated/outdated:**
- **Selenium WebDriver for E2E:** Playwright provides better API, auto-wait, multi-browser support
- **Manual sleep() calls:** Modern frameworks auto-wait for elements
- **jest-playwright:** Use @playwright/test directly
- **100% code coverage requirement:** Research shows 70-80% coverage optimal, 100% leads to diminishing returns

## Open Questions

Things that couldn't be fully resolved:

1. **What is the appropriate time-box for UAT?**
   - What we know: Best practices suggest "at least two full days intensive testing" (BrowserStack UAT guide)
   - What's unclear: Project-specific - depends on complexity and critical workflows
   - Recommendation: Start with 2-day UAT window, adjust based on findings. If finding many issues, testing may need to continue; if everything passes, can complete earlier.

2. **Should Phase 24 include performance testing?**
   - What we know: Performance testing often separate from functional QA
   - What's unclear: Whether performance was tested in earlier phases
   - Recommendation: Focus on functional correctness in Phase 24. Performance testing would typically be in Phase 20-23 or separate performance phase.

3. **What code coverage threshold should be required?**
   - What we know: Industry recommends 70-80% coverage, not 100%
   - What's unclear: Project hasn't defined coverage threshold
   - Recommendation: Verify existing tests pass; coverage threshold is a development-phase decision, not QA-phase.

## Sources

### Primary (HIGH confidence)
- Vitest Official Docs - CLI Guide: https://vitest.dev/guide/cli
- Vitest Official Docs - Getting Started: https://vitest.dev/guide/
- Playwright Official Docs - Best Practices: https://playwright.dev/docs/best-practices
- Next.js Official Docs - Testing with Vitest: https://nextjs.org/docs/app/guides/testing/vitest
- Next.js Official Docs - Testing with Playwright: https://nextjs.org/docs/pages/guides/testing/playwright

### Secondary (MEDIUM confidence)
- BrowserStack: "15 Best Practices for Playwright testing in 2026": https://www.browserstack.com/guide/playwright-best-practices
- BrowserStack: "Playwright Test Report: Comprehensive Guide [2026]": https://www.browserstack.com/guide/playwright-test-report
- BrowserStack: "User Acceptance Testing (UAT) Checklist": https://www.browserstack.com/guide/user-acceptance-testing-checklist
- Continuous Testing in DevOps: The 2026 Strategic Guide: https://blog.testunity.com/continuous-testing-devops-backbone/
- 7 Integration Testing Best Practices in 2026: https://research.aimultiple.com/integration-testing-best-practices/
- DeviQA: "Guide to Playwright end-to-end testing in 2026": https://www.deviqa.com/blog/guide-to-playwright-end-to-end-testing-in-2025/

### Tertiary (LOW confidence)
- Various WebSearch results for UAT best practices and test orchestration patterns (used for validation and cross-referencing)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using existing tools (Vitest 4.0, Playwright 1.58) already configured in project
- Architecture: HIGH - Test orchestration patterns well-established and documented in official sources
- Pitfalls: HIGH - Common QA pitfalls consistent across multiple authoritative sources
- UAT practices: MEDIUM - General best practices verified, but project-specific UAT plan needs definition

**Research date:** 2026-02-01
**Valid until:** 2026-03-01 (30 days - testing practices stable, frameworks mature)

**Note:** This phase is primarily about execution and verification using existing infrastructure from Phase 20. No new libraries or significant technical decisions required - focus is on process and verification rigor.
