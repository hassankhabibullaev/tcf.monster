// An address that only points elsewhere (/co/exam → /co, a result's /review → the result): nothing to show, the
// address is replaced as soon as it is mounted.
import { useEffect } from "react";
import { replace } from "../../../ui/router.ts";

export function Redirect({ to }: { to: string }) {
  useEffect(() => { replace(to); }, [to]);
  return <div className="boot" aria-busy="true" />;
}
