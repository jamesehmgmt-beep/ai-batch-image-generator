'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useJobContext } from '@/lib/session/job-context';
import { History, Plus } from 'lucide-react';

export function AppHeader() {
  const router = useRouter();
  const { reset } = useJobContext();

  const handleNewJob = () => {
    // Clear all job context before navigating
    reset();
    router.push('/upload');
  };

  return (
    <header className="border-b border-border">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <h1 className="text-lg font-semibold">BulkImageGen</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleNewJob}>
            <Plus className="h-4 w-4 mr-2" />
            New Job
          </Button>
          <Link href="/job/history">
            <Button variant="ghost" size="sm">
              <History className="h-4 w-4 mr-2" />
              History
            </Button>
          </Link>
          <form action="/api/auth" method="DELETE">
            <Button variant="ghost" size="sm" type="submit">
              Logout
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
