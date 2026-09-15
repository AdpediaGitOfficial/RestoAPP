'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authApi, clearToken, getToken } from '@/lib/api';
import type { Role, StaffUser } from '@/lib/types';
import { LoadingScreen } from '@/components/ui';

const NAV: { href: string; label: string; icon: string; roles: Role[] }[] = [
  { href: '/kitchen', label: 'Kitchen', icon: '👨‍🍳', roles: ['KITCHEN', 'SUPERVISOR', 'ADMIN'] },
  { href: '/supervisor', label: 'Floor', icon: '🪑', roles: ['SUPERVISOR', 'ADMIN'] },
  { href: '/supervisor/bills', label: 'Bills', icon: '🧾', roles: ['SUPERVISOR', 'ADMIN'] },
  { href: '/admin', label: 'Dashboard', icon: '📊', roles: ['ADMIN'] },
  { href: '/admin/menu', label: 'Menu', icon: '🍽️', roles: ['ADMIN'] },
  { href: '/admin/tables', label: 'Tables & QR', icon: '🔲', roles: ['ADMIN'] },
  { href: '/admin/staff', label: 'Staff', icon: '👥', roles: ['ADMIN'] },
  { href: '/admin/settings', label: 'Settings', icon: '⚙️', roles: ['ADMIN'] },
];

/**
 * Chrome for every staff screen: checks the session, shows only the
 * navigation the signed-in role may use, and handles sign-out.
 */
export default function StaffShell({ children, requires, title }: {
  children: (user: StaffUser) => React.ReactNode;
  requires: Role[];
  title: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'denied'>('loading');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    authApi.me()
      .then(({ user: u }) => {
        setUser(u);
        setState(u.role === 'ADMIN' || requires.includes(u.role) ? 'ready' : 'denied');
      })
      .catch(() => router.replace(`/login?next=${encodeURIComponent(pathname)}`));
    // `requires` is a literal at every call site, so this runs once per screen.
  }, [router, pathname]);

  const signOut = async () => {
    await authApi.logout().catch(() => {});
    clearToken();
    router.replace('/login');
  };

  if (state === 'loading') return <LoadingScreen label="Checking your access…" />;

  if (state === 'denied' || !user) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-4xl" aria-hidden>🚫</p>
        <h1 className="mt-4 text-xl font-bold text-slate-900">You do not have access to this screen</h1>
        <p className="mt-2 text-sm text-slate-500">
          Signed in as {user?.name} ({user?.role.toLowerCase()}). Ask an admin if you need access.
        </p>
        <button type="button" onClick={signOut} className="btn-secondary mt-6">Sign out</button>
      </main>
    );
  }

  const nav = NAV.filter((n) => user.role === 'ADMIN' || n.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link href={nav[0]?.href ?? '/'} className="flex items-center gap-2 font-bold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">R</span>
            <span className="hidden sm:inline">RestoAPP</span>
          </Link>

          <nav className="no-scrollbar -mx-1 hidden flex-1 gap-1 overflow-x-auto px-1 md:flex" aria-label="Main">
            {nav.map((n) => {
              const active = pathname === n.href || (n.href !== '/admin' && pathname.startsWith(`${n.href}/`));
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="mr-1.5" aria-hidden>{n.icon}</span>{n.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-slate-900">{user.name}</p>
              <p className="text-xs capitalize text-slate-500">{user.role.toLowerCase()}</p>
            </div>
            <button type="button" onClick={signOut} className="btn-ghost btn-sm">Sign out</button>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="btn-secondary btn-sm md:hidden"
              aria-expanded={menuOpen}
              aria-label="Toggle navigation"
            >
              ☰
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="grid grid-cols-2 gap-1 border-t border-slate-100 px-4 py-2 md:hidden" aria-label="Main (mobile)">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <span className="mr-1.5" aria-hidden>{n.icon}</span>{n.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        <h1 className="sr-only">{title}</h1>
        {children(user)}
      </main>
    </div>
  );
}
