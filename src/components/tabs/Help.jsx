import { GREEN, GOLD, GOLD_MUTED, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, F_DISPLAY, F_UI } from "../../lib/theme.js";
import { Phone } from "lucide-react";

const MATCH_SEC_PHONE = "+447402348205";

function Card({ emoji, title, children }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "14px", marginBottom: "12px", overflow: "hidden", boxShadow: "0 1px 4px rgba(74,14,31,0.06)" }}>
      <div style={{ background: SURFACE2, padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px", borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: "22px", lineHeight: 1 }}>{emoji}</span>
        <div style={{ fontFamily: F_DISPLAY, fontSize: "19px", fontWeight: "700", color: GREEN }}>{title}</div>
      </div>
      <div style={{ padding: "16px" }}>{children}</div>
    </div>
  );
}

function Step({ num, text }) {
  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "12px" }}>
      <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: GREEN, color: "#fff", fontFamily: F_UI, fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{num}</div>
      <div style={{ fontFamily: F_UI, fontSize: "14px", color: TEXT, lineHeight: 1.6, paddingTop: "3px" }}>{text}</div>
    </div>
  );
}

function QA({ q, a }) {
  return (
    <div style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: "14px", marginBottom: "14px" }}>
      <div style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: "700", color: TEXT, marginBottom: "5px" }}>❓ {q}</div>
      <div style={{ fontFamily: F_UI, fontSize: "14px", color: TEXT2, lineHeight: 1.6 }}>{a}</div>
    </div>
  );
}

export default function HelpTab() {
  return (
    <div style={{ maxWidth: "520px", margin: "0 auto", paddingBottom: "32px" }}>

      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, #6b1d2e, #3d0f1a)`, borderRadius: "16px", padding: "22px 20px", marginBottom: "16px", boxShadow: "0 4px 16px rgba(74,14,31,0.2)" }}>
        <div style={{ fontFamily: F_DISPLAY, fontSize: "26px", fontWeight: "700", color: "#fff", marginBottom: "6px" }}>How to use the app</div>
        <div style={{ fontFamily: F_UI, fontSize: "14px", color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>
          Simple steps to get started. If you have a question about your draw or a tie, contact the Match Secretary.
        </div>
      </div>

      <Card emoji="🎯" title="Tracking your ties">
        <Step num="1" text='Tap "My Ties" at the bottom of the screen.' />
        <Step num="2" text='Tap the big burgundy "+ Enter Tournament" button and pick your competition.' />
        <Step num="3" text="Search for your first-round opponent by their surname." />
        <Step num="4" text="After your match, open the competition and tap Enter Score." />
        <Step num="5" text="If you win, tap Next Round to add your next opponent." />
        <div style={{ background: `${GOLD}10`, border: `1px solid ${GOLD}30`, borderRadius: "8px", padding: "10px 12px", fontFamily: F_UI, fontSize: "13px", color: TEXT2, lineHeight: 1.5 }}>
          💡 <strong>Got a bye?</strong> Tap the Bye button instead of entering a score. You'll move on automatically.
        </div>
      </Card>

      <Card emoji="👥" title="Finding a member's number">
        <Step num="1" text='Tap "Members" at the bottom of the screen.' />
        <Step num="2" text="Type their surname in the search box." />
        <Step num="3" text="Tap the gold phone number to call them directly." />
      </Card>

      <Card emoji="📅" title="Checking fixtures & deadlines">
        <Step num="1" text="Tap Fixtures to see this season's full match calendar." />
        <Step num="2" text="On your tie card in My Ties, the Must play by date is the club deadline for that round." />
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 12px", fontFamily: F_UI, fontSize: "13px", color: "#b91c1c", lineHeight: 1.5 }}>
          ⚠️ <strong>Important:</strong> If a tie isn't played by the deadline, both players are put out. If you've agreed an extension, make sure it's logged in the draw book in the clubhouse.
        </div>
      </Card>

      <Card emoji="🔍" title="Searching the draw">
        <Step num="1" text='Tap "Find" at the bottom.' />
        <Step num="2" text="Type any player's surname to see who they've been drawn against." />
      </Card>

      <Card emoji="⚙️" title="Settings & text size">
        <Step num="1" text="Tap the ⚙️ gear icon at the top right of the screen." />
        <Step num="2" text="If the text is too small, tap Large or Extra Large under Text Size." />
        <Step num="3" text='Use "Backup" to save your data. Use "Restore" to get it back on a new phone.' />
      </Card>

      {/* Common questions */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "14px", padding: "16px", marginBottom: "12px", boxShadow: "0 1px 4px rgba(74,14,31,0.06)" }}>
        <div style={{ fontFamily: F_DISPLAY, fontSize: "19px", fontWeight: "700", color: GREEN, marginBottom: "14px" }}>Common questions</div>
        <QA q="Will I lose my data?" a="No — everything saves automatically to your phone. As long as you don't clear your browser data, it'll be there next time you open the app." />
        <QA q="My opponent isn't in the member list." a="Type their name into the search box and tap Add manually. They'll be saved for that tie." />
        <QA q="I entered the wrong score." a="Open the competition in My Ties and tap Edit Score on the round." />
        <QA q="What is the amber banner at the top?" a="It means one of your competitions needs attention — a round date is coming up, a match is today, or a date has passed. Tap it to see which competition." />
        <QA q="How do I move the app to a new phone?" a="In Settings, tap Backup on your old phone to download your data. Then on the new phone, tap Restore and pick that file." />
        <div style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: "700", color: TEXT, marginBottom: "5px" }}>❓ Question about the draw or your ties?</div>
        <div style={{ fontFamily: F_UI, fontSize: "14px", color: TEXT2, lineHeight: 1.6, marginBottom: "10px" }}>Contact the Match Secretary — Matt Kirkland. He handles the draw, round dates, and competition queries.</div>
        <a href={`tel:${MATCH_SEC_PHONE}`} style={{ display: "inline-flex", alignItems: "center", gap: "7px", background: `${GOLD}12`, border: `1px solid ${GOLD}40`, borderRadius: "10px", padding: "10px 16px", color: GOLD_MUTED, textDecoration: "none", fontFamily: F_UI, fontSize: "14px", fontWeight: "700" }}>
          <Phone size={14} strokeWidth={2} /> Call Matt Kirkland
        </a>
      </div>

    </div>
  );
}
