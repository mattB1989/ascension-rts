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

  const seed = Number(new URLSearchParams(location.search).get('seed')) || 1337;
  const world = createMatch({ seed });
  const game = new Game(world, 0);
  const renderer = new GameRenderer(canvas, world);
  const selection = new Selection(world);
  const input = new InputController(canvas, renderer, game, selection, uiRoot);
  const minimap = new Minimap(world, renderer, input, selection);
  const hud = new Hud(uiRoot, world, selection, input, minimap);

  input.goHome();
  window.addEventListener('resize', () => renderer.resize());

  // Expose for debugging and automated play-testing.
  (window as unknown as { ascension: unknown }).ascension = { world, game, renderer, selection, input };

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    input.update(dt);
    const alpha = game.update(dt);
    input.alpha = alpha;
    selection.prune();
    renderer.render(alpha, now / 1000, dt, selection.ids);
    minimap.draw(now);
    hud.update(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

start();
