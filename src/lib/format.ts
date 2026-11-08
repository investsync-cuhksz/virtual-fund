export const usd = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(cents / 100);
export const pct = (n: number, dp = 1, sign = false) => `${sign && n > 0 ? '+' : ''}${n.toFixed(dp)}%`;
export const pp = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)} pp`;
export const tone = (n: number) => (n > 0 ? 'text-green-700' : n < 0 ? 'text-red-700' : 'text-slate-900');
export const shortDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
