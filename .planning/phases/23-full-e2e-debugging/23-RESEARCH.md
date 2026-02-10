# Phase 23: Full E2E Debugging - Research

**Researched:** 2026-02-01
**Domain:** End-to-end workflow testing and debugging
**Confidence:** HIGH

## Summary

Phase 23 focuses on end-to-end debugging of the complete workflow: upload -> parse -> confirm -> execute -> download. This is a critical stability checkpoint before release, ensuring all integration points work correctly.

The application is a Next.js 16.1 app with React 19, using Playwright for E2E testing and Vitest for unit testing. The workflow involves complex state management via React Context with sessionStorage persistence, integration with external APIs (Claude for parsing, kie.ai for generation), Supabase for storage and database, and a queue-based background job system.

**Primary recommendation:** Use structured manual testing with detailed checklists for each workflow step, supplemented by targeted automated tests for critical paths. Focus on integration point validation and state consistency across page transitions.

## Standard Stack

The established libraries/tools for this domain:

### Core Testing Tools
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | ^1.58.1 | E2E browser testing | Official Next.js recommendation for E2E tests |
| vitest | ^4.0.18 | Unit testing | Fast, modern replacement for Jest with native ESM |
| @vitejs/plugin-react | ^5.1.2 | React support in Vitest | Required for testing React components |
| jsdom | ^27.4.0 | DOM simulation | Enables testing browser APIs in Node |

### Application Stack (Relevant to Testing)
| Library | Version | Purpose | When to Test |
|---------|---------|---------|-------------|
| next | ^16.1.4 | Framework | Test production builds, not dev |
| react | ^19.2.3 | UI library | Test with state management patterns |
| @supabase/supabase-js | ^2.91.1 | Database/storage | Mock in unit tests, real in E2E |
| @anthropic-ai/sdk | ^0.71.2 | Claude API | Mock in unit tests, real in manual tests |
| p-queue | ^9.1.0 | Queue management | Test concurrency behavior |
| p-retry | ^7.1.1 | Retry logic | Test failure scenarios |

### Mocking Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jest-localstorage-mock | Not installed | Mock sessionStorage | Add if writing storage tests |

**Installation:**
```bash
# Already installed
npm install --save-dev @playwright/test vitest @vitejs/plugin-react jsdom
```

## Architecture Patterns

### Workflow Integration Points

The application has 8 critical integration points that must be tested:

```
1. Upload Page -> JobContext (sessionStorage)
   - Files uploaded to Supabase storage
   - dropResult and fileCountByFolder stored in context
   - Session ID generated

2. JobContext -> Create Job Page
   - Hydration from sessionStorage on mount
   - Folder structure available for AI parsing

3. Create Job Page -> AI Parse API
   - Messages sent to /api/ai/parse
   - Claude API called (external dependency)
   - ParsedJob returned and stored in context

4. Review Page -> Confirm Page
   - ParsedJob validated and editable
   - Model settings configured
   - Navigation preserves state

5. Confirm Page -> Cost Page
   - File mappings built from dropResult
   - Reference photos uploaded to Supabase
   - Cost estimation calculated

6. Cost Page -> Job Create API
   - Job record created in Supabase
   - Generation records created (one per file)
   - Job ID returned

7. Preview Page -> Job Execute API
   - Generations fetched from database
   - Queue manager initialized
   - Background processing started

8. Progress Page -> Results Page
   - Polling for completion status
   - Download ZIP from generated images
   - Cleanup of completed jobs
```

### Pattern 1: SessionStorage State Persistence
**What:** React Context synced with sessionStorage for cross-page state
**When to use:** Multi-page workflows where state must survive page refreshes
**Example:**
```typescript
// Source: lib/session/job-context.tsx (lines 94-132)
// Hydrate from sessionStorage on mount
useEffect(() => {
  const saved = loadSession();
  if (saved) {
    setUploadSessionId(saved.uploadSessionId);
    setDropResult(saved.dropResult);
    // ... restore other state
  }
  setIsHydrated(true);
}, []);

// Save to sessionStorage whenever key data changes
useEffect(() => {
  if (!isHydrated) return; // Don't save during hydration
  const sessionData: SerializedSession = {
    uploadSessionId,
    dropResult,
    parsedJob,
    // ... serialize state
  };
  saveSession(sessionData);
}, [isHydrated, uploadSessionId, dropResult, parsedJob]);
```

