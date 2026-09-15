'use client';

import { use, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { LoadingScreen } from '@/components/ui';

/** A ready-to-print table tent: big QR, table name, short instructions. */
export default function PrintQrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<{ qr: string; url: string; label: string; zone: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.tableQr(id)
      .then((res) => setData({ qr: res.qr, url: res.url, label: res.table.label, zone: res.table.zone }))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the QR code'));
  }, [id]);

  if (error) return <main className="px-6 py-16 text-center text-slate-700">{error}</main>;
  if (!data) return <LoadingScreen label="Generating the QR code…" />;

  return (
    <main className="mx-auto max-w-md bg-white px-8 py-10 text-center">
      <div className="no-print mb-6 flex gap-2">
        <button type="button" onClick={() => window.print()} className="btn-primary flex-1">🖨️ Print table tent</button>
        <button type="button" onClick={() => window.close()} className="btn-secondary">Close</button>
      </div>

      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Scan to order</p>
      <h1 className="mt-2 text-4xl font-bold text-slate-900">{data.label}</h1>
      <p className="text-sm text-slate-500">{data.zone}</p>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.qr} alt={`QR code for ${data.label}`} className="mx-auto my-8 w-64" />

      <ol className="mx-auto max-w-xs space-y-1.5 text-left text-sm text-slate-600">
        <li>1. Point your phone camera at the code</li>
        <li>2. Browse the menu and add what you like</li>
        <li>3. Send it straight to our kitchen</li>
        <li>4. Ask for the bill from the same screen</li>
      </ol>

      <p className="mt-6 break-all text-[10px] text-slate-400">{data.url}</p>
    </main>
  );
}
