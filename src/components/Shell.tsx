'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { listOrders } from '@/lib/api';

export const USERS = [{ id: 'kellen', name: 'Kellen' }, { id: 'angelo', name: 'Angelo' }];
const ActorContext = createContext('kellen');
export const useActor = () => useContext(ActorContext);
// Pages call this after they change an order so the header count updates at once.
const RefreshContext = createContext<() => void>(() => { });
export const useRefreshOrders = () => useContext(RefreshContext);

// built: false for pages that doesnt exist yet
const TABS = [
  { href: '/enter-order', label: 'Enter order', built: true },
  { href: '/orders', label: 'Orders', built: true },
  { href: '/dashboard', label: 'Dashboard', built: true },
  { href: '/ledger', label: 'Ledger', built: false },
  { href: '/valuation', label: 'Valuation', built: true },
  { href: '/settings', label: 'Settings', built: false },
];

export default function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const path = usePathname();
  const [actor, setActor] = useState('kellen');
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem('actorId');
    if (saved && USERS.some((u) => u.id === saved)) {
      const frame = requestAnimationFrame(() => setActor(saved));
      return () => cancelAnimationFrame(frame);
    }
  }, []);

  const refresh = useCallback(() => {
    listOrders()
      .then((o) => setPending(o.filter((x) => x.status === 'PENDING').length))
      .catch(() => { });
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('orders-changed', refresh);
    return () => window.removeEventListener('orders-changed', refresh);
  }, [path, refresh]);

  function pick(id: string) {
    setActor(id);
    localStorage.setItem('actorId', id);
  }

  const tab = 'relative flex h-[60px] items-center px-3.5 text-[15px] font-semibold';

  return (
    <ActorContext.Provider value={actor}>
      <RefreshContext.Provider value={refresh}>
        <div className="min-h-screen bg-slate-50 text-slate-900">
          <header className="border-b border-slate-200 bg-white">
            <div className="flex min-h-[60px] flex-wrap items-center gap-x-8 px-6">
              <div className="flex items-center gap-2.5 py-3">
                <Image src="/InvestSyncLogo.webp" alt="" width={36} height={36} unoptimized />
                <span className="text-lg">
                  <span className="font-bold text-blue-800">InvestSync</span>{' '}
                  <span className="text-slate-500">Virtual Fund</span>
                </span>
              </div>

              <nav aria-label="Main" className="flex">
                {TABS.map((t) => {
                  const on = path === t.href;
                  const label = t.href === '/orders' && pending > 0 ? `Orders (${pending})` : t.label;
                  if (!t.built) {
                    return (
                      <span key={t.href} aria-disabled="true" title="Coming later" className={`${tab} cursor-default text-slate-600`}>
                        {label}
                      </span>
                    );
                  }
                  return (
                    <Link
                      key={t.href}
                      href={t.href}
                      aria-current={on ? 'page' : undefined}
                      className={`${tab} ${on ? 'text-blue-800' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      {label}
                      {on && <span className="absolute inset-x-0 bottom-0 h-1 bg-blue-800" />}
                    </Link>
                  );
                })}
              </nav>

              <div className="relative ml-auto py-2">
                <label htmlFor="actor" className="sr-only">Acting as</label>
                <select
                  id="actor"
                  value={actor}
                  onChange={(e) => pick(e.target.value)}
                  className="h-10 w-[270px] max-w-full appearance-none rounded-lg border border-slate-300 bg-white pl-4 pr-9 text-sm font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
                >
                  {USERS.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} (committee)</option>
                  ))}
                </select>
                <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-700">▾</span>
              </div>
            </div>
          </header>

          <main className={`mx-auto w-full py-8 ${wide ? 'max-w-[1280px] px-10' : 'max-w-6xl px-6'}`}>{children}</main>
        </div>
      </RefreshContext.Provider>
    </ActorContext.Provider>
  );
}
