// Käynnistys: skenaarion valinta, sitten peli. Valinta tallentuu osoitteeseen (#bobr / #bagr).
import { Game } from './ui';
import { SCENARIOS, setScenario } from './data';

function start(i: number) {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  setScenario(i);
  try {
    (window as any).__game = new Game(canvas);
  } catch (err) {
    const el = document.getElementById('fatal');
    if (el) { el.hidden = false; el.textContent = 'Pelin käynnistys epäonnistui: ' + (err as Error).message + '. Peli tarvitsee WebGL-tuen.'; }
    console.error(err);
  }
}

function boot() {
  const fromHash = SCENARIOS.findIndex((s) => '#' + s.id === location.hash);
  if (fromHash >= 0) { start(fromHash); return; }
  const list = document.getElementById('pick-list')!;
  SCENARIOS.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'scn';
    b.type = 'button';
    b.id = 'pick-' + s.id;
    b.innerHTML = `<div><div class="meta">${s.date} · ${s.place}</div><h2>${s.title}</h2></div><span class="side">Pelaat: ${s.sideNames[0]}</span><p>${s.pick}</p>`;
    b.addEventListener('click', () => {
      try { history.replaceState(null, '', '#' + s.id); } catch { location.hash = s.id; }
      document.getElementById('pick')!.hidden = true;
      document.body.classList.remove('picking');
      start(i);
    });
    list.appendChild(b);
  });
  document.body.classList.add('picking');
  document.getElementById('pick')!.hidden = false;
}
boot();
