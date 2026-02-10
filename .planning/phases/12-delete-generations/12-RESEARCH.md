# Phase 12: Delete Generations - Research

**Researched:** 2026-01-27
**Domain:** Database soft delete patterns, atomic operations, UI confirmation patterns
**Confidence:** HIGH

## Summary

Delete generations is an independent feature that enables users to remove unwanted individual generations from completed jobs. The phase requires implementing a soft delete pattern (using `deleted_at` timestamp), atomic counter updates via PostgreSQL stored procedures, filtering deleted records from queries, and confirmation dialogs in the UI.

Research focused on three primary domains: PostgreSQL soft delete best practices, atomic counter decrement operations, and modern React/Next.js confirmation dialog patterns. The codebase already has a basic DELETE endpoint that hard-deletes pending generations, which needs to be enhanced to soft-delete completed generations with atomic count updates.

Key technical requirements include: adding a `deleted_at` column to the generations table, creating a PostgreSQL stored procedure for atomic count decrements, filtering deleted generations from all query results, and implementing user-friendly confirmation dialogs before deletion.

**Primary recommendation:** Use PostgreSQL soft delete pattern with `deleted_at` timestamp (not boolean), implement atomic counter updates via Supabase RPC stored procedure, use partial unique indexes to handle uniqueness constraints, and enhance existing native `confirm()` with better UX messaging (or optionally upgrade to Radix UI AlertDialog for consistency).

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL | 11+ | Soft delete with timestamp | Industry standard for audit trails and data retention |
| Supabase RPC | Current | Atomic operations via stored procedures | Built-in transaction safety, PostgREST automatically wraps in transactions |
| Next.js Server Actions | 15+ | Server-side mutations | Type-safe API calls with automatic revalidation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-dialog | 2.x | Confirmation dialogs | Already in project (shadcn/ui), if upgrading from native confirm() |
| React useOptimistic | 19+ | Optimistic UI updates | If implementing instant feedback before server response |
| TanStack Query | Latest | Query invalidation & refetch | If using query cache (not currently in project) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| deleted_at timestamp | is_deleted boolean | Timestamp provides forensic data, enables time-travel queries |
| Supabase RPC | Manual UPDATE in API | RPC ensures atomicity via PostgREST transactions automatically |
| Soft delete | Hard delete | Soft delete enables data recovery, audit trails, no data loss |
| Native confirm() | Custom AlertDialog | Native works but custom provides better UX/branding |

**Installation:**
```bash
# Already installed in project:
# - @radix-ui/react-* (shadcn/ui components)
# - Next.js 15+
# - Supabase client

# Optional if upgrading confirmation dialog:
npx shadcn-ui@latest add dialog
```

## Architecture Patterns

### Recommended Database Schema Changes
```sql
-- Add soft delete column to generations table
ALTER TABLE generations
ADD COLUMN deleted_at TIMESTAMPTZ NULL;

-- Add index for filtering non-deleted records
CREATE INDEX idx_generations_deleted_at
ON generations(deleted_at)
WHERE deleted_at IS NULL;

-- Optional: If unique constraints exist on generations, use partial index
-- CREATE UNIQUE INDEX unique_generation_constraint
-- ON generations(job_id, source_file_name)
-- WHERE deleted_at IS NULL;
```

### Pattern 1: PostgreSQL Stored Procedure for Atomic Counter Decrement
**What:** Create a stored procedure that atomically decrements job completion counts when a generation is soft-deleted.
**When to use:** Every time a generation is deleted, to prevent race conditions.
**Example:**
```sql
-- Source: Supabase RPC best practices + PostgreSQL atomic operations
CREATE OR REPLACE FUNCTION decrement_job_generation_count(
  p_job_id UUID
) RETURNS void AS $$
BEGIN
  UPDATE jobs
  SET completed_generations = GREATEST(completed_generations - 1, 0)
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Call from Supabase client:
-- await supabase.rpc('decrement_job_generation_count', { p_job_id: jobId })
```

