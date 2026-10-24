// The comprehension rooms (docs/COCE.md §4): what the integrator mounts and what Pages may reuse.
import "./room.css";

export { PracticeRoom, type PracticeRoomProps, type Help } from "./PracticeRoom.tsx";
export { ExamRoom, type ExamRoomProps } from "./ExamRoom.tsx";
export { Player, type PlayerProps, type PlayerHandle } from "./Player.tsx";
export { Transcript, type TranscriptProps } from "./Transcript.tsx";
export { Passage, Paper, Hint, Panel, PanelBar, hintNodes, type PassageProps, type PanelProps } from "./Passage.tsx";
export { Options, type OptionsProps } from "./Options.tsx";
export { Feedback, type FeedbackProps } from "./Feedback.tsx";
export { Picker, Legend, type PickerProps, type PickTone } from "./Picker.tsx";
export { Rail, type RailProps, type RailHandle } from "./Rail.tsx";
export { Shell, Switch, type ShellProps, type Progress } from "./Shell.tsx";
export { Clock } from "../../../ui/ui.tsx";
export { ColourBar } from "../../../ui/ui.tsx";
export { type Attempt, type AttemptMode, DURATION_MIN, EXAM_QUESTIONS, placementOf } from "./attempt.ts";
export { noteServerDate, serverNow, useOnline } from "./hooks.ts";
export { ROOM_WORDS, useRoomWords } from "./words.ts";
export { playAnswerTone } from "./sound.ts";
