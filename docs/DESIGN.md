# Game design: economy first

Ascension is a **city and nation builder with real-time war**, in the spirit of Pharaoh,
Caesar III, Anno and SimCity, with combat that grew out of an Empire Earth style RTS.
You grow a city into a nation from the Modern age to the Space age. Economics is the core
game: production chains, infrastructure, trade and population. War is one way among several
to get what you need, and it is paid for by the economy.

This document is the **target design**. Numbers are starting values for the balance
harness. As each part is built, its data moves into `src/data/` and the generated catalog
in [TECH_TREE.md](TECH_TREE.md) grows with it.

---

## 1. Pillars

1. **Everything is connected.** A tank needs steel and fuel. Steel needs ore, power and
   workers. Workers need housing, food and goods. Building an army takes from the
   consumer economy, and citizens notice.
2. **Infrastructure is the board.** Roads, rail, ports, pipelines and the power grid decide
   what can reach where. They have capacity, they wear out, and they are what war targets.
3. **Trade is a relationship.** Every route is physical (convoys you can see, escort and
   lose) and changes how the partner feels about you.
4. **Several ways to grow.** Claim empty land, trade a neighbour into joining you, sign a
   treaty, or take it by force. Each has a different cost.
5. **Readable at a glance.** Overlays, graphs and the empire overview answer "what is
   short, what is broken, what is next" in one tap. Same rule as before: mobile and
   desktop are both first class.

---

## 2. The world

