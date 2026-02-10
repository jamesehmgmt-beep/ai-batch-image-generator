'use client';

import { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GenerationItem } from './generation-item';
import type { GenerationUpdate } from '@/lib/hooks/use-job-progress';
import { Search } from 'lucide-react';

interface GenerationListProps {
  generations: GenerationUpdate[];
  filterState?: 'all' | 'pending' | 'processing' | 'completed' | 'failed';
}

export function GenerationList({
  generations,
  filterState = 'all',
}: GenerationListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Filter generations by state
  const filteredGenerations = useMemo(() => {
    if (filterState === 'all') return generations;
    return generations.filter((g) => g.state === filterState);
  }, [generations, filterState]);

  // Initialize virtualizer
  const virtualizer = useVirtualizer({
    count: filteredGenerations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Estimated height of each item in pixels
    overscan: 10, // Render 10 extra items above/below viewport for smooth scrolling
  });

  const virtualItems = virtualizer.getVirtualItems();

  if (filteredGenerations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Search className="w-8 h-8 mb-2 opacity-50" />
        <p>No generations {filterState !== 'all' ? `with status "${filterState}"` : ''}</p>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="h-[500px] overflow-auto rounded-lg border border-gray-800"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const generation = filteredGenerations[virtualItem.index];
          return (
            <div
              key={generation.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
                padding: '4px 8px',
              }}
            >
              <GenerationItem generation={generation} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
