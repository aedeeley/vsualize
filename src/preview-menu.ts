import type { Settings, VisualId } from './types.js';
import type { Renderer } from './renderer.js';
import { VISUALS } from './visuals/index.js';
import { cleanPreviewTuning, PREVIEW_TUNING_KEY, SPIN_WEIGHTS } from './preview-tuning.js';
import type { PreviewTuning } from './preview-tuning.js';

type CoreKey = 'intensity' | 'lineWidth' | 'motion' | 'glow';
type Labels = readonly [string, string, string, string];
/** Labels describe the existing shader controls, without changing saved profiles. */
export const EFFECT_LABELS: Record<VisualId, Labels> = {
  soundform: ['Wave height', 'Line thickness', 'Reaction', 'Glow'],
  'soundform-topdown': ['Wave height', 'Line thickness', 'Reaction', 'Glow'],
  glass: ['Ripple strength', 'Highlight width', 'Reaction', 'Sheen'],
  mandelbrot: ['Audio response', 'Contour width', 'Reaction', 'Glow'],
  spectrum: ['Peak height', 'Line thickness', 'Reaction', 'Glow'],
  organism: ['Cell movement', 'Vein thickness', 'Reaction', 'Glow'],
  overdrive: ['Pulse strength', 'Edge thickness', 'Reaction', 'Glow'],
  dissolution: ['Audio response', 'Crack width', 'Reaction', 'Glow'],
  mandala: ['Audio response', 'Line thickness', 'Reaction', 'Glow'],
  kaleidoscope: ['Audio response', 'Thread thickness', 'Reaction', 'Glow'],
  groove: ['Stroke energy', 'Stroke width', 'Reaction', 'Glow'],
  lava: ['Blob response', 'Highlight width', 'Reaction', 'Halo'],
};
const VARIETY: Partial<Record<VisualId, readonly [string, string]>> = {
  kaleidoscope: ['Pattern variety', 'Opens forty kinds of animals, plants, celestial drawings and symbols, with smaller companion illustrations.'],
  mandala: ['Ornament detail', 'Adds diamonds, spokes and satellite rings.'],
  organism: ['Cell variety', 'Adds smaller distortions and secondary cell rings.'],
  overdrive: ['Shape variety', 'Moves from round portals to sculpted, scalloped edges.'],
  dissolution: ['Surface detail', 'Controls the fine texture inside each crystal facet.'],
  lava: ['Blending', 'Moves from separate blobs to softly merging forms.'],
};
const COG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 3-.6 2.4-2 .9-2.2-.7-2.5 4.3L4 11.5v2l-1.8 1.6 2.5 4.3 2.2-.7 2 .9.6 2.4h5l.6-2.4 2-.9 2.2.7 2.5-4.3-1.8-1.6v-2l1.8-1.6-2.5-4.3-2.2.7-2-.9L14.5 3z"/><circle cx="12" cy="12.5" r="3"/></svg>';
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const el = document.createElement(tag); el.className = className; el.textContent = text; return el;
}
function button(label: string, markup?: string) {
  const el = node('button', '', label); el.type = 'button'; el.setAttribute('aria-label', label);
  if (markup) { el.innerHTML = markup; el.title = label; } return el;
}
export interface PreviewMenu {
  sync(): void; close(): void; show(): void; openAudio(): void; openSettings(): void; isOpen(): boolean;
}