**Critical test points:**
- State persists across page navigation
- State survives page refresh
- State is cleared on workflow reset
- File objects are not serialized (only URLs)

### Pattern 2: Folder Path Matching (Case-Insensitive)
**What:** AI-parsed folder paths matched case-insensitively to uploaded files
**When to test:** Job creation, generation record creation
**Example:**
```typescript
// Source: app/api/job/create/route.ts (lines 121-134)
// Try exact match first
let folderFiles = filesByFolder[folder.folderPath] || [];

// If no match, try case-insensitive matching
if (folderFiles.length === 0) {
  const lowerFolderPath = folder.folderPath.toLowerCase();
  const matchingKey = Object.keys(filesByFolder).find(
    k => k.toLowerCase() === lowerFolderPath
  );
  if (matchingKey) {
    folderFiles = filesByFolder[matchingKey] || [];
  }
}
```

**Failure mode:** If folder paths don't match, 0 generations are created, job appears to succeed but has no work to do.

### Pattern 3: External API Retry Logic
**What:** p-retry with exponential backoff for transient failures
**When to use:** All external API calls (Claude, kie.ai, Supabase)
**Example:**
```typescript
// Source: lib/queue/kie-api-client.ts (lines 66-117)
return pRetry(
  async () => {
    const response = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
      // ... API call
    });

    // Non-retryable errors - abort immediately
    if (response.status === 401 || response.status === 402 || response.status === 422) {
      throw new AbortError(`Non-retryable error (${response.status})`);
    }

    // Retryable errors - throw to trigger retry
    if (response.status === 429 || response.status >= 500) {
      throw new Error(`Retryable error (${response.status})`);
    }
  },
  {
    retries: 5,
    factor: 2, // 1s, 2s, 4s, 8s, 16s
    minTimeout: 1000,
    maxTimeout: 30000,
    randomize: true, // Add jitter
  }
);
```

### Anti-Patterns to Avoid
- **Testing against dev server:** Playwright config currently uses `npm run dev`, but should use production build for accurate testing
- **Clearing state before assertions:** Don't clear sessionStorage before checking if state persisted
- **Mocking everything:** E2E tests should use real integrations to catch integration bugs
- **Sequential-only testing:** Queue processing is concurrent, tests must verify parallel behavior works

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SessionStorage testing | Custom mock objects | jest-localstorage-mock | Handles edge cases, cleanup, Jest integration |
| API retry logic | setTimeout loops | p-retry | Exponential backoff, jitter, abort conditions |
| File upload testing | Blob construction | Playwright's file chooser API | Simulates real browser behavior |
| Async polling | setInterval loops | p-retry with long retries | Handles timeouts, failures, backoff |
| Browser state isolation | Manual cleanup | Playwright's built-in context isolation | Each test gets fresh browser context |

**Key insight:** E2E testing frameworks like Playwright provide built-in solutions for common browser testing problems (file uploads, network mocking, browser state). Don't reinvent these - use the framework's features.

## Common Pitfalls

### Pitfall 1: State Hydration Timing Issues
**What goes wrong:** Tests access state before sessionStorage hydration completes
**Why it happens:** useEffect runs after initial render, state loads asynchronously
**How to avoid:**
- Check for `isHydrated` flag before assertions
- Wait for UI elements that depend on hydrated state
- Use Playwright's auto-waiting features (waitForSelector, etc.)
**Warning signs:** Flaky tests that pass on retry, missing data on first load

