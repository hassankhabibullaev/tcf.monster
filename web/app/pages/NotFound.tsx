import { Empty, Button } from "../../ui/ui.tsx";
import { go } from "../../ui/router.ts";
import { useT } from "../i18n.ts";

export function NotFound() {
  const { t } = useT();
  return (
    <div className="section-page not-found">
      <img className="not-found-logo" src="/app-icon.svg" alt="" width="72" height="72" />
      <Empty icon="search" title={t.notFound}><Button size="sm" onClick={() => go("/")}>{t.backHome}</Button></Empty>
    </div>
  );
}
