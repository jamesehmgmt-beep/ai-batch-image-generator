import { JobContextProvider } from '@/lib/session/job-context'
import { AppHeader } from '@/components/layout/app-header'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <JobContextProvider>
      <div className="min-h-screen flex flex-col">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8">
          {children}
        </main>
      </div>
    </JobContextProvider>
  )
}
