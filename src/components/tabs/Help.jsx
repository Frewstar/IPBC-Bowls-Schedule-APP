import { GREEN, GOLD, GOLD_MUTED, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, F_SANS, F_UI } from "../../lib/theme.js";
import { Phone, Mail } from "lucide-react";

const MATCH_SEC_PHONE = "+447402348205";

function Card({ emoji, title, children }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "14px", marginBottom: "12px", overflow: "hidden", boxShadow: "0 1px 4px rgba(74,14,31,0.06)" }}>
      <div style={{ background: SURFACE2, padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px", borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: "22px", lineHeight: 1 }}>{emoji}</span>
        <div style={{ fontFamily: F_SANS, fontSize: "19px", fontWeight: "700", color: GREEN }}>{title}</div>
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

export default function HelpTab({ onBackup }) {
  return (
    <div style={{ maxWidth: "520px", margin: "0 auto", paddingBottom: "32px" }}>

      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, #6b1d2e, #3d0f1a)`, borderRadius: "16px", padding: "22px 20px", marginBottom: "16px", boxShadow: "0 4px 16px rgba(74,14,31,0.2)" }}>
        <div style={{ fontFamily: F_SANS, fontSize: "26px", fontWeight: "700", color: "#fff", marginBottom: "6px" }}>How to use the app</div>
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
      </Card>

      <Card emoji="💾" title="Saving your data">
        <div style={{ fontFamily: F_UI, fontSize: "14px", color: TEXT2, lineHeight: 1.6, marginBottom: "14px" }}>
          This app saves everything automatically on your phone — you don't need to do anything day to day. But if you ever get a new phone or accidentally clear your browser, your data could be lost.
        </div>
        <div style={{ background: `${GOLD}10`, border: `1px solid ${GOLD}30`, borderRadius: "8px", padding: "12px 14px", marginBottom: "16px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "700", color: TEXT, marginBottom: "6px" }}>💡 We recommend saving a copy at the end of each month</div>
          <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, lineHeight: 1.5 }}>Tap the button below. Your phone will ask where to save it — you can choose <strong>Google Drive</strong>, <strong>iCloud</strong>, <strong>WhatsApp</strong>, email, or just your Downloads folder.</div>
        </div>
        <button
          onClick={onBackup}
          style={{ width: "100%", background: GREEN, border: "none", borderRadius: "10px", color: "#fff", padding: "14px", fontSize: "15px", fontWeight: "700", cursor: "pointer", fontFamily: F_UI, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "12px", minHeight: "52px" }}>
          💾 Save a Copy Now
        </button>
        <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "700", color: TEXT, marginBottom: "6px" }}>Moving to a new phone?</div>
        <Step num="1" text="On this phone — tap Save a Copy Now above. The file downloads to your phone." />
        <Step num="2" text="Move that file to your new phone — share it via WhatsApp, email, or AirDrop." />
        <Step num="3" text='On the new phone — open this app, go to Settings, and tap "Load a Saved Copy".' />
      </Card>

      {/* Common questions */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "14px", padding: "16px", marginBottom: "12px", boxShadow: "0 1px 4px rgba(74,14,31,0.06)" }}>
        <div style={{ fontFamily: F_SANS, fontSize: "19px", fontWeight: "700", color: GREEN, marginBottom: "14px" }}>Common questions</div>
        <QA q="Will I lose my data?" a="No — everything saves automatically to your phone. As long as you don't clear your browser data, it'll be there next time you open the app." />
        <QA q="My opponent isn't in the member list." a="Type their name into the search box and tap Add manually. They'll be saved for that tie." />
        <QA q="I entered the wrong score." a="Open the competition in My Ties and tap Edit Score on the round." />
        <QA q="What is the amber banner at the top?" a="It means one of your competitions needs attention — a round date is coming up, a match is today, or a date has passed. Tap it to see which competition." />
        <QA q="How do I move the app to a new phone?" a='In the Help tab, tap "Save a Copy Now". Send that file to your new phone (WhatsApp, email, or AirDrop all work). On the new phone, open Settings and tap "Load a Saved Copy".' />
        <div style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: "700", color: TEXT, marginBottom: "5px" }}>❓ Question about the draw or your ties?</div>
        <div style={{ fontFamily: F_UI, fontSize: "14px", color: TEXT2, lineHeight: 1.6, marginBottom: "10px" }}>Contact the Match Secretary — Matt Kirkland. He handles the draw, round dates, and competition queries.</div>
        <a href={`tel:${MATCH_SEC_PHONE}`} style={{ display: "inline-flex", alignItems: "center", gap: "7px", background: `${GOLD}12`, border: `1px solid ${GOLD}40`, borderRadius: "10px", padding: "10px 16px", color: GOLD_MUTED, textDecoration: "none", fontFamily: F_UI, fontSize: "14px", fontWeight: "700", marginBottom: "14px" }}>
          <Phone size={14} strokeWidth={2} /> Call Matt Kirkland
        </a>

        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: "14px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: "700", color: TEXT, marginBottom: "5px" }}>🛠️ Problem with the app itself?</div>
          <div style={{ fontFamily: F_UI, fontSize: "14px", color: TEXT2, lineHeight: 1.6, marginBottom: "10px" }}>Leave feedback or report a problem — it goes straight to the app developer.</div>
          <a href="https://docs.google.com/forms/d/e/1FAIpQLSdElbpgUQRg4kpT2gAECgv50vnX299yrLGgUSyIShMa1bc9pg/viewform" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "7px", background: GREEN, border: "none", borderRadius: "10px", padding: "12px 18px", color: "#fff", textDecoration: "none", fontFamily: F_UI, fontSize: "14px", fontWeight: "700" }}>
            Send Feedback
          </a>
        </div>
      </div>

      {/* Powered by Frewstar */}
      <div style={{ textAlign: "center", padding: "8px 0 4px", fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>
        Powered by <a href="https://frewstar.co.uk" target="_blank" rel="noreferrer" style={{ color: GOLD_MUTED, fontWeight: "700", textDecoration: "none" }}>Frewstar</a>
      </div>

    </div>
  );
}
