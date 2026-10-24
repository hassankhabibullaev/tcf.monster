// Practice helpers of the section page: the bank index and a level's size (docs/COCE.md §2).
import { useEffect, useState } from "react";
import { loadIndex, type BankIndex, type Level } from "./deps.ts";
import type { CoceSection } from "./shared.ts";

/** the bank index: `undefined` while loading, `null` when it could not be read */
export function useIndex() {
  const [index, setIndex] = useState<BankIndex | null | undefined>(undefined);
  useEffect(() => { let live = true; loadIndex().then((i) => live && setIndex(i)).catch(() => live && setIndex(null)); return () => { live = false; }; }, []);
  return index;
}

export const levelSize = (index: BankIndex | null | undefined, section: CoceSection, level: Level) => index?.levels?.[section]?.[level] ?? 0;
