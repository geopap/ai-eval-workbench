import { load, save, log } from './store.js';
import { saturation } from './engine.js';
import * as overview from './views/overview.js';
import * as spec from './views/specview.js';
import * as review from './views/review.js';
import * as failures from './views/failures.js';
import * as judge from './views/judge.js';
import * as gate from './views/gate.js';
import * as evidence from './views/evidence.js';
import * as integrations from './views/integrations.js';
import * as audit from './views/audit.js';
import * as about from './views/about.js';

const ROUTES = { overview, spec, review, failures, judge, gate, evidence, integrations, audit, about };

let state = load();
const root = document.getElementById('view');

function parseHash() {
  const [p, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { name: ROUTES[p] ? p : 'overview', params: Object.fromEntries(new URLSearchParams(query)) };
}

function render() {
  const { name, params } = parseHash();
  const view = ROUTES[name];
  const ctx = {
    state, params, root,
    refresh: () => render(),
    go: (h) => { if (location.hash === h) render(); else location.hash = h; },
    replaceState: (s) => { state = s; render(); },
  };
  const y = window.scrollY;
  root.innerHTML = view.render(ctx);
  view.bind?.(ctx);
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#/${name}`));
  document.body.classList.remove('nav-open');
  const todo = state.traces.filter((t) => !t.review).length;
  const badge = document.getElementById('todo');
  badge.textContent = todo ? `${todo} to review` : '';
  badge.hidden = !todo;
  window.scrollTo(0, y);
  save(state);
}

let lastRoute = '';
window.addEventListener('hashchange', () => {
  const { name, params } = parseHash();
  const key = name + (params.id || params.fm || params.run || '');
  render();
  if (name !== lastRoute.split('|')[0] || (name !== 'review' && key !== lastRoute.split('|')[1])) window.scrollTo(0, 0);
  lastRoute = `${name}|${key}`;
});
document.getElementById('menu').addEventListener('click', () => document.body.classList.toggle('nav-open'));

const applyTheme = (t) => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
try { applyTheme(localStorage.getItem('aiew.theme')); } catch { /* ignore */ }
document.getElementById('theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('aiew.theme', next); } catch { /* ignore */ }
});

(async () => {
  if (!state.audit.length) {
    const s = saturation(state.traces, state.fms);
    await log(state, 'system', 'ROUND_LOADED', `${s.total} conversations from v2.3-rc1, ${s.reviewed} already reviewed, ${state.fms.length} failure modes`);
  }
  const { name } = parseHash();
  lastRoute = `${name}|`;
  render();
})();
