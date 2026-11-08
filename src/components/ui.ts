// Shared Tailwind class strings so every screen looks the same.
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800';
export const card = 'rounded-xl border border-slate-200 bg-white p-6';
export const field = `mt-1 block min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 text-sm ${focus}`;
const btn = `inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;
export const primary = `${btn} bg-blue-800 text-white hover:bg-blue-900`;
export const outline = `${btn} border border-slate-400 bg-white text-slate-900 hover:bg-slate-50`;
export const green = `${btn} bg-green-700 text-white hover:bg-green-800`;
export const danger = `${btn} border border-red-700 bg-white text-red-700 hover:bg-red-50`;
export const th = 'py-2 pr-4 text-xs font-semibold text-slate-600';
export const td = 'border-t border-slate-200 py-3 pr-4';