### Pattern 2: Soft Delete with Atomic Update
**What:** Single transaction that sets `deleted_at` timestamp and decrements counter.
**When to use:** Every delete operation to ensure consistency.
**Example:**
```typescript
// Source: Codebase pattern + research findings
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = createServerSupabaseClient();

  // 1. Verify generation exists and get job_id
  const { data: generation, error: fetchError } = await supabase
    .from('generations')
    .select('job_id, state, deleted_at')
    .eq('id', id)
    .single();

  if (fetchError || !generation) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  if (generation.deleted_at) {
    return NextResponse.json({ success: false, error: 'Already deleted' }, { status: 400 });
  }

  // 2. Soft delete (set deleted_at timestamp)
  const { error: deleteError } = await supabase
    .from('generations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (deleteError) {
    return NextResponse.json({ success: false, error: 'Delete failed' }, { status: 500 });
  }

  // 3. Atomic counter decrement (only if completed)
  if (generation.state === 'completed') {
    await supabase.rpc('decrement_job_generation_count', { p_job_id: generation.job_id });
  }

  return NextResponse.json({ success: true });
}
```

### Pattern 3: Filtering Deleted Records in Queries
**What:** Add `is('deleted_at', null)` filter to all generation queries.
**When to use:** Every SELECT query for generations (results page, downloads, counts).
**Example:**
```typescript
// Source: Codebase app/api/job/[jobId]/download/route.ts + soft delete pattern
// Results page query
const { data: generations } = await supabase
  .from('generations')
  .select('*')
  .eq('job_id', jobId)
  .is('deleted_at', null)  // Filter out soft-deleted
  .order('created_at');

// Download query
const { data: generations } = await supabase
  .from('generations')
  .select('id, source_file_name, result_url, folder_path')
  .eq('job_id', jobId)
  .eq('state', 'completed')
  .is('deleted_at', null)  // Exclude deleted from ZIP
  .not('result_url', 'is', null);
```

### Pattern 4: Confirmation Dialog with Clear Messaging
**What:** User-friendly confirmation before destructive action.
**When to use:** Before any delete operation to prevent accidents.
**Example:**
```typescript
// Source: React confirmation dialog best practices 2026
// Option 1: Native confirm() with better messaging (current approach)
const handleDelete = async () => {
  if (!confirm(
    'Delete this generation?\n\n' +
    'This will remove it from your results and downloads. ' +
    'This action cannot be undone.'
  )) return;

  await fetch(`/api/generation/${id}`, { method: 'DELETE' });
  onDeleted?.(id);
};

// Option 2: Radix AlertDialog (if upgrading UI)
import { AlertDialog, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';

<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="ghost" size="sm"><Trash2 /></Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete this generation?</AlertDialogTitle>
      <AlertDialogDescription>
        This will remove it from your results and downloads. This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Pattern 5: Optimistic UI Update (Optional Enhancement)
**What:** Immediately remove item from UI, revert if delete fails.
**When to use:** For smoother UX, if willing to handle rollback.
**Example:**
```typescript
// Source: React useOptimistic hook pattern
const [optimisticGenerations, addOptimistic] = useOptimistic(
  generations,
  (state, deletedId: string) => state.filter(g => g.id !== deletedId)
);