export function initializePreviewMenu(settings: Settings, renderer: Renderer, selectVisual: (id: VisualId) => void, toast: (message: string) => void): PreviewMenu {
  document.body.classList.add('menu-study');
  if (!document.getElementById('preview-menu-style')) {
    const sheet = document.createElement('link'); sheet.rel = 'stylesheet'; sheet.href = './preview-menu.css'; document.head.append(sheet);
  }
  const panel = $('panel');
  const archive = node('div'); archive.hidden = true;
  archive.append(...Array.from(panel.children)); panel.append(archive);
  const dock = node('div', 'study-dock');
  const toolbar = node('div', 'study-toolbar');
  const status = document.querySelector<HTMLElement>('.signal-line')!;
  toolbar.append(status);
  const actions = node('div', 'study-dock-actions');
  const previous = button('Scroll visuals left', '<svg viewBox="0 0 24 24"><path d="m14 6-6 6 6 6"/></svg>');
  const next = button('Scroll visuals right', '<svg viewBox="0 0 24 24"><path d="m10 6 6 6-6 6"/></svg>');
  actions.append(previous, next, $('dismiss')); toolbar.append(actions);
  const row = node('div', 'study-dock-row');
  const settingsCard = button('Settings'); settingsCard.id = 'study-settings-card';
  settingsCard.innerHTML = COG + '<span class="visual-title">Settings</span>';
  settingsCard.setAttribute('aria-expanded', 'false'); settingsCard.setAttribute('aria-controls', 'study-settings');
  const grid = $('visual-grid'); row.append(settingsCard, grid); dock.append(toolbar, row); panel.append(dock);
  function popover(id: string, title: string) {
    const box = node('section', 'study-popover'); box.id = id; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', title);
    const header = node('header', 'study-popover-heading');
    const heading = node('h2', '', title); const dismiss = button('Close ' + title.toLowerCase(), CLOSE);
    header.append(heading, dismiss); box.append(header); panel.append(box);
    dismiss.addEventListener('click', () => close(true));
    return { box, header, heading };
  }
  const effect = popover('study-effect', 'Visual settings');
  effect.heading.replaceWith($('visual-name'));
  effect.box.setAttribute('aria-labelledby', 'visual-name');
  const subtitle = node('p', 'study-subtitle', 'Saved for this visual'); effect.box.append(subtitle);
  const tuning = node('div', 'study-tuning');
  effect.box.append(tuning);
  for (const id of ['intensity', 'lineWidth', 'motion', 'glow', 'zoom']) tuning.append($(id).closest('.control')!);
  const extra = node('div', 'study-extra'); tuning.insertBefore(extra, $('glow').closest('.control'));
  effect.box.append(tuning, document.querySelector('.palette-section')!, $('reset-response'));
  $('reset-response').textContent = 'Reset visual';
  document.querySelectorAll('.palette-note').forEach(el => { (el as HTMLElement).hidden = true; });

  const general = popover('study-settings', 'Settings');
  const tabs = node('div', 'study-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Settings sections');
  const appTab = button('App'), audioTab = button('Audio');
  tabs.append(audioTab, appTab); general.box.append(tabs);
  const appPage = $('page-settings'), audioPage = $('page-audio');
  appPage.removeAttribute('aria-labelledby'); audioPage.removeAttribute('aria-labelledby');
  general.box.append(appPage, audioPage);
  const pair = [[audioTab, audioPage, 'audio'], [appTab, appPage, 'app']] as const;
  for (const [tab, page, name] of pair) {
    tab.id = `study-tab-${name}`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', page.id);
    page.setAttribute('aria-labelledby', tab.id);
    tab.addEventListener('click', () => setPage(name));
    tab.addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const target = event.key === 'Home' ? 'audio' : event.key === 'End' ? 'app' : name === 'app' ? 'audio' : 'app';
        setPage(target); (target === 'app' ? appTab : audioTab).focus();
      }
    });
  }
  function setPage(name: string) {
    pair.forEach(([tab, page, key]) => { const active = name === key; page.hidden = !active; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
  }
  setPage('audio');

  // Reuse real controls and their bindings. Less common options live in disclosures.
  function details(parent: HTMLElement, label: string) {
    const el = node('details', 'study-details'); el.append(node('summary', '', label)); parent.append(el); return el;
  }
  function move(parent: HTMLElement, id: string) { parent.append($(id).closest('.control, .field, .toggle-row') ?? $(id)); }
  const appArchive = node('div'); appArchive.hidden = true; appArchive.append(...Array.from(appPage.children)); appPage.append(appArchive);
  appPage.append($('safety-settings'));
  appPage.append(node('h3', '', 'Appearance'));
  appPage.append(appArchive.querySelector('[aria-label="Background mode"]')!);
  move(appPage, 'solid-color-control'); appPage.append($('transparency-options'));
  move(appPage, 'idle-motion'); move(appPage, 'gentle-peaks');
  const display = details(appPage, 'Display & window');
  for (const id of ['quality', 'fps', 'timeout', 'show-signal', 'layer', 'hide-taskbar']) move(display, id);
  display.append($('render-resolution'));
  const transfer = details(appPage, 'Saved settings');
  transfer.append($('export-profiles').parentElement!, $('profile-file'));
  transfer.append(node('p', 'study-footnote', 'Exports visual controls, viewing settings and palette. Spin and variety are saved separately on this device.'));
  transfer.append($('reset-settings').parentElement!);
  appPage.append(node('h3', '', 'Updates'), $('app-updates'), appArchive.querySelector('.panel-note:last-child')!);
  const audioArchive = node('div'); audioArchive.hidden = true; audioArchive.append(...Array.from(audioPage.children)); audioPage.append(audioArchive);
  audioPage.append(node('h3', '', 'Audio source'));
  const sources = audioArchive.querySelector<HTMLElement>('[aria-label="Audio source"]')!;
  // Demo and Off use the existing, bound source buttons.
  sources.append(audioArchive.querySelector('[data-mode="demo"]')!, audioArchive.querySelector('[data-mode="off"]')!);
  sources.querySelector('[data-mode="demo"]')!.textContent = 'Demo'; sources.querySelector('[data-mode="off"]')!.textContent = 'Off';
  audioPage.append(sources);
  move(audioPage, 'sensitivity');
  const devices = details(audioPage, 'Devices & capture');
  devices.append($('desktop-options'), $('microphone-options'));
  move(devices, 'noiseGate');
  devices.append($('reconnect').parentElement!);
  audioPage.append($('audio-error'));

  let open: 'effect' | 'settings' | null = null;
  let anchor: HTMLElement = settingsCard;
  let currentVisual = settings.visual;
  let tunings: Partial<Record<VisualId, PreviewTuning>> = {};
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PREVIEW_TUNING_KEY) ?? '{}');
    if (saved && typeof saved === 'object') for (const id of Object.keys(VISUALS) as VisualId[]) {
      tunings[id] = cleanPreviewTuning((saved as Record<string, unknown>)[id]);
    }
  } catch { /* Storage is optional for a preview. */ }
  function saveExtras() {
    try { localStorage.setItem(PREVIEW_TUNING_KEY, JSON.stringify(tunings)); }
    catch { toast('Settings storage unavailable. These controls will last for this session.'); }
  }
  function place() {
    const box = open === 'effect' ? effect.box : general.box;
    const bounds = (anchor.closest('.visual-item') ?? anchor).getBoundingClientRect();
    box.style.left = `${Math.max(12, Math.min(bounds.left, window.innerWidth - box.offsetWidth - 12))}px`;
  }
  function close(focus = false) {
    effect.box.hidden = true; general.box.hidden = true; open = null;
    panel.querySelectorAll('[aria-expanded="true"]').forEach(el => el.setAttribute('aria-expanded', 'false'));
    if (focus) anchor.focus();
  }
  function openBox(kind: 'effect' | 'settings', trigger: HTMLElement) {
    const same = open === kind && anchor === trigger; close(); if (same) { trigger.focus(); return; }
    open = kind; anchor = trigger; trigger.setAttribute('aria-expanded', 'true');
    (kind === 'effect' ? effect.box : general.box).hidden = false; place();
    (kind === 'effect' ? $('intensity') : appPage.hidden ? audioTab : appTab).focus({ preventScroll: true });
  }
  settingsCard.addEventListener('click', () => { setPage('audio'); openBox('settings', settingsCard); });
  grid.querySelectorAll<HTMLElement>('[data-card]').forEach(card => {
    const id = card.dataset.card as VisualId;
    card.querySelector<HTMLElement>('.favorite-visual')!.hidden = true;
    const cog = button(`Adjust ${VISUALS[id].name}`, COG); cog.className = 'study-cog'; cog.dataset.adjust = id;
    cog.setAttribute('aria-controls', effect.box.id); cog.setAttribute('aria-expanded', 'false'); card.append(cog);
    cog.addEventListener('click', () => { selectVisual(id); openBox('effect', cog); });
    card.querySelector('.visual-card')!.addEventListener('click', () => { close(); });
  });
  function scrollByPage(direction: number) { grid.scrollBy({ left: direction * Math.max(150, grid.clientWidth * 0.7), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }
  previous.addEventListener('click', () => scrollByPage(-1)); next.addEventListener('click', () => scrollByPage(1));
  function scrollState() { previous.disabled = grid.scrollLeft < 2; next.disabled = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 2; if (open) place(); }
  function revealSelected() { grid.querySelector<HTMLElement>('.study-selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  // Mouse/pen dragging scrolls the strip; taps and keyboard clicks still select.
  // Touch stays native so swipes retain browser momentum and pinch zoom.
  let drag: { pointerId: number; startX: number; scrollLeft: number; active: boolean } | null = null;
  let suppressDragClick = false;
  grid.querySelectorAll('img').forEach(image => { image.draggable = false; });
  grid.addEventListener('dragstart', event => event.preventDefault());
  grid.addEventListener('pointerdown', event => {
    suppressDragClick = false;
    if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0
      || (event.target as Element).closest('.study-cog') || grid.scrollWidth <= grid.clientWidth) return;
    drag = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: grid.scrollLeft, active: false };
  });
  window.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const distance = event.clientX - drag.startX;
    if (!drag.active && Math.abs(distance) < 6) return;
    if (!drag.active) {
      drag.active = true; suppressDragClick = true;
      grid.classList.add('study-dragging'); grid.setPointerCapture(event.pointerId);
      close();
    }
    event.preventDefault();
    grid.scrollLeft = drag.scrollLeft - distance;
  }, { passive: false });
  function endDrag(event?: PointerEvent) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    const pointerId = drag.pointerId;
    drag = null; grid.classList.remove('study-dragging');
    if (grid.hasPointerCapture(pointerId)) grid.releasePointerCapture(pointerId);
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  grid.addEventListener('lostpointercapture', endDrag);
  window.addEventListener('blur', () => endDrag());
  grid.addEventListener('click', event => {
    if (suppressDragClick && event.detail !== 0) {
      event.preventDefault(); event.stopImmediatePropagation(); suppressDragClick = false;
    }
  }, true);
  grid.addEventListener('scroll', scrollState);
  grid.addEventListener('wheel', event => {
    if (!event.ctrlKey && Math.abs(event.deltaY) > Math.abs(event.deltaX) && grid.scrollWidth > grid.clientWidth) {
      event.preventDefault();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 20 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? grid.clientWidth : 1;
      grid.scrollLeft += event.deltaY * unit;
    }
  }, { passive: false });
  window.addEventListener('resize', () => { revealSelected(); scrollState(); });
  new ResizeObserver(() => {
    panel.style.setProperty('--study-dock-height', `${window.innerHeight - dock.getBoundingClientRect().top}px`);
    scrollState();
  }).observe(dock);
  let firstLayout = true;
  new ResizeObserver(() => { if (firstLayout && grid.clientWidth > 0) { firstLayout = false; revealSelected(); } scrollState(); }).observe(grid);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopImmediatePropagation(); close(true); }
  }, true);
  panel.addEventListener('focusin', event => {
    const target = event.target as HTMLElement;
    if (open && !effect.box.contains(target) && !general.box.contains(target) && target !== anchor) close();
  });
  const extraInputs = new Map<string, HTMLInputElement>();
  function extras() {
    extra.replaceChildren(); extraInputs.clear();
    const defs: [keyof PreviewTuning, string, string][] = [];
    if (SPIN_WEIGHTS[settings.visual]) defs.push(['spin', 'Spin', 'Independent rotation. Zero stops rotation; negative values reverse it.']);
    const variety = VARIETY[settings.visual]; if (variety) defs.push(['variety', variety[0], variety[1]]);
    for (const [key, labelText, help] of defs) {
      const row = node('div', 'control slider-control'); const label = node('label', '', labelText);
      const input = node('input'); input.type = 'range'; input.id = `study-${key}`; input.min = key === 'spin' ? '-3' : '0'; input.max = key === 'spin' ? '3' : '2'; input.step = '0.05'; input.title = help;
      label.htmlFor = input.id; const output = node('output'); output.setAttribute('for', input.id);
      row.append(label, output, input); extra.append(row); extraInputs.set(key, input);
      input.addEventListener('input', () => {
        const value = cleanPreviewTuning(tunings[settings.visual]); value[key] = Number(input.value);
        tunings[settings.visual] = value; renderer.previewTuning = value; paintExtra(); saveExtras();
      });
    }
  }
  function paintExtra() {
    const tuning = cleanPreviewTuning(tunings[settings.visual]); renderer.previewTuning = tuning;
    extraInputs.forEach((input, key) => {
      input.value = String(tuning[key as keyof PreviewTuning]);
      input.style.setProperty('--fill', `${(Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
      input.previousElementSibling!.textContent = key === 'spin' && Number(input.value) === 0 ? 'Still' : `${Number(input.value).toFixed(2)}×`;
    });
  }
  $('reset-response').addEventListener('click', () => { delete tunings[settings.visual]; paintExtra(); saveExtras(); });
  $('reset-settings').addEventListener('click', () => { tunings = {}; paintExtra(); saveExtras(); });
  function sync() {
    const labels = EFFECT_LABELS[settings.visual];
    (['intensity', 'lineWidth', 'motion', 'glow'] as CoreKey[]).forEach((key, i) => {
      document.querySelector(`label[for="${key}"]`)!.textContent = labels[i]!;
    });
    $('intensity').title = `Shape energy and music response. 100% is this visual's tuned balance.`;
    $('motion').title = "Soft to snappy. Higher values react and settle faster; every setting follows the music's timing.";
    $('reset-response').title = 'Restore this visual’s controls and palette.';
    if (currentVisual !== settings.visual) { currentVisual = settings.visual; extras(); }
    paintExtra();
    grid.querySelectorAll<HTMLElement>('[data-card]').forEach(el => el.classList.toggle('study-selected', el.dataset.card === settings.visual));
    scrollState();
  }
  extras(); sync();
  return {
    sync, close, isOpen: () => open !== null,
    show: () => { close(); requestAnimationFrame(() => { revealSelected(); scrollState(); }); },
    openAudio: () => { setPage('audio'); if (open === 'settings') close(); openBox('settings', settingsCard); },
    openSettings: () => { setPage('app'); if (open === 'settings') close(); openBox('settings', settingsCard); },
  };
}
