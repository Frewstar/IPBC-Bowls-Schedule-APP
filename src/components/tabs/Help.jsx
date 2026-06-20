import { GREEN, GOLD, GOLD_MUTED, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, F_SANS, F_UI } from "../../lib/theme.js";
import { Phone } from "lucide-react";

const MATCH_SEC_PHONE = "+447402348205";

function Card({ emoji, title, children }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "14px", marginBottom: "12px", overflow: "hidden", boxShadow: "0 1px 4px rgba(74,14,31,0.06)" }}>
      <div style={{ background: SURFACE2, padding: "13px 16px", display: "flex", alignItems: "center", gap: "12px", borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: "20px", lineHeight: 1 }}>{emoji}</span>
        <div style={{ fontFamily: F_SANS, fontSize: "17px", fontWeight: "700", color: GREEN }}>{title}</div>
      </div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </div>
  );
}

function Step({ num, text }) {
  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "10px" }}>
      <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: GREEN, color: "#fff", fontFamily: F_UI, fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{num}</div>
      <div style={{ fontFamily: F_UI, fontSize: "14px", color: TEXT, lineHeight: 1.6, paddingTop: "2px" }}>{text}</div>
    </div>
  );
}

function QA({ q, a }) {
  return (
    <div style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: "12px", marginBottom: "12px" }}>
      <div style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: "700", color: TEXT, marginBottom: "4px" }}>❓ {q}</div>
      <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, lineHeight: 1.6 }}>{a}</div>
    </div>
  );
}

function Tip({ children }) {
  return (
    <div style={{ background: `${GOLD}10`, border: `1px solid ${GOLD}30`, borderRadius: "8px", padding: "10px 12px", fontFamily: F_UI, fontSize: "13px", color: TEXT2, lineHeight: 1.5, marginTop: "10px" }}>
      {children}
    </div>
  );
}

