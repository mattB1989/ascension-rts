// Goods that move between buildings in the economy game. See docs/DESIGN.md §5.

export type GoodId =
  | 'crops' | 'food' | 'timber' | 'lumber' | 'stone' | 'concrete' | 'ore' | 'steel' | 'oil' | 'fuel' | 'plastics' | 'goods'
  // Digital age
  | 'rare' | 'uranium' | 'electronics' | 'pharma';

export interface GoodDef {
  id: GoodId;
  name: string;
  icon: string;
  /** CSS colour for UI chips and truck loads. */
  color: string;
  /** Reference price in credits per unit (overseas market, later trade). */
  price: number;
  description: string;
}

export const GOODS: Record<GoodId, GoodDef> = {
  crops: { id: 'crops', name: 'Crops', icon: '🌾', color: '#d8b84a', price: 4, description: 'Grown on farms. Fertile river banks yield the most.' },
  food: { id: 'food', name: 'Food', icon: '🍞', color: '#e08a3c', price: 9, description: 'Feeds households through markets.' },
  timber: { id: 'timber', name: 'Timber', icon: '🪵', color: '#8a5a32', price: 3, description: 'Felled in forests by logging camps.' },
  lumber: { id: 'lumber', name: 'Lumber', icon: '🪚', color: '#c08a52', price: 8, description: 'Sawn timber: the basic building material.' },
  stone: { id: 'stone', name: 'Stone', icon: '🪨', color: '#a8a49c', price: 3, description: 'Quarried from stone deposits.' },
  concrete: { id: 'concrete', name: 'Concrete', icon: '🧱', color: '#c9c6bd', price: 10, description: 'Cement works turn stone into concrete for construction.' },
  ore: { id: 'ore', name: 'Iron ore', icon: '⛏', color: '#a0553a', price: 5, description: 'Mined from ore deposits.' },
  steel: { id: 'steel', name: 'Steel', icon: '🔩', color: '#8fa3b5', price: 22, description: 'Smelted from ore. Construction, factories and the military.' },
  oil: { id: 'oil', name: 'Crude oil', icon: '🛢', color: '#3a3430', price: 6, description: 'Pumped from oil deposits. Burned in power plants, refined into fuel and plastics.' },
  fuel: { id: 'fuel', name: 'Fuel', icon: '⛽', color: '#e0c040', price: 14, description: 'Refined from crude oil. Vehicles and aircraft burn it.' },
  plastics: { id: 'plastics', name: 'Plastics', icon: '🧴', color: '#6fc3d8', price: 12, description: 'A by-product of refining. Goes into consumer goods.' },
  goods: { id: 'goods', name: 'Consumer goods', icon: '📦', color: '#d070b0', price: 30, description: 'What technicians want to buy at the market.' },
  rare: { id: 'rare', name: 'Rare earths', icon: '🧲', color: '#7fd0a0', price: 14, description: 'Digital age. Mined from rare-earth deposits; electronics are made from them.' },
  uranium: { id: 'uranium', name: 'Uranium', icon: '☢', color: '#b8e04a', price: 24, description: 'Digital age. Mined from uranium deposits; fuels nuclear power plants.' },
  electronics: { id: 'electronics', name: 'Electronics', icon: '💾', color: '#58a8ff', price: 55, description: 'Digital age. Rare earths and plastics. Engineers buy them; Digital units are built with them.' },
  pharma: { id: 'pharma', name: 'Pharmaceuticals', icon: '💊', color: '#f08080', price: 45, description: 'Digital age. Crops and plastics. Hospitals use them.' },
};

export const GOOD_IDS = Object.keys(GOODS) as GoodId[];

/** Citizen tiers (DESIGN.md §4): Workers and Technicians from the start, Engineers in the Digital age, Scientists in the Nano age. */
export const TIERS = [
  { id: 0, name: 'Workers', short: 'W', color: '#c9a36a' },
  { id: 1, name: 'Technicians', short: 'T', color: '#6fb4e8' },
  { id: 2, name: 'Engineers', short: 'E', color: '#9a7cf0' },
  { id: 3, name: 'Scientists', short: 'S', color: '#f0d060' },
] as const;
export type Tier = 0 | 1 | 2 | 3;
/** Per-tier counts (population, jobs). */
export type PerTier = [number, number, number, number];
export const perTier = (): PerTier => [0, 0, 0, 0];
export const sumTiers = (a: readonly number[]): number => a.reduce((s, n) => s + n, 0);

/** Load carried by one truck. */
export const TRUCK_LOAD = 10;
/** Game seconds in a year (calendar). 1950 starts at tick 0. */
export const YEAR_SECONDS = 120;
export const START_YEAR = 1950;
