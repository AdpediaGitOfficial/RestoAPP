'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiError, authApi, clearToken, getToken, readTokenClaims } from '@/lib/api';
import type { Role, StaffUser } from '@/lib/types';
import { LoadingScreen } from '@/components/ui';
import Logo from '@/components/Logo';

/**
 * The main navigation, in the order the work happens: what the day looks
 * like, then money, then the two live boards, then the things you set up
 * once. Settings is not here — it lives under the account menu with the
 * other things that belong to the person rather than the service.
 */
const NAV: { href: string; label: string; icon: string; roles: Role[] }[] = [
  { href: '/admin', label: 'Dashboard', icon: '📊', roles: ['ADMIN'] },
  { href: '/supervisor/bills', label: 'Bills', icon: '🧾', roles: ['SUPERVISOR', 'ADMIN'] },
  { href: '/kitchen', label: 'Kitchen', icon: '👨‍🍳', roles: ['KITCHEN', 'SUPERVISOR', 'ADMIN'] },
  { href: '/supervisor', label: 'Floor', icon: '🪑', roles: ['SUPERVISOR', 'ADMIN'] },
  { href: '/admin/menu', label: 'Menu', icon: '🍽️', roles: ['ADMIN'] },
  { href: '/admin/tables', label: 'Tables & QR', icon: '🔲', roles: ['ADMIN'] },
  { href: '/admin/staff', label: 'Staff', icon: '👥', roles: ['ADMIN'] },
];

/** The account menu, behind the signed-in person's name. */
const ACCOUNT: { href: string; label: string; icon: string; roles: Role[] }[] = [
  { href: '/profile', label: 'Profile', icon: '👤', roles: ['KITCHEN', 'SUPERVISOR', 'ADMIN'] },
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
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  // A menu that only closes by clicking its own button is a trap on a tablet,
  // where there is no Escape key within reach and no obvious way back.
  useEffect(() => {
    if (!accountOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAccountOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);

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

  useEffect(() => { setAccountOpen(false); setMenuOpen(false); }, [pathname]);

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
  const account = ACCOUNT.filter((a) => user.role === 'ADMIN' || a.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link
            href={nav[0]?.href ?? '/'}
            aria-label="Qpab home"
            className="shrink-0 text-slate-900 dark:text-slate-100"
          >
            {/* The lockup is 3.8:1, so below sm it would have to shrink the
                wordmark past reading size. The mark carries it there. */}
            <Logo variant="mark" className="h-7 w-auto sm:hidden" />
            <Logo className="hidden h-7 w-auto sm:block" />
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
            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <span className="hidden sm:block">
                  <span className="block text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">{user.name}</span>
                  <span className="block text-xs capitalize text-slate-500 dark:text-slate-400">{user.role.toLowerCase()}</span>
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 dark:bg-slate-700 dark:text-brand-300">
                  {user.name.trim().charAt(0).toUpperCase() || '?'}
                </span>
                <svg viewBox="0 0 12 12" aria-hidden className={`h-3 w-3 text-slate-400 transition-transform ${accountOpen ? 'rotate-180' : ''}`}>
                  <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lift dark:border-slate-700 dark:bg-slate-800"
                >
                  <p className="border-b border-slate-100 px-3 py-2 dark:border-slate-700 sm:hidden">
                    <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{user.name}</span>
                    <span className="block text-xs capitalize text-slate-500">{user.role.toLowerCase()}</span>
                  </p>
                  {account.map((a) => (
                    <Link
                      key={a.href}
                      href={a.href}
                      role="menuitem"
                      onClick={() => setAccountOpen(false)}
                      className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <span className="mr-2" aria-hidden>{a.icon}</span>{a.label}
                    </Link>
                  ))}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={signOut}
                    className="block w-full border-t border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <span className="mr-2" aria-hidden>🚪</span>Sign out
                  </button>
                </div>
              )}
            </div>
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