const handleDelete = async (id: string) => {
  addOptimistic(id); // Instant UI update

  try {
    const res = await fetch(`/api/generation/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
  } catch (error) {
    // Rollback handled by useOptimistic automatically
    alert('Failed to delete generation');
  }
};
```

### Anti-Patterns to Avoid
- **Hard delete without soft delete:** Permanent data loss, no recovery possible, violates DELT-02
- **Non-atomic counter updates:** Read-then-write creates race conditions where multiple deletes cause incorrect counts
- **Forgetting deleted_at filter:** Deleted generations appear in results/downloads, violating DELT-04
- **Generic "Are you sure?" messaging:** Poor UX, doesn't explain consequences or prevent accidents effectively
- **Using boolean instead of timestamp:** Loses forensic data, can't answer "when was this deleted?"

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic counter operations | Manual read-update-write | PostgreSQL stored procedure via Supabase RPC | Race conditions in concurrent deletes, stored procedures are automatically wrapped in transactions |
| Soft delete filtering | Manual WHERE deleted_at IS NULL everywhere | Partial indexes + consistent query pattern | Easy to forget filter, partial indexes improve performance, wrong filter = data leak |
| Unique constraints with soft delete | Custom validation logic | PostgreSQL partial unique indexes WHERE deleted_at IS NULL | Database-level enforcement, handles concurrency, allows deleted records with duplicate keys |
| Confirmation dialogs | Custom modal system | Native confirm() or Radix AlertDialog | Accessibility (ARIA, focus management), keyboard support, mobile compatibility |

**Key insight:** Soft delete with atomic operations is a solved problem with well-established database patterns. Don't reinvent transaction logic or unique constraint handling—use PostgreSQL's built-in features via Supabase RPC.

## Common Pitfalls

### Pitfall 1: Forgetting to Filter Deleted Records
**What goes wrong:** Deleted generations appear in results, downloads, and counts because queries don't check `deleted_at IS NULL`.
**Why it happens:** Developer forgets to add filter to every query, or only adds it to some queries.
**How to avoid:**
- Add `deleted_at` filter to ALL generation queries immediately when adding the column
- Audit existing queries: `/api/job/[jobId]/generations`, `/api/job/[jobId]/download`, results page component
- Consider creating a reusable query helper that always includes the filter
**Warning signs:**
- User reports seeing deleted generations still appearing
- Download ZIP includes deleted images
- Job completion counts don't decrease after deletion

### Pitfall 2: Race Conditions on Counter Decrement
**What goes wrong:** Multiple concurrent deletes cause incorrect completion counts (e.g., deleting 3 items decrements count by only 1).
**Why it happens:** Using read-then-update pattern instead of atomic operation.
**How to avoid:**
- Always use stored procedure for counter updates
- Never read count, modify in app, then write back
- Supabase RPC automatically wraps in transaction
**Warning signs:**
- Job counts are off by random amounts
- Hard to reproduce in testing but happens in production
- Logs show multiple DELETE calls completing at same time

### Pitfall 3: Hard Deleting Instead of Soft Deleting
**What goes wrong:** Existing DELETE endpoint (app/api/generation/[id]/route.ts) currently uses `.delete()` for hard delete.
**Why it happens:** Codebase has existing hard delete for pending generations, easy to forget to switch to soft delete.
**How to avoid:**
- Replace `.delete()` with `.update({ deleted_at: new Date().toISOString() })`
- Keep hard delete only for pending generations (not yet executed), soft delete for completed/processing
- Update endpoint to check generation state before choosing delete strategy
**Warning signs:**
- Data recovery is impossible
- Audit trail is lost
- Violates DELT-02 requirement

### Pitfall 4: Decrementing Count for All States
**What goes wrong:** Counter decremented for pending/failed generations that never incremented `completed_generations`.
**Why it happens:** Blindly decrementing without checking if generation was actually completed.
**How to avoid:**
- Only decrement `completed_generations` if generation state is 'completed'
- Check generation state before calling RPC function
- Consider separate counters for different states if needed
**Warning signs:**
- Completion count goes negative
- Total counts don't add up
- User confusion about job status

### Pitfall 5: Unique Constraint Violations After Delete+Re-upload
**What goes wrong:** User deletes generation, re-uploads same file, gets unique constraint error if unique index exists on (job_id, source_file_name).
**Why it happens:** Soft delete keeps deleted record in database, regular unique index includes it.
**How to avoid:**
- Use partial unique index with `WHERE deleted_at IS NULL` clause
- Only enforce uniqueness on non-deleted records
- Multiple deleted records with same key are allowed
**Warning signs:**
- User reports can't re-upload files after deleting
- Database unique constraint errors in logs
- Works fine first time but fails on retry

### Pitfall 6: Poor Confirmation UX
**What goes wrong:** Generic "Are you sure?" doesn't prevent accidents, user clicks through without reading.
**Why it happens:** Default confirm() dialog is easy but not informative.
**How to avoid:**
- Use specific messaging: "Delete this generation? This will remove it from results and downloads."
- Consider requiring generation filename in confirmation for extra safety
- Focus Cancel button by default if using custom dialog
**Warning signs:**
- Users frequently contact support to recover deleted items
- "I didn't mean to delete that" reports
- High accidental deletion rate

## Code Examples

Verified patterns from official sources and codebase analysis:

### Migration: Add Soft Delete Column
```sql
-- Migration: Add soft delete support to generations
-- Purpose: Enable DELT-01 through DELT-04 requirements
-- Created: Phase 12

-- Add deleted_at column (nullable timestamp)
ALTER TABLE generations
ADD COLUMN deleted_at TIMESTAMPTZ NULL;

-- Add index for efficient filtering of non-deleted records
-- Partial index only includes rows where deleted_at IS NULL
CREATE INDEX idx_generations_deleted_at
ON generations(deleted_at)
WHERE deleted_at IS NULL;

-- Add index for deleted records (for admin/audit queries)
CREATE INDEX idx_generations_deleted
ON generations(deleted_at)
WHERE deleted_at IS NOT NULL;

-- Create stored procedure for atomic counter decrement
CREATE OR REPLACE FUNCTION decrement_job_generation_count(
  p_job_id UUID
) RETURNS void AS $$
BEGIN
  UPDATE jobs
  SET completed_generations = GREATEST(completed_generations - 1, 0)
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION decrement_job_generation_count(UUID) TO authenticated;
```

### API Endpoint: Enhanced Delete with Soft Delete
```typescript
// app/api/generation/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Generation ID is required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 1. Fetch generation to verify and get metadata
    const { data: generation, error: fetchError } = await supabase
      .from('generations')
      .select('state, job_id, deleted_at')
      .eq('id', id)
      .single();

    if (fetchError || !generation) {
      return NextResponse.json(
        { success: false, error: 'Generation not found' },
        { status: 404 }
      );
    }

    // Check if already deleted
    if (generation.deleted_at) {
      return NextResponse.json(
        { success: false, error: 'Generation already deleted' },
        { status: 400 }
      );
    }

    // 2. Soft delete: set deleted_at timestamp
    const { error: deleteError } = await supabase
      .from('generations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (deleteError) {
      console.error('Error soft-deleting generation:', deleteError);
      return NextResponse.json(
        { success: false, error: 'Failed to delete generation' },
        { status: 500 }
      );
    }

    // 3. Atomic counter decrement (only for completed generations)
    if (generation.state === 'completed') {
      const { error: rpcError } = await supabase.rpc('decrement_job_generation_count', {
        p_job_id: generation.job_id
      });

      if (rpcError) {
        console.error('Error decrementing count:', rpcError);
        // Don't fail the request - deletion succeeded, counter will be eventually consistent
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Generation deleted',
    });
  } catch (error) {
    console.error('Error in generation delete endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Query Update: Filter Deleted Records
```typescript
// app/api/job/[jobId]/generations/route.ts (example update)
export async function GET(request: NextRequest, context: RouteContext) {
  const { jobId } = await context.params;
  const supabase = createServerSupabaseClient();

  const { data: generations, error } = await supabase
    .from('generations')
    .select('*')
    .eq('job_id', jobId)
    .is('deleted_at', null)  // CRITICAL: Filter soft-deleted
    .order('created_at');

  return NextResponse.json({ generations });
}

// app/api/job/[jobId]/download/route.ts (existing pattern + filter)
const { data: generations } = await supabase
  .from('generations')
  .select('id, source_file_name, result_url, folder_path')
  .eq('job_id', jobId)
  .eq('state', 'completed')
  .is('deleted_at', null)  // Exclude from ZIP download
  .not('result_url', 'is', null);
```

### UI Component: Delete Button with Confirmation
```typescript
// components/job/generation-card.tsx (enhancement pattern)
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GenerationCardProps {
  generation: {
    id: string;
    sourceFileName: string;
    state: 'pending' | 'processing' | 'completed' | 'failed';
  };
  onDeleted?: (id: string) => void;
}

export function GenerationCard({ generation, onDeleted }: GenerationCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    // Confirmation with specific messaging
    const confirmed = confirm(
      `Delete "${generation.sourceFileName}"?\n\n` +
      'This will remove it from your results and downloads.\n' +
      'This action cannot be undone.'
    );

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/generation/${generation.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Delete failed');
      }

      // Notify parent to remove from UI
      onDeleted?.(generation.id);
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('Failed to delete generation. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="generation-card">
      {/* Card content */}

      <Button
        variant="ghost"
        size="sm"
        onClick={handleDelete}
        disabled={isDeleting}
        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hard delete (DELETE FROM) | Soft delete (UPDATE deleted_at) | Since ~2015 | Data recovery, audit trails, compliance requirements |
| Manual counter updates | Atomic stored procedures | Always recommended | Race condition prevention in concurrent systems |
| Boolean is_deleted flag | Timestamp deleted_at | Modern standard | Forensic capabilities, time-travel queries, better audit |
| Generic confirm() | Custom AlertDialog with ARIA | 2020+ | Accessibility, mobile UX, consistent branding |
| Separate delete+update queries | Transaction-wrapped RPC | Supabase/PostgREST pattern | Automatic atomicity, simpler code |

**Deprecated/outdated:**
- **Hard delete for user data:** No longer acceptable for production systems due to compliance (GDPR right to access deleted data), data recovery needs
- **Read-modify-write counters:** Race conditions in modern concurrent systems, replaced by database-level atomic operations
- **Global unique indexes with soft delete:** Causes conflicts on re-upload after delete, replaced by partial unique indexes

## Open Questions

Things that couldn't be fully resolved:

1. **Should pending generations be soft-deleted or hard-deleted?**
   - What we know: Current implementation hard-deletes pending generations, soft-delete is for completed
   - What's unclear: Requirements don't specify, both approaches have merit (pending hasn't executed yet, less audit value)
   - Recommendation: Default to soft-delete everything for consistency, can optimize later if storage concerns arise

2. **Should delete be reversible (undelete feature)?**
   - What we know: Future requirement DELT-06 mentions "Undo delete within 30 seconds"
   - What's unclear: Not in v2.0 scope, but soft delete pattern enables it
   - Recommendation: Implement soft delete now, undelete feature can be added later without schema changes

3. **How to handle deleted generations in cost calculations?**
   - What we know: Deleted generations may have incurred costs already
   - What's unclear: Should deleted count reduce estimated_cost in jobs table?
   - Recommendation: Don't modify cost (already spent), consider adding actual_cost field that excludes deleted

4. **Confirmation dialog: native confirm() or custom component?**
   - What we know: Codebase uses native confirm(), project has Radix UI but no dialog component yet
   - What's unclear: User preference for UX polish level
   - Recommendation: Start with enhanced native confirm() (better messaging), upgrade to AlertDialog if user requests better UX

## Sources

### Primary (HIGH confidence)
- PostgreSQL official documentation - Partial indexes and unique constraints
- Supabase official documentation - RPC and stored procedures: [JavaScript API Reference](https://supabase.com/docs/reference/javascript/rpc)
- Codebase analysis: `app/api/generation/[id]/route.ts`, `supabase/migrations/001_jobs_and_generations.sql`, `app/api/job/[jobId]/download/route.ts`
- STATE.md: "Soft delete pattern: deleted_at timestamp, atomic count updates via stored procedure"

### Secondary (MEDIUM confidence)
- [Soft deletion with PostgreSQL - Evil Martians](https://evilmartians.com/chronicles/soft-deletion-with-postgresql-but-with-logic-on-the-database) - Database-level soft delete patterns
- [Using Stored Procedures (RPC) in Supabase to Increment a "Like" Counter](https://medium.com/geekculture/using-stored-procedures-rpc-in-supabase-to-increment-a-like-counter-9c5b2293a65b) - Atomic counter pattern
- [Atomic Increment/Decrement operations in SQL](https://medium.com/harrys-engineering/atomic-increment-decrement-operations-in-sql-and-fun-with-locks-f7b124d37873) - Race condition prevention
- [PostgreSQL Soft-Delete Strategies](https://dev.to/oddcoder/postgresql-soft-delete-strategies-balancing-data-retention-50lo) - Timestamp vs boolean
- [Partial unique indexes in PostgreSQL and Rails](https://www.ironin.it/blog/partial-unique-indexes-in-postgresql-and-rails.html) - Handling uniqueness with soft delete
- [Creating a Reusable Confirm Dialog in Next.js 15](https://medium.com/@mudasarmajeed5/creating-a-reusable-confirm-dialog-with-promise-based-api-in-next-js-15-shadcn-ui-78865935077e) - Modern confirmation patterns
- [React useOptimistic Hook](https://react.dev/reference/react/useOptimistic) - Optimistic UI updates

### Tertiary (LOW confidence)
- [Soft Deletion Probably Isn't Worth It](https://brandur.org/soft-deletion) - Contrarian view (noted for completeness, but requirements mandate soft delete)
- Various Stack Overflow discussions on soft delete patterns (multiple sources agree on timestamp approach)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - PostgreSQL soft delete and Supabase RPC are well-established, verified in official docs
- Architecture: HIGH - Patterns verified in codebase, official PostgreSQL/Supabase documentation, and multiple authoritative sources
- Pitfalls: HIGH - Common mistakes documented across multiple sources, validated against existing codebase patterns

**Research date:** 2026-01-27
**Valid until:** 30 days (stable patterns - PostgreSQL/Supabase APIs rarely change)

**Technology stack versions verified:**
- PostgreSQL: 11+ (soft delete features stable since v9.x)
- Supabase: Current (RPC API stable)
- Next.js: 15+ (project using App Router)
- Radix UI: 2.x (if implementing custom dialog)
- React: 19+ (if using useOptimistic)
