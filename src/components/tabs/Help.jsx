import { Target, Search, Trophy, Calendar, Users, Settings, BookOpen, Star } from "lucide-react";
import { GREEN, GOLD, GOLD_MUTED, SURFACE, SURFACE2, BORDER, TEXT, TEXT2, TEXT3, F_DISPLAY, F_UI } from "../../lib/theme.js";

function HelpSection({ icon: Icon, iconColor = GREEN, title, children }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", marginBottom: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(74,14,31,0.06)" }}>
      <div style={{ background: SURFACE2, padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "7px", background: `${iconColor}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={15} strokeWidth={2} color={iconColor} />
        </div>
        <div style={{ fontFamily: F_DISPLAY, fontSize: "17px", fontWeight: "600", color: TEXT }}>{title}</div>
      </div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </div>
  );
}

function Step({ num, text }) {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginBottom: "10px" }}>
      <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: GREEN, color: "#fff", fontFamily: F_UI, fontSize: "11px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>{num}</div>
      <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT, lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}

function Tip({ text }) {
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "8px 10px", background: `${GOLD}08`, borderRadius: "7px", marginBottom: "8px", border: `1px solid ${GOLD}22` }}>
      <Star size={13} strokeWidth={2} color={GOLD_MUTED} style={{ flexShrink: 0, marginTop: "2px" }} />
      <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}

export default function HelpTab() {
  return (
    <div style={{ maxWidth: "520px", margin: "0 auto" }}>
      <div style={{ background: GREEN, borderRadius: "12px", padding: "20px", marginBottom: "16px", boxShadow: "0 4px 16px rgba(74,14,31,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <BookOpen size={24} strokeWidth={1.5} color={GOLD} />
          <div style={{ fontFamily: F_DISPLAY, fontSize: "22px", fontWeight: "700", color: "#fff" }}>How to Use the App</div>
        </div>
        <div style={{ fontFamily: F_UI, fontSize: "13px", color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>
          This app helps you track your tournament ties, find draw games, and view the 2025 fixture list — all in one place on your phone.
        </div>
      </div>

      <HelpSection icon={Target} title="My Ties — Your Tournament Tracker">
        <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, marginBottom: "12px", lineHeight: 1.6 }}>
          This is your main page. It tracks every competition you're playing in and who you face each round.
        </div>
        <Step num="1" text="Tap + Enter Tournament and pick your competition (e.g. Championship, Mitchell Handicap)." />
        <Step num="2" text="Choose how many rounds the competition has — usually 4 to 6." />
        <Step num="3" text="Search for your opponent by surname, or type their name if they're not in the list." />
        <Step num="4" text="After you play, tap Enter Score to record the result." />
        <Step num="5" text="If you win, tap Next Round to add your next opponent." />
        <Tip text="Got a bye? Tap the Bye button instead of entering a score — you'll advance automatically." />
        <Tip text="Tap History to see your full head-to-head record against any player." />
        <Tip text="Use Setup Season at the start of the year to enter all your competitions at once." />
      </HelpSection>

      <HelpSection icon={Search} title="Find — Search Draw Results">
        <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, marginBottom: "12px", lineHeight: 1.6 }}>
          Look up draw games by a player's surname. See who played who and when.
        </div>
        <Step num="1" text="Type any player's surname into the search box." />
        <Step num="2" text="All their draw games appear below, sorted by competition." />
        <Step num="3" text="Tap a player's name on any card to search for them instead." />
        <Tip text="Great for checking who you've been drawn against before the game." />
      </HelpSection>

      <HelpSection icon={Trophy} title="Draws — Your Competition Entries">
        <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, marginBottom: "12px", lineHeight: 1.6 }}>
          See all the competitions you are entered in — your personal tournament journey.
        </div>
        <Step num="1" text="Tap any competition card to see your full round-by-round progress." />
        <Step num="2" text="Active = still in. Champion = tournament winner. Eliminated = knocked out." />
        <Tip text="Add competitions in My Ties using the + Enter Tournament button." />
      </HelpSection>

      <HelpSection icon={Calendar} title="Fixtures — 2025 Match Calendar">
        <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, marginBottom: "12px", lineHeight: 1.6 }}>
          The full 2025 fixture list for Irvine Park BC — home and away games, club events, and competitions.
        </div>
        <Step num="1" text="Your next upcoming fixture appears at the top in burgundy." />
        <Step num="2" text="The next 5 upcoming fixtures are shown by default." />
        <Step num="3" text="Tap See all fixtures to view the full season." />
        <Tip text="Green badge = Home. Gold badge = Away." />
      </HelpSection>

      <HelpSection icon={Users} title="Members — Club Directory">
        <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, marginBottom: "12px", lineHeight: 1.6 }}>
          Browse and search the full club membership list. Tap a phone number to call directly.
        </div>
        <Step num="1" text="Type in the search box to instantly find any member by surname." />
        <Step num="2" text="Tap the letter index on the right to jump to a surname section." />
        <Step num="3" text="Tap a gold phone number to call that member directly." />
        <Tip text="You can import a member list from a CSV file — columns should be Name, Phone, Section." />
      </HelpSection>

      <HelpSection icon={Settings} title="Settings — Personalise the App">
        <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, marginBottom: "12px", lineHeight: 1.6 }}>
          Access Settings using the gear icon at the top right of the screen.
        </div>
        <Step num="1" text="Change your name — this appears on all your tie cards." />
        <Step num="2" text="Set your default section (Gents or Ladies)." />
        <Step num="3" text="Increase text size if the app is hard to read — try Large or Extra Large." />
        <Step num="4" text="Use Backup to download your tournament data regularly." />
        <Tip text="If you get a new phone, use Backup on your old one and Restore on your new one." />
      </HelpSection>

      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "12px", overflow: "hidden", marginBottom: "12px", boxShadow: "0 1px 3px rgba(74,14,31,0.06)" }}>
        <div style={{ background: SURFACE2, padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, fontFamily: F_DISPLAY, fontSize: "17px", fontWeight: "600", color: TEXT }}>Common Questions</div>
        <div style={{ padding: "14px 16px" }}>
          {[
            { q: "Will I lose my data if I close the app?", a: "No — everything is saved automatically to your phone. As long as you don't clear your browser data, it'll be there next time." },
            { q: "Can I use it on a different phone?", a: "Use the Backup button to download your data, then use Restore on the new phone. Data doesn't sync between devices automatically." },
            { q: "My opponent isn't in the member list — what do I do?", a: "Type their name into the opponent search box and tap Add manually. They'll be saved for that tie." },
            { q: "I entered the wrong score — can I fix it?", a: "Yes. Open the competition in My Ties and tap Edit Score on the tie card." },
            { q: "How do I add multiple competitions at once?", a: "In My Ties, tap Setup Season. You can select all your competitions and set first-round opponents in one go." },
          ].map(({ q, a }, i, arr) => (
            <div key={i} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none", paddingBottom: i < arr.length - 1 ? "12px" : "0", marginBottom: i < arr.length - 1 ? "12px" : "0" }}>
              <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT, marginBottom: "4px" }}>{q}</div>
              <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, lineHeight: 1.6 }}>{a}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "8px", fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>
        Need more help? Ask at the clubhouse.
      </div>
    </div>
  );
}
