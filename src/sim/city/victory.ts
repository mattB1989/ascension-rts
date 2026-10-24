// Ways to win the economy game (DESIGN.md §11): economic, federation, space and
// conquest. Checked once a game year (the Space Elevator is timed every second).
// The first player to meet one wins; the game can go on afterwards.

import { VICTORY } from '../../data/city.ts';
import { YEAR_SECONDS } from '../../data/goods.ts';
import type { World } from '../world.ts';
import { updateScenario } from './scenarios.ts';

export type VictoryKind = 'economic' | 'federation' | 'space' | 'conquest';

export const VICTORY_NAMES: Record<VictoryKind, string> = {
  economic: 'Economic victory',
  federation: 'Federation victory',
  space: 'Space victory',
  conquest: 'Conquest victory',
};

export interface VictoryState {
  /** Off: sandbox, no one wins. */
  on: boolean;
  /** Winner (-1: nobody yet) and how. */
  winner: number;
  how: VictoryKind | '';
  /** Years in a row each player has held the GDP share. */
  gdpYears: number[];
  /** Seconds each player's Space Elevator has run. */
  elevator: number[];
  /** Regions each player has taken by force. */
  conquered: number[];
  /** City-states each player has brought in peacefully (union or purchase). */
  joined?: number[];
  /** Scenario being played (see scenarios.ts), and its outcome. */
  scenario?: string;
  scenarioDone?: '' | 'won' | 'lost';
}

export function newVictoryState(players: number, on = true): VictoryState {
  return { on, winner: -1, how: '', gdpYears: new Array(players).fill(0), elevator: new Array(players).fill(0), conquered: new Array(players).fill(0) };
}

/** Players who can win: you and the rival nations (not city-states). */
function contenders(world: World): number[] {
  return world.players.filter((p) => p.role !== 'cityState' && !p.defeated).map((p) => p.id);
}

/** Share of world GDP (last year) for a player. */
export function gdpShare(world: World, player: number): number {
  const city = world.city!;
  let total = 0;
  for (const p of world.players) if (!p.defeated) total += Math.max(0, city.players[p.id]!.lastGdp);
  return total > 0 ? Math.max(0, city.players[player]!.lastGdp) / total : 0;
}

/** Regions a player holds, and how many of them were taken by force. */
export function regionsHeld(world: World, player: number): { held: number; total: number; conquered: number } {
  const city = world.city!;
  let held = 0;
  for (let r = 1; r < city.regionOwner.length; r++) if (city.regionOwner[r] === player) held++;
  return { held, total: world.map.regions.length, conquered: Math.min(held, city.victory.conquered[player] ?? 0) };
}

export function elevatorRunning(world: World, player: number): boolean {
  return world.buildings.some((b) => b.owner === player && b.type === 'space_elevator' && b.complete && b.city && b.city.powered && b.city.workers >= (b.def.econ!.jobs!.count / 2));
}

/** Progress towards each way to win, 0..1, with a short description (UI). */
export function victoryProgress(world: World, player: number): Array<{ kind: VictoryKind; frac: number; text: string }> {
  const v = world.city!.victory;
  const share = gdpShare(world, player);
  const reg = regionsHeld(world, player);
  const rivals = world.players.filter((p) => p.role === 'nation' || (p.role === 'human' && p.id !== player));
  const beaten = rivals.filter((p) => p.defeated).length;
  const years = v.elevator[player]! / YEAR_SECONDS;
  return [
    { kind: 'economic', frac: Math.min(1, (share >= VICTORY.gdpShare ? v.gdpYears[player]! : 0) / VICTORY.gdpYears), text: `${Math.round(share * 100)}% of world GDP (need ${Math.round(VICTORY.gdpShare * 100)}% for ${VICTORY.gdpYears} years) · ${v.gdpYears[player]} year${v.gdpYears[player] === 1 ? '' : 's'} so far` },
    { kind: 'federation', frac: Math.min(1, reg.held / Math.ceil(reg.total * VICTORY.regionShare)), text: `${reg.held} of ${reg.total} regions (need ${Math.ceil(reg.total * VICTORY.regionShare)}, at least half joined peacefully${reg.conquered ? `; ${reg.conquered} taken by force` : ''})` },
    { kind: 'space', frac: Math.min(1, years / VICTORY.elevatorYears), text: `Space Elevator running ${years.toFixed(1)} of ${VICTORY.elevatorYears} years` },
    { kind: 'conquest', frac: rivals.length ? beaten / rivals.length : 0, text: rivals.length ? `${beaten} of ${rivals.length} rival nation${rivals.length > 1 ? 's' : ''} defeated` : 'No rival nations in this game' },
  ];
}

function win(world: World, player: number, how: VictoryKind): void {
  const v = world.city!.victory;
  if (v.winner >= 0) return;
  v.winner = player;
  v.how = how;
  world.emit({ kind: 'victory', player, how });
  world.emit({ kind: 'notify', player: -1, text: `🏆 ${world.players[player]!.name} won: ${VICTORY_NAMES[how]}` });
}

/** Once a second: time the elevators; once a year: check every way to win. */
export function updateVictory(world: World, sec: number): void {
  const v = world.city!.victory;
  if (v.scenario) updateScenario(world);
  if (!v.on || v.winner >= 0) return;
  const players = contenders(world);
  for (const p of players) {
    if (elevatorRunning(world, p)) {
      v.elevator[p] = (v.elevator[p] ?? 0) + 1;
      if (v.elevator[p]! >= VICTORY.elevatorYears * YEAR_SECONDS) return win(world, p, 'space');
    }
  }
  if (sec <= 0 || sec % YEAR_SECONDS !== 0) return;
  for (const p of players) {
    v.gdpYears[p] = gdpShare(world, p) >= VICTORY.gdpShare ? (v.gdpYears[p] ?? 0) + 1 : 0;
    if (v.gdpYears[p]! >= VICTORY.gdpYears) return win(world, p, 'economic');
    const reg = regionsHeld(world, p);
    if (reg.held >= Math.ceil(reg.total * VICTORY.regionShare) && reg.held - reg.conquered >= reg.held * VICTORY.peacefulShare) return win(world, p, 'federation');
  }
  // Conquest: one contender left standing, where there were rivals.
  const rivalsEver = world.players.filter((p) => p.role !== 'cityState').length;
  if (rivalsEver > 1 && players.length === 1) win(world, players[0]!, 'conquest');
}
