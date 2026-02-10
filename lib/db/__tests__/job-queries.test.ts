import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase client - use any to avoid complex mock type inference issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockOrder = vi.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockLt = vi.fn<any>(() => ({ order: mockOrder }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockEq = vi.fn<any>(() => ({ lt: mockLt }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSelect = vi.fn<any>(() => ({ eq: mockEq, order: mockOrder }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUpdateEq = vi.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUpdate = vi.fn<any>(() => ({ eq: mockUpdateEq }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFrom = vi.fn<any>(() => ({
  select: mockSelect,
  update: mockUpdate,
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

describe('job-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset console mocks
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findOrphanedGenerations', () => {
    it('finds orphaned generations older than timeout threshold', async () => {
      const mockOrphaned = [
        {
          id: 'gen-1',
          job_id: 'job-1',
          started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          operation: 'test prompt',
          retry_count: 0,
          source_file_name: 'test.jpg',
        },
      ];

      mockOrder.mockResolvedValue({ data: mockOrphaned, error: null });

      const { findOrphanedGenerations } = await import('../job-queries');
      const orphaned = await findOrphanedGenerations(15);

      expect(orphaned).toHaveLength(1);
      expect(orphaned[0].id).toBe('gen-1');
      expect(mockFrom).toHaveBeenCalledWith('generations');
      expect(mockSelect).toHaveBeenCalledWith('id, job_id, started_at, operation, retry_count, source_file_name');
      expect(mockEq).toHaveBeenCalledWith('state', 'processing');
    });

    it('returns empty array when no orphaned generations', async () => {
      mockOrder.mockResolvedValue({ data: [], error: null });

      const { findOrphanedGenerations } = await import('../job-queries');
      const orphaned = await findOrphanedGenerations(15);

      expect(orphaned).toHaveLength(0);
    });

    it('returns empty array on query error', async () => {
      mockOrder.mockResolvedValue({ data: null, error: { message: 'DB error' } });

      const { findOrphanedGenerations } = await import('../job-queries');
      const orphaned = await findOrphanedGenerations(15);

      expect(orphaned).toHaveLength(0);
    });

    it('uses custom timeout threshold', async () => {
      mockOrder.mockResolvedValue({ data: [], error: null });

      const { findOrphanedGenerations } = await import('../job-queries');
      await findOrphanedGenerations(30);

      // Verify lt was called with a timestamp 30 minutes ago
      expect(mockLt).toHaveBeenCalled();
      const ltCalls = mockLt.mock.calls;
      expect(ltCalls.length).toBeGreaterThan(0);
      const ltCall = ltCalls[0] as [string, string];
      expect(ltCall[0]).toBe('started_at');
      // The timestamp should be approximately 30 minutes ago
      const threshold = new Date(ltCall[1]);
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      // Allow 1 second tolerance
      expect(Math.abs(threshold.getTime() - thirtyMinutesAgo.getTime())).toBeLessThan(1000);
    });
  });

  describe('resetGenerationToPending', () => {
    it('resets a generation to pending state', async () => {
      // Mock the select for getting current retry_count
      mockFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: { retry_count: 2 }, error: null }))
          }))
        })),
      });

      // Mock the update
      mockFrom.mockReturnValueOnce({
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
      });

      const { resetGenerationToPending } = await import('../job-queries');
      const result = await resetGenerationToPending('gen-123');

      expect(result).toBe(true);
    });

    it('returns false on fetch error', async () => {
      // Mock fetch failure
      mockFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: { message: 'Not found' } }))
          }))
        })),
      });

      const { resetGenerationToPending } = await import('../job-queries');
      const result = await resetGenerationToPending('gen-nonexistent');

      expect(result).toBe(false);
    });

    it('returns false on update error', async () => {
      // Mock successful fetch
      mockFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: { retry_count: 0 }, error: null }))
          }))
        })),
      });

      // Mock update failure
      mockFrom.mockReturnValueOnce({
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: { message: 'Update failed' } })) })),
      });

      const { resetGenerationToPending } = await import('../job-queries');
      const result = await resetGenerationToPending('gen-123');

      expect(result).toBe(false);
    });
  });

  describe('getStuckJobsSummary', () => {
    it('returns zero counts when no processing jobs', async () => {
      // Reset and set up fresh mock for this test
      vi.clearAllMocks();
      const localMockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
      const localMockEq = vi.fn(() => ({ order: localMockOrder }));
      const localMockSelect = vi.fn(() => ({ eq: localMockEq, order: localMockOrder }));
      mockFrom.mockReturnValue({
        select: localMockSelect,
        update: mockUpdate,
      });

      const { getStuckJobsSummary } = await import('../job-queries');
      const summary = await getStuckJobsSummary();

      expect(summary.stuckCount).toBe(0);
      expect(summary.oldestStuckMinutes).toBe(0);
    });

    it('returns correct counts for processing jobs', async () => {
      // Reset and set up fresh mock for this test
      vi.clearAllMocks();
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const localMockOrder = vi.fn().mockResolvedValue({
        data: [
          { started_at: tenMinutesAgo },
          { started_at: fiveMinutesAgo },
        ],
        error: null,
      });
      const localMockEq = vi.fn(() => ({ order: localMockOrder }));
      const localMockSelect = vi.fn(() => ({ eq: localMockEq, order: localMockOrder }));
      mockFrom.mockReturnValue({
        select: localMockSelect,
        update: mockUpdate,
      });

      const { getStuckJobsSummary } = await import('../job-queries');
      const summary = await getStuckJobsSummary();

      expect(summary.stuckCount).toBe(2);
      // Oldest should be ~10 minutes
      expect(summary.oldestStuckMinutes).toBeGreaterThanOrEqual(9);
      expect(summary.oldestStuckMinutes).toBeLessThanOrEqual(11);
    });

    it('returns safe defaults on error', async () => {
      // Reset and set up fresh mock for this test
      vi.clearAllMocks();
      const localMockOrder = vi.fn().mockResolvedValue({ data: null, error: { message: 'Query failed' } });
      const localMockEq = vi.fn(() => ({ order: localMockOrder }));
      const localMockSelect = vi.fn(() => ({ eq: localMockEq, order: localMockOrder }));
      mockFrom.mockReturnValue({
        select: localMockSelect,
        update: mockUpdate,
      });

      const { getStuckJobsSummary } = await import('../job-queries');
      const summary = await getStuckJobsSummary();

      expect(summary.stuckCount).toBe(0);
      expect(summary.oldestStuckMinutes).toBe(0);
    });
  });
});