export default function HelpTab({ onBackup }) {
  return (
    <div style={{ maxWidth: "520px", margin: "0 auto", paddingBottom: "32px" }}>

      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg, #6b1d2e, #3d0f1a)", borderRadius: "16px", padding: "20px", marginBottom: "16px", boxShadow: "0 4px 16px rgba(74,14,31,0.2)" }}>
        <div style={{ fontFamily: F_SANS, fontSize: "24px", fontWeight: "700", color: "#fff", marginBottom: "6px" }}>How to use the app</div>
        <div style={{ fontFamily: F_UI, fontSize: "13px", color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>
          Simple steps to get started. If you have a question about your draw or a tie, contact the Match Secretary.
        </div>
      </div>

      <Card emoji="🔗" title="Link your name">
        <div style={{ fontFamily: F_UI, fontSize: "14px", color: TEXT2, lineHeight: 1.6, marginBottom: "10px" }}>
          Linking your name connects your app account to your name in the members list. Once linked, your competition draws appear automatically on your home page — no manual entry needed.
        </div>
        <Step num="1" text='After signing in, tap "Link My Name" when the prompt appears — or go to Settings and tap Link My Name under Account.' />
        <Step num="2" text="Type your surname to search the members list and tap your name." />
        <Step num="3" text='Tap "Done" to confirm. Your draws will now appear on the home page for the upcoming season.' />
        <Tip>💡 If your name shows as "Claimed" it means another account is already linked to it. Tap Request Reassignment and an admin will review it.</Tip>
      </Card>

      <Card emoji="🎯" title="Tracking your ties">
        <Step num="1" text='Tap "My Ties" at the bottom of the screen.' />
        <Step num="2" text='Tap the big "+ Enter Tournament" button and pick your competition.' />
        <Step num="3" text="Search for your first-round opponent by their surname." />
        <Step num="4" text="After your match, open the competition and tap Enter Score." />
        <Step num="5" text="If you win, tap Next Round to add your next opponent." />
        <Tip>💡 <strong>Got a bye?</strong> Tap the Bye button instead of entering a score. You'll move on automatically.</Tip>
        <Tip>💡 <strong>2027 season onwards:</strong> If your name is linked, your first-round draw will appear on the home page automatically — no need to enter it manually.</Tip>
      </Card>

      <Card emoji="🔍" title="Finding the draw">
        <Step num="1" text='Tap "Find" at the bottom of the screen.' />
        <Step num="2" text="Type any player's surname to see who they've been drawn against and get their opponent's phone number." />
        <Step num="3" text="Or scroll down to Competitions and tap any published draw to see the full bracket." />
      </Card>

      <Card emoji="👥" title="Finding a member's number">
        <Step num="1" text='Tap "Members" at the bottom of the screen.' />
        <Step num="2" text="Type their surname in the search box." />
        <Step num="3" text="Tap the gold phone number to call them directly." />
      </Card>

      <Card emoji="📅" title="Checking fixtures & deadlines">
        <Step num="1" text="Tap Fixtures to see this season's full match calendar." />
        <Step num="2" text="On your tie card in My Ties, the Must play by date is the club deadline for that round." />
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 12px", fontFamily: F_UI, fontSize: "13px", color: "#b91c1c", lineHeight: 1.5, marginTop: "10px" }}>
          ⚠️ <strong>Important:</strong> If a tie isn't played by the deadline, both players are put out. If you've agreed an extension, make sure it's logged in the draw book in the clubhouse.
        </div>
      </Card>

      <Card emoji="💾" title="Saving your data">
        <div style={{ fontFamily: F_UI, fontSize: "14px", color: TEXT2, lineHeight: 1.6, marginBottom: "12px" }}>
          The app saves everything automatically on your phone. But if you get a new phone or clear your browser, your data could be lost — save a backup copy regularly.
        </div>
        <button onClick={onBackup}
          style={{ width: "100%", background: GREEN, border: "none", borderRadius: "10px", color: "#fff", padding: "13px", fontSize: "15px", fontWeight: "700", cursor: "pointer", fontFamily: F_UI, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "12px", minHeight: "52px" }}>
          💾 Save a Copy Now
        </button>
        <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT, marginBottom: "6px" }}>Moving to a new phone?</div>
        <Step num="1" text="On this phone — tap Save a Copy Now above." />
        <Step num="2" text="Send that file to your new phone via WhatsApp, email, or AirDrop." />
        <Step num="3" text='On the new phone — open this app, go to Settings, and tap "Load a Saved Copy".' />
      </Card>

      {/* Common questions */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "14px", padding: "16px", marginBottom: "12px", boxShadow: "0 1px 4px rgba(74,14,31,0.06)" }}>
        <div style={{ fontFamily: F_SANS, fontSize: "17px", fontWeight: "700", color: GREEN, marginBottom: "12px" }}>Common questions</div>
        <QA q="Will I lose my data?" a="No — everything saves automatically to your phone. As long as you don't clear your browser data, it'll be there next time you open the app." />
        <QA q="My opponent isn't in the member list." a={"Type their name into the search box and tap \"Add manually\". They'll be saved for that tie."} />
        <QA q="I entered the wrong score." a="Open the competition in My Ties and tap Edit Score on the round." />
        <QA q="What is the amber banner at the top?" a="It means one of your competitions needs attention — a round date is coming up, a match is today, or a date has passed. Tap it to see which competition." />
        <QA q="My name shows as Claimed when I try to link." a="Someone else's account is already linked to that name. Tap Request Reassignment and an admin will sort it out." />
        <QA q="How do I move the app to a new phone?" a='In the Help tab, tap "Save a Copy Now". Send that file to your new phone. On the new phone, open Settings and tap "Load a Saved Copy".' />

        <div style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: "700", color: TEXT, marginBottom: "4px" }}>❓ Question about the draw or your ties?</div>
        <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, lineHeight: 1.6, marginBottom: "10px" }}>Contact the Match Secretary — Matt Kirkland. He handles the draw, round dates, and competition queries.</div>
        <a href={`tel:${MATCH_SEC_PHONE}`} style={{ display: "inline-flex", alignItems: "center", gap: "7px", background: `${GOLD}12`, border: `1px solid ${GOLD}40`, borderRadius: "10px", padding: "10px 16px", color: GOLD_MUTED, textDecoration: "none", fontFamily: F_UI, fontSize: "14px", fontWeight: "700", marginBottom: "14px" }}>
          <Phone size={14} strokeWidth={2} /> Call Matt Kirkland
        </a>

        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: "12px" }}>
          <div style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: "700", color: TEXT, marginBottom: "4px" }}>🛠️ Problem with the app itself?</div>
          <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, lineHeight: 1.6, marginBottom: "10px" }}>Leave feedback or report a problem — it goes straight to the app developer.</div>
          <a href="https://docs.google.com/forms/d/e/1FAIpQLSdElbpgUQRg4kpT2gAECgv50vnX299yrLGgUSyIShMa1bc9pg/viewform" target="_blank" rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: "7px", background: GREEN, border: "none", borderRadius: "10px", padding: "11px 18px", color: "#fff", textDecoration: "none", fontFamily: F_UI, fontSize: "14px", fontWeight: "700" }}>
            Send Feedback
          </a>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "8px 0 4px", fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>
        Powered by <a href="https://frewstar.co.uk" target="_blank" rel="noreferrer" style={{ color: GOLD_MUTED, fontWeight: "700", textDecoration: "none" }}>Frewstar</a>
      </div>
    </div>
  );
}
