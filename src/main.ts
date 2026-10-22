// Entry point: build the match, the renderer and the UI, then run the loop.

import { Game } from './game.ts';
import { GameRenderer } from './render/renderer.ts';
import { createMatch } from './sim/scenario.ts';
import { Hud } from './ui/hud.ts';
import { InputController } from './ui/input.ts';
import { Minimap } from './ui/minimap.ts';
import { Selection } from './ui/selection.ts';

function start(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;

  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed')) || 1337;
  const mode = params.get('mode') === 'sandbox' ? 'sandbox' : 'standard';
  const world = createMatch({ seed, mode });
  const game = new Game(world, 0);
  const renderer = new GameRenderer(canvas, world, game.humanPlayer, params.get('fog') !== '0');
  const selection = new Selection(world);
  const input = new InputController(canvas, renderer, game, selection, uiRoot);
  const minimap = new Minimap(world, renderer, input, selection);
  const hud = new Hud(uiRoot, game, selection, input, minimap);

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
    selection.prune();
    const ins = selection.inspect;
    renderer.render(alpha, now / 1000, dt, selection.ids, {
      entity: ins?.kind === 'entity' ? ins.id : 0,
      resource: ins?.kind === 'resource' ? ins.index : -1,
    });
    minimap.draw(now);
    hud.update(dt, realDt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

start();