describe('RecoveryManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Reset module cache to get fresh instances
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts and stops without errors', async () => {
    // Mock findOrphanedGenerations to return empty
    vi.doMock('@/lib/db/job-queries', () => ({
      findOrphanedGenerations: vi.fn(() => Promise.resolve([])),
      resetGenerationToPending: vi.fn(() => Promise.resolve(true)),
    }));

    const { RecoveryManager } = await import('../../queue/recovery-manager');
    const manager = new RecoveryManager({ checkIntervalMs: 100000 });

    expect(manager.isActive()).toBe(false);

    manager.start();
    expect(manager.isActive()).toBe(true);

    manager.stop();
    expect(manager.isActive()).toBe(false);
  });

  it('warns when starting an already running manager', async () => {
    vi.doMock('@/lib/db/job-queries', () => ({
      findOrphanedGenerations: vi.fn(() => Promise.resolve([])),
      resetGenerationToPending: vi.fn(() => Promise.resolve(true)),
    }));

    const { RecoveryManager } = await import('../../queue/recovery-manager');
    const manager = new RecoveryManager({ checkIntervalMs: 100000 });

    manager.start();
    manager.start(); // Should warn

    expect(console.warn).toHaveBeenCalledWith('[Recovery] Recovery manager already running');

    manager.stop();
  });

  it('uses singleton pattern via getRecoveryManager', async () => {
    vi.doMock('@/lib/db/job-queries', () => ({
      findOrphanedGenerations: vi.fn(() => Promise.resolve([])),
      resetGenerationToPending: vi.fn(() => Promise.resolve(true)),
    }));

    const { getRecoveryManager } = await import('../../queue/recovery-manager');

    const manager1 = getRecoveryManager();
    const manager2 = getRecoveryManager();

    expect(manager1).toBe(manager2);
  });

  it('uses default config values', async () => {
    vi.doMock('@/lib/db/job-queries', () => ({
      findOrphanedGenerations: vi.fn(() => Promise.resolve([])),
      resetGenerationToPending: vi.fn(() => Promise.resolve(true)),
    }));

    const { RecoveryManager } = await import('../../queue/recovery-manager');
    const manager = new RecoveryManager();

    const config = manager.getConfig();
    expect(config.timeoutMinutes).toBe(15);
    expect(config.checkIntervalMs).toBe(60000);
  });

  it('accepts custom config values', async () => {
    vi.doMock('@/lib/db/job-queries', () => ({
      findOrphanedGenerations: vi.fn(() => Promise.resolve([])),
      resetGenerationToPending: vi.fn(() => Promise.resolve(true)),
    }));

    const { RecoveryManager } = await import('../../queue/recovery-manager');
    const manager = new RecoveryManager({
      timeoutMinutes: 30,
      checkIntervalMs: 120000,
    });

    const config = manager.getConfig();
    expect(config.timeoutMinutes).toBe(30);
    expect(config.checkIntervalMs).toBe(120000);
  });

  it('recovers orphaned generations during check', async () => {
    const mockFindOrphanedGenerations = vi.fn(() =>
      Promise.resolve([
        {
          id: 'gen-1',
          job_id: 'job-1',
          started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          operation: 'test',
          retry_count: 0,
          source_file_name: 'test.jpg',
        },
      ])
    );
    const mockResetGenerationToPending = vi.fn(() => Promise.resolve(true));

    vi.doMock('@/lib/db/job-queries', () => ({
      findOrphanedGenerations: mockFindOrphanedGenerations,
      resetGenerationToPending: mockResetGenerationToPending,
    }));

    const { RecoveryManager } = await import('../../queue/recovery-manager');
    const manager = new RecoveryManager({ checkIntervalMs: 100000 });

    const recovered = await manager.runRecoveryCheck();

    expect(recovered).toBe(1);
    expect(mockFindOrphanedGenerations).toHaveBeenCalledWith(15);
    expect(mockResetGenerationToPending).toHaveBeenCalledWith('gen-1');
  });

  it('returns 0 when no orphaned generations found', async () => {
    vi.doMock('@/lib/db/job-queries', () => ({
      findOrphanedGenerations: vi.fn(() => Promise.resolve([])),
      resetGenerationToPending: vi.fn(() => Promise.resolve(true)),
    }));

    const { RecoveryManager } = await import('../../queue/recovery-manager');
    const manager = new RecoveryManager({ checkIntervalMs: 100000 });

    const recovered = await manager.runRecoveryCheck();

    expect(recovered).toBe(0);
  });
});
