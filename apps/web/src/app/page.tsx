import Link from 'next/link';

/** A signpost for staff devices; guests always arrive via a table QR link. */
export default function Home() {
  const entries = [
    { href: '/login', title: 'Staff sign in', desc: 'Kitchen, supervisors and admins', icon: '🔐' },
    { href: '/kitchen', title: 'Kitchen display', desc: 'Live tickets as orders come in', icon: '👨‍🍳' },
    { href: '/supervisor', title: 'Floor view', desc: 'Tables, running totals and bill requests', icon: '🧾' },
    { href: '/admin', title: 'Admin', desc: 'Menu, tables, QR codes and daily metrics', icon: '⚙️' },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">RestoAPP</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Table ordering, kitchen and billing</h1>
      <p className="mt-3 max-w-xl text-slate-600">
        Guests scan the QR code on their table to browse the menu and order. Orders print in the kitchen,
        supervisors watch every table and settle bills, and admins manage the menu and see the day&apos;s numbers.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {entries.map((e) => (
          <Link key={e.href} href={e.href} className="card group p-5 transition hover:ring-brand-300">
            <span className="text-2xl" aria-hidden>{e.icon}</span>
            <h2 className="mt-2 font-semibold text-slate-900 group-hover:text-brand-700">{e.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{e.desc}</p>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-sm text-slate-500">
        Looking for the guest menu? Scan the QR code on your table, or open a link of the
        form <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">/t/&lt;table-code&gt;</code>.
      </p>
    </main>
  );
}