### Pitfall 2: Folder Path Case Sensitivity
**What goes wrong:** AI returns folder path "Assets" but files uploaded under "assets", resulting in 0 generations created
**Why it happens:** File system is case-sensitive on Linux, case-insensitive on Windows/Mac
**How to avoid:**
- Always use case-insensitive matching in job creation
- Log warnings when exact match fails but case-insensitive match succeeds
- Test with mixed-case folder names
**Warning signs:** Job created successfully but totalGenerations = 0

### Pitfall 3: File Object Serialization
**What goes wrong:** Attempt to serialize File objects to sessionStorage causes errors
**Why it happens:** File objects contain binary data and can't be JSON.stringify'd
**How to avoid:**
- Store only URLs and metadata in sessionStorage
- Recreate File objects from URLs when needed
- Use placeholder File objects for restored reference photos
**Warning signs:** "TypeError: Converting circular structure to JSON" or state not persisting

### Pitfall 4: External API Test Flakiness
**What goes wrong:** Tests fail intermittently due to API rate limits, timeouts, or downtime
**Why it happens:** External APIs have variable response times and quotas
**How to avoid:**
- Mock external APIs in automated tests (use MSW or Playwright's route mocking)
- Use real APIs only in manual testing or dedicated integration test runs
- Set appropriate timeouts (Claude can take 30+ seconds with thinking)
**Warning signs:** Tests pass locally but fail in CI, "429 Too Many Requests" errors

### Pitfall 5: Queue State Verification
**What goes wrong:** Test assumes job completes instantly, but queue processes in background
**Why it happens:** Queue manager processes jobs asynchronously with p-queue
**How to avoid:**
- Poll for completion status instead of immediate assertions
- Use Playwright's waitForTimeout or custom polling functions
- Verify intermediate states (pending -> processing -> completed)
**Warning signs:** "Expected completed, got pending", race conditions in tests

### Pitfall 6: Production Build vs Dev Server
**What goes wrong:** Tests pass against dev server but fail in production
**Why it happens:** Dev server has hot reload, different error handling, debug logs
**How to avoid:**
- Always test against `npm run build && npm run start`
- Update Playwright config to use production server
- Run tests in CI against production build
**Warning signs:** Different behavior between local dev and deployed app

## Code Examples

Verified patterns from official sources:

### Manual Testing Checklist Pattern
```typescript
// Based on: Software Testing Best Practices 2026
// Manual test execution with detailed checkpoints

const WORKFLOW_CHECKLIST = {
  "DEBG-01: Upload Flow": [
    "✓ Can drop folder with images",
    "✓ Folder structure preserved in tree view",
    "✓ File count matches uploaded files",
    "✓ Upload progress shows correctly",
    "✓ Session ID generated and stored",
    "✓ Navigate to create-job works",
  ],
  "DEBG-02: AI Parsing": [
    "✓ Enter natural language prompt",
    "✓ Claude API called successfully",
    "✓ ParsedJob returned with valid structure",
    "✓ Folder operations match prompt intent",
    "✓ Error handling for invalid prompts",
    "✓ Navigate to review page works",
  ],
  "DEBG-03: Confirmation Page": [
    "✓ Interpretation summary displays",
    "✓ File counts match uploaded files",
    "✓ Per-folder details correct",
    "✓ Edit mode allows changes",
    "✓ Navigate to cost page works",
  ],
  "DEBG-04: Job Execution": [
    "✓ Job created in database",
    "✓ Generation records created (count matches)",
    "✓ Queue starts processing",
    "✓ Progress updates in real-time",
    "✓ Error handling for failures",
    "✓ Navigate to results when complete",
  ],
  "DEBG-05: Download": [
    "✓ ZIP file downloads successfully",
    "✓ ZIP contains all generated images",
    "✓ Images are valid (not corrupted)",
    "✓ Folder structure preserved in ZIP",
    "✓ File names match source files",
  ],
};
```

### Playwright Production Build Testing
```typescript
// Source: Next.js Testing: Playwright docs
// Update playwright.config.ts for production testing

export default defineConfig({
  testDir: './e2e',

  // Run against production build
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  // Use fixtures for authenticated state
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    // Store auth state to reuse across tests
    storageState: 'playwright/.auth/user.json',
  },
});
```

### SessionStorage Testing Pattern
```typescript
// Source: React Context SessionStorage Best Practices 2026
// Test state persistence across navigation

test('state persists across page navigation', async ({ page }) => {
  // Setup: Upload files and create session
  await page.goto('/upload');
  await page.setInputFiles('input[type="file"]', ['./test-images/folder1/image1.jpg']);
  await page.click('button:has-text("Start Upload")');
  await page.click('button:has-text("Create Generation Job")');

  // Verify state in create-job page
  await page.waitForURL('**/create-job');
  const folderCount = await page.locator('[data-testid="folder-count"]').textContent();
  expect(folderCount).toBe('1 folder uploaded');

  // Refresh page to test sessionStorage hydration
  await page.reload();

  // State should still be available
  await page.waitForLoadState('networkidle');
  const folderCountAfterRefresh = await page.locator('[data-testid="folder-count"]').textContent();
  expect(folderCountAfterRefresh).toBe('1 folder uploaded');
});
```

### External API Mocking Pattern
```typescript
// Source: Playwright Testing Guide 2026
// Mock external APIs for reliable testing

test('AI parsing with mocked Claude API', async ({ page }) => {
  // Mock Claude API response
  await page.route('**/api/ai/parse', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        parsed: {
          understood: true,
          job: {
            folders: [
              { folderPath: 'folder1', operation: 'Generate fantasy landscape' }
            ],
            outputFormat: 'PNG',
          },
          interpretation: 'I will generate fantasy landscapes for all images in folder1',
        },
      }),
    });
  });

  await page.goto('/create-job');
  await page.fill('textarea[placeholder*="prompt"]', 'Create fantasy landscapes');
  await page.click('button:has-text("Parse with AI")');

  // Verify UI updates with parsed job
  await expect(page.locator('text=Generate fantasy landscape')).toBeVisible();
});
```

### Integration Point Verification Pattern
```typescript
// Source: E2E Testing Best Practices 2026
// Verify data flow between integration points

test('upload -> parse -> job creation flow', async ({ page }) => {
  // Integration Point 1: Upload -> Context
  await page.goto('/upload');
  await page.setInputFiles('[type="file"]', ['./test/fixtures/sample-image.jpg']);
  await page.click('button:has-text("Start Upload")');
  await page.waitForSelector('button:has-text("Create Generation Job")');

  // Verify sessionStorage has upload data
  const sessionData = await page.evaluate(() => {
    const data = sessionStorage.getItem('bulkImageGen_jobSession');
    return data ? JSON.parse(data) : null;
  });
  expect(sessionData.uploadSessionId).toBeTruthy();
  expect(sessionData.folders).toHaveLength(1);

  // Integration Point 2: Context -> Create Job Page
  await page.click('button:has-text("Create Generation Job")');
  await page.waitForURL('**/create-job');

  // Integration Point 3: Parse -> Job Creation
  await page.fill('textarea', 'Make it blue');
  await page.click('button:has-text("Parse")');
  await page.waitForSelector('text=Review Job');

  // Integration Point 4: Job Creation API
  const jobCreateResponse = page.waitForResponse('**/api/job/create');
  await page.click('button:has-text("Continue")');
  const response = await jobCreateResponse;
  const jobData = await response.json();

  expect(jobData.success).toBe(true);
  expect(jobData.job.totalGenerations).toBeGreaterThan(0);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest for all tests | Vitest for unit, Playwright for E2E | 2024-2025 | Faster test execution, native ESM support |
| Manual browser testing | Automated E2E with Playwright | 2023-2024 | Reliable regression detection, CI/CD integration |
| Redux for state management | React Context + sessionStorage | 2023-2024 | Simpler state management, built-in persistence |
| Cypress | Playwright | 2023-2024 | Better performance, multi-browser support |
| Blocking queue processing | p-queue async concurrency | 2024 | Faster job execution, better resource utilization |

**Deprecated/outdated:**
- Jest: Replaced by Vitest for better Next.js compatibility and speed
- Dev server testing: Always test production builds (Next.js best practice 2026)
- Synchronous retry loops: Use p-retry with exponential backoff

## Open Questions

Things that couldn't be fully resolved:

1. **Claude API thinking time variability**
   - What we know: Extended thinking can take 30+ seconds
   - What's unclear: Whether timeouts should be dynamic based on prompt complexity
   - Recommendation: Use conservative 60s timeout, log thinking time for monitoring

2. **kie.ai API response format stability**
   - What we know: API uses `state` field, has multiple result URL formats
   - What's unclear: Whether response format will change in future versions
   - Recommendation: Use defensive parsing with multiple fallback strategies (already implemented)

3. **Optimal test parallelization**
   - What we know: Playwright supports parallel execution, but tests share Supabase/external APIs
   - What's unclear: Whether parallel tests will hit rate limits or cause conflicts
   - Recommendation: Run E2E tests sequentially in CI (workers: 1), parallel locally for speed

4. **SessionStorage size limits**
   - What we know: Browsers limit sessionStorage to ~5-10MB
   - What's unclear: Whether large folder trees could exceed limits
   - Recommendation: Monitor serialized state size, warn if approaching 5MB

## Sources

### Primary (HIGH confidence)
- Next.js Official Docs - Testing: Playwright: https://nextjs.org/docs/pages/guides/testing/playwright
- Playwright Test Configuration: https://playwright.dev/docs/test-configuration
- React Context + SessionStorage patterns: Application code review (lib/session/job-context.tsx)
- API integration patterns: Application code review (app/api/*/route.ts)

### Secondary (MEDIUM confidence)
- [Testing: Playwright | Next.js](https://nextjs.org/docs/pages/guides/testing/playwright)
- [Unit and E2E Tests with Vitest & Playwright](https://strapi.io/blog/nextjs-testing-guide-unit-and-e2e-tests-with-vitest-and-playwright)
- [Guide to Playwright end-to-end testing in 2026 - DeviQA](https://www.deviqa.com/blog/guide-to-playwright-end-to-end-testing-in-2025/)
- [Software Testing Best Practices for 2026](https://bugbug.io/blog/test-automation/software-testing-best-practices/)
- [End-to-End Testing - Tools and Frameworks Guide for 2026](https://bugbug.io/blog/test-automation/end-to-end-testing/)
- [JavaScript SessionStorage in React: Complete Guide with Code Examples & 2026 Best Practices](https://copyprogramming.com/howto/how-to-listen-sessionstorage-in-react-js)

### Tertiary (LOW confidence)
- WebSearch results on testing patterns - verified against official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Package.json confirms all versions, Playwright config verified
- Architecture: HIGH - Direct code review of integration points and patterns
- Pitfalls: HIGH - Derived from actual codebase patterns and known Next.js issues
- Testing approach: MEDIUM - Based on industry best practices, adapted to specific workflow

**Research date:** 2026-02-01
**Valid until:** 2026-03-01 (30 days - testing patterns stable, framework versions current)

---

## Key Findings Summary

**Integration Point Validation is Critical:** The workflow has 8 distinct integration points where data flows between pages, APIs, and storage. Each must be tested for:
- Data format correctness
- State persistence
- Error handling
- Navigation state preservation

**Manual Testing with Checklists is Essential:** Given the complexity and external dependencies (Claude API, kie.ai API, Supabase), structured manual testing ensures:
- Real integration behavior verification
- External API interaction validation
- Edge case discovery
- User experience validation

**Production Build Testing is Mandatory:** Next.js dev server behavior differs significantly from production. All E2E tests must run against production builds to catch:
- Build-time errors
- Optimization issues
- Production-only configurations

**State Management Testing Requires Special Care:** React Context + sessionStorage pattern needs specific test coverage:
- Hydration timing
- Serialization edge cases
- Cross-page state consistency
- Refresh behavior

**External API Mocking for Reliability:** While manual tests should use real APIs, automated E2E tests should mock external services to:
- Avoid rate limits
- Ensure test repeatability
- Speed up test execution
- Reduce CI costs
