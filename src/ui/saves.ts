// Saves in the browser (IndexedDB). Slots: 'auto' (every game year) and 'manual'.

import { revive, snapshot, type SaveFile } from '../sim/save.ts';
import type { World } from '../sim/world.ts';

const DB = 'ascension';
const STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveToBrowser(world: World, slot: string, name: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(snapshot(world, name), slot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  try {
    localStorage.setItem(`ascension.save.${slot}`, JSON.stringify({ savedAt: Date.now(), name }));
  } catch {
    // Index of saves is a convenience only.
  }
}

export async function loadFromBrowser(slot: string): Promise<World | null> {
  const db = await open();
  const file = await new Promise<SaveFile | undefined>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(slot);
    req.onsuccess = () => resolve(req.result as SaveFile | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return file ? revive(file) : null;
}

/** Quick check (no database access) whether a slot has a save, with its label. */
export function saveInfo(slot: string): { savedAt: number; name: string } | null {
  try {
    const s = localStorage.getItem(`ascension.save.${slot}`);
    return s ? (JSON.parse(s) as { savedAt: number; name: string }) : null;
  } catch {
    return null;
  }
}
