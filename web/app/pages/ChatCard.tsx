// The Telegram group (t.me/tcfmonster), one room for everyone: a compact row in the donation card's style, right under
// it — the paper-plane icon, the title, one line, « Rejoindre ». Words live here, FR/EN.
import { Icon } from "../../ui/ui.tsx";
import { useT } from "../i18n.ts";
import "./chat.css";

export const CHAT_URL = "https://t.me/tcfmonster";

const WORDS = {
  fr: { title: "Le groupe Telegram", line: "Les autres candidats et les nouveautés", join: "Rejoindre" },
  en: { title: "The Telegram group", line: "The other candidates and the news", join: "Join" },
};

export function ChatCard() {
  const { lang } = useT();
  const w = WORDS[lang];
  return (
    <section className="chat-row" aria-labelledby="chat-card-title">
      <span className="chat-row-icon"><Icon name="send" size={18} /></span>
      <div className="chat-row-text">
        <h2 id="chat-card-title">{w.title}</h2>
        <p>{w.line}</p>
      </div>
      <a className="btn chat-row-go" href={CHAT_URL} target="_blank" rel="noopener">{w.join}</a>
    </section>
  );
}
