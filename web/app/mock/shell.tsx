// What a runner takes to render its body as a stage of the mock exam (docs/MOCK-EXAM.md §2.3): the stage's name and
// place (« 2 / 4 ») for the room's own top line, the stage's end on the server's clock (null while the room is not
// rendered yet: the clock stands idle and nothing plays), the store, the end of the stage. The footer and the top line
// are the room's own: every room already draws the same ones.
import type { TestStage } from "./api.ts";
import type { MockStore } from "./store.ts";

export type MockHooks = {
  stage: TestStage;
  /** « 2 / 4 » */
  sub: string;
  /** the stage's end on the server's clock (ms); null while the stage is pending (the room is being rendered) */
  endsAt: number | null;
  store: MockStore;
  /** Terminer, the clock at zero, or an abandon inside the room: the stage is over */
  onStageEnd: (how: "done" | "abandon") => void;
  /** Escape or the browser's back: the room is left, the mock keeps running */
  onLeave: () => void;
  /** the room is on screen with everything it needs: the stage's clock may start */
  onReady: () => void;
};
