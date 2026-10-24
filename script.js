'use strict';

const $ = id => document.getElementById(id);
const valid = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const num = new Intl.NumberFormat('sk-SK');
const dec = new Intl.NumberFormat('sk-SK', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (votes, total) => valid(votes) && valid(total) && total > 0 ? (100 * votes / total) : null;
const votesText = votes => valid(votes) ? num.format(votes) : '—';
const pctText = value => value === null ? '—' : `${dec.format(value)} %`;

function makeCell(row, value) {
  const td = row.insertCell();
  td.textContent = String(value);
  return td;
}
function isComplete(list) { return list.length > 0 && list.every(c => valid(c.votes)); }
function orderByVotes(list) {
  return isComplete(list) ? [...list].sort((a,b) => b.votes - a.votes || a.number - b.number) : [...list].sort((a,b) => a.number - b.number);
}
function winner(candidate, list, seats) {
  if (typeof candidate.elected === 'boolean') return candidate.elected;
  if (!isComplete(list)) return null;
  const ordered = orderByVotes(list);
  if (ordered[0].votes === 0) return null;
  // Nerozhodnuté poradie na hranici mandátov musí potvrdiť volebná komisia.
  if (ordered[seats] && ordered[seats - 1].votes === ordered[seats].votes) return null;
  return ordered.slice(0,seats).some(c => c.number === candidate.number);
}
function stateLabel(state) { return state === null ? '—' : state ? 'Zvolený' : 'Nezvolený'; }
function statusBadge(state, mobile = false) {
  const badge = document.createElement('span');
  badge.className = `status-badge ${state ? 'status-elected' : 'status-not-elected'}${mobile ? ' mobile-status' : ''}`;
  badge.textContent = stateLabel(state);
  return badge;
}
function mobileState(cell, state, badge = false) {
  if (state === null) return;
  if (badge) {
    cell.append(statusBadge(state, true));
  } else {
    const label = document.createElement('span');
    label.className = 'mobile-status';
    label.textContent = stateLabel(state);
    cell.append(label);
  }
}
function populateHomeTable(body, list, total, seats, withPhoto) {
  const rows = orderByVotes(list);
  body.replaceChildren();
  rows.forEach((c, index) => {
    const tr = body.insertRow();
    makeCell(tr, `${index + 1}.`);
    const person = tr.insertCell();
    const content = document.createElement('div');
    content.className = 'candidate';
    if (withPhoto) {
      const img = document.createElement('img');
      img.className = 'portrait';
      img.src = c.photo;
      img.alt = `Fotografia: ${c.name}`;
      img.width = 46;
      img.height = 46;
      img.loading = 'lazy';
      content.append(img);
    }
    const name = document.createElement('span');
    name.className = 'candidate-name';
    name.textContent = c.name;
    const state = winner(c, list, seats);
    mobileState(name, state, true);
    content.append(name);
    person.append(content);
    makeCell(tr, votesText(c.votes));
    if (withPhoto) makeCell(tr, pctText(pct(c.votes, total)));
    const status = tr.insertCell();
    if (state === null) {
      status.textContent = '—';
    } else {
      status.append(statusBadge(state));
    }
  });
}
function populateDocumentTable(body, list, total, seats, council = false) {
  body.replaceChildren();
  [...list].sort((a,b) => a.number - b.number).forEach(c => {
    const tr = body.insertRow();
    makeCell(tr, c.number);
    const name = makeCell(tr, c.name);
    const state = winner(c, list, seats);
    mobileState(name, state);
    makeCell(tr, votesText(c.votes));
    if (!council) makeCell(tr, pctText(pct(c.votes, total)));
    makeCell(tr, stateLabel(state));
  });
}
function renderHome(data) {
  $('turnout-value').textContent = pctText(pct(data.turnout.voted, data.turnout.eligible));
  const mayors = data.mayor;
  const mayorBallots = valid(data.turnout.mayorValidBallots) ? data.turnout.mayorValidBallots
      : isComplete(mayors) ? mayors.reduce((n,c) => n + c.votes,0) : null;
  populateHomeTable($('mayor-body'), mayors, mayorBallots, 1, true);
  const body = $('council-body');
  populateHomeTable(body, data.council, null, data.councilSeats, false);
  const button = $('show-more');
  const rows = Array.from(body.rows);
  if (rows.length > 6) {
    rows.forEach((r,i) => { r.hidden = i >= 6; });
    button.hidden = false;
    button.addEventListener('click',() => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      rows.forEach((r,i) => { r.hidden = expanded && i >= 6; });
      button.setAttribute('aria-expanded', String(!expanded));
      button.querySelector('span').textContent = expanded ? 'Zobraziť viac' : 'Zobraziť menej';
    });
  }
}
function renderResults(data) {
  const mayorTotal = valid(data.turnout.mayorValidBallots) ? data.turnout.mayorValidBallots
    : isComplete(data.mayor) ? data.mayor.reduce((n,c) => n + c.votes,0) : null;
  populateDocumentTable($('document-mayor'), data.mayor, mayorTotal, 1);
  populateDocumentTable($('document-council'), data.council, null, data.councilSeats, true);
}

const menu = $('menu-button');
const nav = $('navigation');
const closeMenu = () => {
  nav.classList.remove('open');
  menu.setAttribute('aria-expanded','false');
  menu.setAttribute('aria-label','Otvoriť navigáciu');
};
menu.addEventListener('click',() => {
  const open = menu.getAttribute('aria-expanded') === 'true';
  nav.classList.toggle('open',!open);
  menu.setAttribute('aria-expanded',String(!open));
  menu.setAttribute('aria-label',open ? 'Otvoriť navigáciu' : 'Zavrieť navigáciu');
});
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown',e => { if (e.key === 'Escape') closeMenu(); });
document.addEventListener('click',e => { if (!nav.contains(e.target) && !menu.contains(e.target)) closeMenu(); });
window.addEventListener('resize',() => { if (window.innerWidth > 760) closeMenu(); });

// Zdrojom dát je súbor data.js. Web funguje aj bez servera.
try {
  if (!window.VOLBY_DATA) throw new Error('Chýba súbor data.js');
  if (document.body.dataset.page === 'home') renderHome(window.VOLBY_DATA);
  else renderResults(window.VOLBY_DATA);
} catch (error) {
  console.error('Nepodarilo sa zobraziť výsledky:', error);
  document.querySelectorAll('tbody').forEach(tbody => {
    tbody.replaceChildren();
    const tr = tbody.insertRow();
    const td = tr.insertCell();
    td.colSpan = tbody.closest('table').querySelectorAll('thead th').length;
    td.textContent = 'Údaje sa nepodarilo načítať.';
  });
}

// Toto počítadlo je iba lokálne. Zobrazuje otvorenia v danom prehliadači,
// nie celkový počet návštevníkov webu (ten vyžaduje serverovú službu).
try {
  const key = 'obec-kos-local-views';
  const old = Number(localStorage.getItem(key));
  const views = Number.isSafeInteger(old) && old >= 0 ? old + 1 : 1;
  localStorage.setItem(key, String(views));
  $('view-counter').textContent = num.format(views);
} catch (error) {
  $('view-counter').textContent = '';
}
