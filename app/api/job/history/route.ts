// app/api/job/history/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getJobHistory } from '@/lib/db/job-history-queries';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // Validate parameters
    if (isNaN(offset) || offset < 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid offset parameter' },
        { status: 400 }
      );
    }
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { success: false, error: 'Invalid limit parameter (must be 1-100)' },
        { status: 400 }
      );
    }

    const result = await getJobHistory(limit, offset);

    return NextResponse.json({
      success: true,
      jobs: result.jobs,
      totalCount: result.totalCount,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('[JobHistoryAPI] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch job history' },
      { status: 500 }
    );
  }
}
