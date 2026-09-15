'use client';

import { use, useEffect, useState } from 'react';
import { staffApi, type PrintJob } from '@/lib/api';
import { LoadingScreen } from '@/components/ui';

/**
 * Renders a stored print job as monospaced text and opens the print dialog.
 * This is the fallback path when no network thermal printer is configured.
 */
export default function PrintKotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<PrintJob | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    staffApi.printJob(id)
      .then(({ job: j }) => {
        setJob(j);
        // Give the browser a tick to lay the text out before printing.
        setTimeout(() => {
          window.print();
          staffApi.markPrinted(j.id).catch(() => {});
        }, 350);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the ticket'));
  }, [id]);

  if (error) return <main className="px-6 py-16 text-center text-slate-700">{error}</main>;
  if (!job) return <LoadingScreen label="Loading the ticket…" />;

  return (
    <main className="mx-auto max-w-sm bg-white px-4 py-5">
      <div className="no-print mb-4 flex gap-2">
        <button type="button" onClick={() => window.print()} className="btn-primary flex-1">🖨️ Print again</button>
        <button type="button" onClick={() => window.close()} className="btn-secondary">Close</button>
      </div>
      <pre className="print-ticket whitespace-pre font-mono text-[11px] leading-snug text-black">{job.content}</pre>
    </main>
  );
}
