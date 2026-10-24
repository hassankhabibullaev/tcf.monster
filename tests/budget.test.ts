// The write counter is kept in memory and written once 25 writes have gathered or a minute has passed: counting must
// not cost as many writes as it counts.
import { describe, it, expect, beforeEach } from "vitest";
import { makeEnv } from "../scripts/local-env.ts";
import { addWrites, flushWrites, resetWrites, type Env } from "../worker/util.ts";

describe("the write counter", () => {
  beforeEach(() => resetWrites());
  it("one budget write per 25 counted, or per minute", async () => {
    const e = makeEnv();
    const env = e.env as unknown as Env;
    delete (env as { WRITES_FLUSH_EVERY?: string }).WRITES_FLUSH_EVERY;
    let writes = 0;
    const prep = env.DB.prepare.bind(env.DB);
    (env.DB as unknown as { prepare: (s: string) => unknown }).prepare = (sql: string) => { if (/INTO budget/.test(sql)) writes++; return prep(sql); };
    const t0 = 1_000_000_000_000;
    await addWrites(env, 1, t0); // the first one flushes (nothing written for a minute)
    for (let i = 0; i < 24; i++) await addWrites(env, 1, t0 + 1000);
    expect(writes).toBe(1);
    await addWrites(env, 1, t0 + 2000); // the 25th since the last flush
    expect(writes).toBe(2);
    await addWrites(env, 3, t0 + 70_000); // a minute later
    expect(writes).toBe(3);
    await addWrites(env, 2, t0 + 71_000);
    await flushWrites(env, t0 + 72_000);
    expect(writes).toBe(4);
    expect((e.raw.prepare("SELECT SUM(writes) n FROM budget").get() as { n: number }).n).toBe(31);
  });
});
