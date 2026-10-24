// Entry point: pick the game from the URL (or show the start menu), build the
// world, the renderer and the UI, then run the loop.
//
//   ?mode=city&size=512&biome=temperate&seed=7   economy game on a generated map
//   ?load=auto | ?load=manual                     continue a saved game
//   ?mode=skirmish | ?mode=sandbox                 Twin Shores RTS (M1-M3)

import { Game } from './game.ts';
import { GameRenderer } from './render/renderer.ts';
import { gameYear } from './sim/city/economy.ts';
import { createCity } from './sim/city/index.ts';
import { newBot } from './ai/cityBot.ts';
import { MAP_SIZES, type GenBiome } from './sim/mapgen.ts';
import { createMatch } from './sim/scenario.ts';
import type { World } from './sim/world.ts';
import { CityHud } from './ui/cityHud.ts';
import { Sound } from './ui/sound.ts';
import { Hud } from './ui/hud.ts';
import { InputController } from './ui/input.ts';
import { showMenu } from './ui/menu.ts';
import { Minimap } from './ui/minimap.ts';
import { loadFromBrowser, saveInfo, saveToBrowser } from './ui/saves.ts';
import { Selection } from './ui/selection.ts';

const BIOME_IDS: GenBiome[] = ['temperate', 'arid', 'alpine', 'archipelago', 'lakeland'];

function loading(root: HTMLElement, text: string): HTMLElement {
  const d = document.createElement('div');
  d.className = 'loading';
  d.textContent = text;
  root.appendChild(d);
  return d;
}

async function boot(): Promise<void> {
  const uiRoot = document.getElementById('ui') as HTMLElement;
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode');
  const load = params.get('load');
  let world: World | null = null;
  if (load) {
    const l = loading(uiRoot, 'Loading…');
    try {
      world = await loadFromBrowser(load);
    } catch (err) {
      console.error(err);
    }
    l.remove();
    if (!world) {
      showMenu(uiRoot);
      return;
    }
  } else if (mode === 'city') {
    const l = loading(uiRoot, 'Shaping the land…');
    await new Promise((r) => setTimeout(r, 30)); // let the message paint
    const size = Number(params.get('size')) === MAP_SIZES.small ? MAP_SIZES.small : MAP_SIZES.standard;
    const b = params.get('biome') as GenBiome;
    const biome = BIOME_IDS.includes(b) ? b : 'temperate';
    const d = params.get('difficulty');
    const difficulty = d === 'easy' || d === 'hard' ? d : 'normal';
    const rivals = params.has('rivals') ? Math.max(0, Math.min(3, Number(params.get('rivals')))) : undefined;
    world = createCity({ seed: Number(params.get('seed')) || 1, size, biome, difficulty, nations: rivals, victory: params.get('victory') !== '0' });
    // Spectator: an AI nation plays your seat too.
    if (params.get('spectate') === '1') {
      world.city!.bots.push(newBot(0, Infinity, true, difficulty));
      world.players[0]!.name = 'Blue League';
    }
    l.remove();
  } else if (mode === 'skirmish' || mode === 'sandbox') {
    world = createMatch({ seed: Number(params.get('seed')) || 1337, mode: mode === 'sandbox' ? 'sandbox' : 'standard' });
  } else {
    showMenu(uiRoot);
    return;
  }
  start(world, uiRoot, params);
}

function start(world: World, uiRoot: HTMLElement, params: URLSearchParams): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const game = new Game(world, 0);
  const renderer = new GameRenderer(canvas, world, game.humanPlayer, params.get('fog') !== '0');
  const selection = new Selection(world);
  const input = new InputController(canvas, renderer, game, selection, uiRoot);
  const minimap = new Minimap(world, renderer, input, selection);
  let handleEvents: (events: ReturnType<Game['drainEvents']>) => void;
  let updateHud: (dt: number, realDt: number) => void;
  let lastYear = -1;
  const sound = new Sound();
  // The player's own orders make a sound; so do button clicks.
  const issue = game.issue.bind(game);
  game.issue = (c) => {
    sound.command(c);
    issue(c);
  };
  uiRoot.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) sound.click();
  });
  (window as unknown as { ascensionSound: Sound }).ascensionSound = sound;

  if (world.city) {
    const hud = new CityHud(uiRoot, game, selection, input, minimap);
    const save = (slot: string) =>
      saveToBrowser(world, slot, `${world.map.name.split(' ')[0]}, ${gameYear(world)}`)
        .then(() => slot === 'manual' && hud.toast('Game saved'))
        .catch((e) => hud.toast(`Could not save: ${String(e)}`));
    hud.onSave = () => void save('manual');
    hud.onLoad = () => (location.search = 'load=manual');
    hud.onNew = () => (location.search = '');
    hud.hasSave = () => !!saveInfo('manual');
    hud.onMarks = (m) => renderer.marks.set(m);
    hud.sound = sound;
    hud.onAlert = (x, y) => minimap.ping(x, y);
    handleEvents = (ev) => hud.handleEvents(ev);
    updateHud = () => {
      hud.update();
      // Autosave every game year.
      const y = gameYear(world);
      if (lastYear >= 0 && y !== lastYear) void save('auto');
      lastYear = y;
    };
  } else {
    const hud = new Hud(uiRoot, game, selection, input, minimap);
    hud.onAlert = (x, y) => minimap.ping(x, y);
    handleEvents = (ev) => {
      hud.handleEvents(ev);
    };
    updateHud = (dt, realDt) => hud.update(dt, realDt);
  }
  input.goHome();
  window.addEventListener('resize', () => renderer.resize());

  // Expose for debugging and automated play-testing.
  (window as unknown as { ascension: unknown }).ascension = { world, game, renderer, selection, input };

  let last = performance.now();
  const frame = (now: number) => {
    const realDt = (now - last) / 1000;
    const dt = Math.min(0.1, realDt);
    last = now;
    input.update(dt);
    const alpha = game.update(dt);
    input.alpha = alpha;
    const events = game.drainEvents();
    if (events.length) {
      handleEvents(events);
      renderer.effects.handleEvents(events, world);
      sound.handleEvents(events, game.humanPlayer);
    }
    sound.listener = { x: renderer.rig.target.x, y: renderer.rig.target.y, zoom: renderer.rig.distance };
    sound.update();
    selection.prune();
    const ins = selection.inspect;
    renderer.render(alpha, now / 1000, dt, selection.ids, {
      entity: ins?.kind === 'entity' ? ins.id : 0,
      resource: ins?.kind === 'resource' ? ins.index : -1,
    });
    minimap.draw(now);
    updateHud(dt, realDt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void boot();
