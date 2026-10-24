// The writing and speaking subjects of a mock (docs/MOCK-EXAM.md §6.2): from the months the person has not had in a
// mock, newest first; when every month was had, any live row. EO: Tâche 2 and 3 from one Partie, as the real test.
import { all, one } from "../sim/db.ts";
import type { Topics } from "./types.ts";

const ALIVE = "hidden = 0 AND gone_at IS NULL";
/** `AND x NOT IN (?, ?)`, or nothing when there is nothing to avoid (`NOT IN ()` is not SQL, `NOT IN (NULL)` matches nothing) */
const notIn = (col: string, ids: number[]) => (ids.length ? `AND ${col} NOT IN (${ids.map(() => "?").join(",")})` : "");

/** the combinaison (EE) and the partie with its two topics (EO), avoiding what previous mocks used */
export async function pickMockTopics(avoid: { ee: number[]; eoParts: number[] }): Promise<Topics> {
  const ee = (await one<{ id: number }>(`SELECT id FROM topics WHERE section = 'ee' AND tache IS NULL AND ${ALIVE} ${notIn("id", avoid.ee)} ORDER BY month DESC, RANDOM() LIMIT 1`, ...avoid.ee))
    ?? (await one<{ id: number }>(`SELECT id FROM topics WHERE section = 'ee' AND tache IS NULL AND ${ALIVE} ORDER BY RANDOM() LIMIT 1`));
  // a partie that holds both a Tâche 2 and a Tâche 3 row
  const parts = `SELECT part_id, month FROM topics WHERE section = 'eo' AND ${ALIVE} AND tache IN (2, 3) GROUP BY part_id HAVING COUNT(DISTINCT tache) = 2`;
  const part = (await one<{ part_id: number }>(`SELECT part_id FROM (${parts}) WHERE 1 = 1 ${notIn("part_id", avoid.eoParts)} ORDER BY month DESC, RANDOM() LIMIT 1`, ...avoid.eoParts))
    ?? (await one<{ part_id: number }>(`SELECT part_id FROM (${parts}) ORDER BY RANDOM() LIMIT 1`));
  let t2: number | null = null, t3: number | null = null;
  if (part) {
    const rows = await all<{ id: number; tache: number }>(`SELECT id, tache FROM topics WHERE section = 'eo' AND part_id = ? AND ${ALIVE} AND tache IN (2, 3) ORDER BY RANDOM()`, part.part_id);
    t2 = rows.find((r) => r.tache === 2)?.id ?? null;
    t3 = rows.find((r) => r.tache === 3)?.id ?? null;
  }
  return { ee: ee?.id ?? null, eo: { partId: part?.part_id ?? null, t2, t3 } };
}