- **Generated maps**, seeded and reproducible. Sizes: Small 256², Standard 512²,
  Large 768² tiles (Twin Shores was 160²). Biomes: temperate, arid with a great river
  (Pharaoh's Nile: fertile floodplain, floods), archipelago, alpine.
- **Rivers** are new and important: navigable by barges, a water source, fertile banks,
  and natural borders. Bridges over them are strategic.
- **Regions:** the map is cut into 20–40 provinces along rivers, ridges and coasts. Each
  region has a name, borders, a centre site and its own mix of resources. Regions are the
  unit of ownership, annexation and conquest.
- **Who lives there:** you, 1–3 rival **nations** (full AI), 3–8 neutral **city-states**
  (simpler AI: they grow, produce, trade and have opinions, but don't expand), and unclaimed
  regions. An **overseas market** at the map edge buys and sells at fixed, low-margin prices
  so trade works from minute one.
- **Time:** real time with pause and 1× / 2× / 4× / 8×. The calendar starts in 1950; at 1×
  a year is about 2 minutes. A full game runs for hours, so save/load and autosave are
  required.

---

## 3. Money, materials and labour

Three things limit you, and they're different on purpose:

| | What | Comes from | Spent on |
|---|---|---|---|
| **₡ Credits** | Money | Taxes on households and businesses, trade profit, tariffs | Construction labour, upkeep of buildings and networks, wages for the military, buying goods |
| **Materials** | Physical goods in warehouses | Production chains | Construction (lumber, concrete, steel), units (steel, fuel, electronics), citizens' needs |
| **Labour** | People of each tier | Housing that is supplied | Every working building needs workers of a given tier; no workers, no output |

A building costs credits plus materials delivered to the site by trucks. Engineers are no
longer the economy: construction crews come from a Construction Office, and Engineers
remain as military/field units (repair, fortify, build forward bases).

---

## 4. Population

Households live in housing blocks. Citizens are **aggregate numbers**, not simulated
individuals: a block knows how many people of which tier live there and how well their
needs are met. What you see on the streets (cars, pedestrians) is sampled from the real
flows, for life and readability.

| Tier | Unlocked | Needs to stay | Needs to upgrade to next tier | Works in |
|---|---|---|---|---|
| **Workers** | Modern | Housing, Food, Water | Goods, Power, Police | Farms, mines, quarries, sawmills, docks |
| **Technicians** | Modern | + Goods, Power, Health | Schools, Transit, Leisure | Mills, refineries, factories, power plants |
| **Engineers** | Digital | + Electronics, Data network, Schools | University, Pharmaceuticals | Electronics plants, labs, airports |
| **Scientists** | Nano | + Pharmaceuticals, University, Leisure | Orbital goods | Nano fabs, research institutes, spaceport |

- Blocks with all "upgrade" needs met level up (bigger model, more residents, more tax).
  Blocks missing a "stay" need lose residents and eventually downgrade.
- **Happiness** per block: needs met, jobs nearby, pollution, crime, taxes, war weariness.
  Low happiness means lower productivity, then strikes, then emigration or, in annexed
  regions, separatism.
- **Services** (police, fire, health, schools, leisure) cover a radius measured along the
  road network from the building, with a capacity limit. No random walkers.

---

## 5. Production chains

Raw resources sit on the map per region. Goods move as **loads** in real vehicles between
buildings with input and output stocks.

### Modern

| Product | Building | Inputs | Workforce |
|---|---|---|---|
| Crops | Farm (fertile land; river banks are best) | — | Workers |
| Fish | Fishing Harbour (coast or river) | — | Workers |
| **Food** | Food Plant | Crops or Fish, Power | Workers |
| Timber | Logging Camp (forest; forests regrow slowly) | — | Workers |
| **Lumber** | Sawmill | Timber | Workers |
| Stone | Quarry | — | Workers |
| **Concrete** | Cement Works | Stone, Power | Workers |
| Ore | Mine | — | Workers |
| **Steel** | Steel Mill | Ore, Power | Technicians |
| Oil | Oil Well / Offshore Rig | — | Workers |
| **Fuel**, **Plastics** | Oil Refinery | Oil | Technicians |
| **Goods** | Consumer Factory | Steel, Plastics, Power | Technicians |
| **Vehicles** | Vehicle Plant | Steel, Plastics, Fuel | Technicians |
| **Power** | Oil Power Plant (Fuel) | — | Technicians |
| **Water** | Pumping Station (river/lake) + Water Tower | Power | Workers |

### Later ages

| Age | New raw | New products | New power |
|---|---|---|---|
| **Digital** | Rare earths, Uranium | Electronics (rare earths, plastics, power), Pharmaceuticals (plastics, crops), Aircraft (steel, electronics, fuel) | Nuclear plant (uranium) |
| **Nano** | — | Nanomaterials (rare earths, electronics, lots of power), Robotics (steel, electronics, nanomaterials) | Fusion plant |
| **Space** | Helium-3, asteroid ore (from orbit) | Orbital alloys, Spacecraft | Orbital solar relay |

Robotics reduce the workforce needed in industry (automation), which matters when your
population tops out.

---

## 6. Infrastructure

| Network | Carries | Ages | Notes |
|---|---|---|---|
| **Roads**: dirt → paved → highway | Trucks, buses, military vehicles | Modern+ | Drawn by dragging (the wall-line tool). Capacity per tier; congestion slows everything on it |
| **Rail** + stations | Freight and passenger trains | Modern+ | High capacity, long distance. Stations need road links |
| **Ports, river docks** | Ships, barges | Modern+ | Rivers carry barges; blockades close ports |
| **Pipelines** | Oil, fuel | Modern+ | Cheap and fast for liquids; easy to sabotage |
| **Power grid**: lines, substations | Power | Modern+ | Plants feed the grid; blackouts propagate when a line is cut |
| **Airports** | Passengers, light freight, mail | Digital+ | Also military airfields |
| **Data network** | Connectivity (an Engineer need) | Digital+ | Coverage from exchanges along roads |
| **Maglev** | Fast freight and passengers | Nano+ | Replaces rail on key corridors |
| **Launch site, Space Elevator** | Orbital goods | Space | Space Elevator is also the wonder |

- **Condition:** every segment has condition 0–100%. It wears with traffic and age and
  under combat. Below 50% it gets slower; at 0% it closes. A **Maintenance Depot** repairs
  segments in its area automatically if your budget allows it. Upkeep in credits per segment.
- **Logistics:** buildings post supply and demand. Every second (sim time) a matcher assigns
  loads from the nearest supplier by travel time over the networks, through **Warehouses**
  that buffer and redistribute. A truck carries 10 units, a train 200, a ship 400.
  Shortages show up as red icons above the building that waits.

---

## 7. Trade

- Every settlement has a **market** with a stock and a price per good, driven by its own
  supply and demand. Prices are visible for settlements you've met (embassy or explored).
- A **trade route** links one of your depots (truck terminal, rail station or port) to a
  partner's market and lists goods to export and import with quantities. Convoys run it
  by themselves; profit is the price difference minus transport and tariffs.
- The **overseas market** is always open by sea: fixed prices, small margins. It lets the
  solo sandbox have trade, and gives a fallback when neighbours refuse to deal.
- **Danger:** pirates and raiders (neutral) hit convoys from early on; rivals can raid,
  blockade or embargo. Escorts, patrol boats and coastal forts protect routes. This is
  where the existing combat comes in first.
- **Relations:** trade volume raises the partner's opinion of you and their **dependence**
  (share of their trade done with you).

---

## 8. Regions, diplomacy and annexation

**Ownership.** A region is yours once you hold its centre site. Unclaimed regions are
claimed by building a **Regional Office** connected to your network. Regions cut off from
your capital lose efficiency (no deliveries, no services), so infrastructure decides how
big you can get.

**Relations** with each nation and city-state run from −100 to +100, moved by trade,
treaties, shared enemies, border tension, broken promises and war.

**Treaties:** trade agreement (lower tariffs), open borders, research pact (both sides gain
research speed), defensive alliance, non-aggression pact, peace treaty (with regions,
reparations or tribute as terms). Opposite tools: embargo, sanctions, declaring war.

**Five ways a region changes hands:**

| Path | How | Cost / risk |
|---|---|---|
| **Settle** | Regional Office on unclaimed land | Credits and materials; must be reachable |
| **Economic union** | A city-state with high dependence on you and high opinion offers to join | Slow; rivals can outbid you on trade |
| **Purchase / treaty** | Buy a region or take it as peace terms | Expensive; neighbours dislike it |
| **Conquest** | Hold the centre site with ground units for 60 s | War weariness at home; occupation unrest; others' opinion drops |
| **Secession** | An unhappy region (yours or theirs) revolts and becomes a city-state | An opportunity or a loss |

Annexed regions keep their population, buildings and culture; conquered ones arrive
damaged and resentful. Integrating takes time (unrest decays with services and connection).

---

## 9. War, as part of the economy

All of M3's combat stays (weapons, counters, walls, garrisons, turrets). What changes:

- **Units cost goods:** infantry = recruits (from the Worker or Technician pool) + Goods;
  vehicles = Vehicles + Fuel; aircraft = Aircraft + Fuel. Every unit has upkeep in credits,
  and fuel while moving.
- **Supply:** units draw from **Supply Depots** fed by the logistics network. Out of supply,
  units stop regaining strength and run out of ammo and fuel. Cutting rail and bridges
  starves a front.
- **Economic targets:** power plants, refineries, depots, bridges, ports. Damage needs
  repair crews and materials. Bombing a city costs the attacker opinion with everyone.
- **War weariness** grows with casualties and duration, faster in a war you declared
  without a reason (casus belli comes from border incidents, embargoes, broken treaties).
- **Defense stays a real strategy:** walls, forts and garrisoned towers protect borders
  and chokepoints (bridges, passes, ports).

---

## 10. Progress through the ages

An age is reached by milestones, not just by paying:

| To reach | Population | Economy | Research | Also |
|---|---|---|---|---|
| **Digital** | 2,000 Technicians | GDP ₡5k/yr | Electronics (from a Research Institute) | ₡ cost |
| **Nano** | 1,500 Engineers | GDP ₡25k/yr | Nanotechnology | ₡ cost |
| **Space** | 800 Scientists | GDP ₡100k/yr | Orbital Mechanics | ₡ cost |

- **Research points** come from schools, universities and labs (staffed by higher tiers).
- **Collaboration path:** research pacts, tech trade, joint projects (e.g. a shared
  launch site) speed both sides up.
- **War path:** capturing a research institute grants a share of the techs the owner has.
- The old military research (armor, ballistics, fortification) stays in the tree.

---

## 11. Ways to win

- **Economic:** hold 40% of world GDP for 10 years.
- **Federation:** your nation includes half the regions on the map, at least half of
  them joined peacefully.
- **Space:** build the Space Elevator and keep it running for 5 years.
- **Conquest:** take every rival's capital.
- **Sandbox:** no victory, endless play. Also scenarios later (e.g. "rebuild after the
  flood", "the river trade war").

---

## 12. Interface for an economy game

- **Overlays:** traffic and congestion, network condition, power, water, service coverage,
  happiness, land value, pollution, region borders and opinion, supply lines.
- **Building info:** inputs, outputs, stock, workforce filled, why it's stopped (one line).
- **Economy panel:** budget (income and upkeep by category), taxes, prices, a goods table
  (production vs consumption per good, with trend arrows).
- **Trade screen:** routes, partners, prices; **Diplomacy screen:** relations, treaties,
  offers. **Region screen:** owner, resources, happiness, dependence.
- **Graphs:** population per tier, GDP, trade volume, compared with rivals when known.
- **Mobile:** build tools in a bottom palette, drag to draw roads/rail/walls, overlays
  from a single button, info panels as bottom sheets. Pause is one tap.

---

## 13. Decisions taken (change any of them)

1. **Aggregate citizens, real freight.** People are numbers; goods travel in real vehicles
   that can be seen, delayed, raided and escorted.
2. **One continuous map with regions**, no separate strategy map.
3. **Rivals:** nations (full AI, three difficulty levels) and simpler city-states.
4. **Eras:** keep Modern → Digital → Nano → Space, starting in 1950. An earlier
   Industrial start could be added later.
5. **Coverage by road distance**, not Pharaoh's random walkers.
6. **Twin Shores skirmish stays playable** as a mode while the new game grows, so the live
   build never goes backwards.
