'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, authApi, clearToken, getToken, readTokenClaims } from '@/lib/api';
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
export default function StaffShell({ children, requires, title, wide = false }: {
  children: (user: StaffUser) => React.ReactNode;
  requires: Role[];
  title: string;
  /** Let a screen use the whole display. The kitchen board is usually on a
   *  wall-mounted panel, where boxing it to 1280px throws away columns. */
  wide?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'denied'>('loading');
  const [menuOpen, setMenuOpen] = useState(false);

  const permitted = (role: Role) => role === 'ADMIN' || requires.includes(role);

  useEffect(() => {
    if (!getToken()) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    // Draw the screen from the claims already in the token rather than
    // waiting on a round trip. The children mount now, so their own data
    // request goes out alongside the verification below instead of queueing
    // behind it — which is what made every staff screen open on a spinner.
    const claims = readTokenClaims();
    if (claims) {
      setUser({ id: claims.sub, name: claims.name, email: '', role: claims.role, is_active: true });
      setState(permitted(claims.role) ? 'ready' : 'denied');
    } else {
      // Missing or expired: nothing worth rendering optimistically.
      clearToken();
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    // The server remains the authority. If the role really differs — or the
    // token is rejected — this corrects the screen a moment later.
    authApi.me()
      .then(({ user: u }) => {
        setUser(u);
        setState(permitted(u.role) ? 'ready' : 'denied');
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearToken();
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        }
        // Anything else (offline, a blip) leaves the optimistic view in place
        // rather than throwing the user out mid-shift.
      });
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link href={nav[0]?.href ?? '/'} className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
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
                    active ? 'bg-brand-50 text-brand-700 dark:bg-slate-700 dark:text-brand-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className="mr-1.5" aria-hidden>{n.icon}</span>{n.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">{user.name}</p>
              <p className="text-xs capitalize text-slate-500 dark:text-slate-400">{user.role.toLowerCase()}</p>
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

      <main className={`mx-auto px-4 py-5 ${wide ? 'max-w-none' : 'max-w-7xl'}`}>
        <h1 className="sr-only">{title}</h1>
        {children(user)}
      </main>
    </div>
  );
}
