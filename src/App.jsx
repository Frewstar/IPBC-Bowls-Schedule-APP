import { useState, useMemo, useEffect, useRef, Component } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "32px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>⚠️</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "17px", fontWeight: "700", color: "#6b1d2e", marginBottom: "8px" }}>Something went wrong</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "#6b5a5e", marginBottom: "6px", lineHeight: 1.5 }}>{this.state.error?.message}</div>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: "16px", background: "#6b1d2e", border: "none", borderRadius: "8px", color: "#fff", padding: "11px 24px", fontSize: "13px", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontWeight: "600" }}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
import {
  Binoculars, Award, Calendar, Users,
  Phone, Check, X, Pencil, Plus,
  ChevronLeft, ChevronRight, ChevronDown, Download, Upload,
  Clock, MapPin, Settings, HelpCircle, Share2,
  Shield, Info, RefreshCw, Target, Search,
  Medal, Bell, Trophy, Lock, Radio, PartyPopper,
} from "lucide-react";

// ── lib imports ──────────────────────────────────────────────────────────────
import { GREEN, MID, GOLD, GOLD_LIGHT, LIGHT, BG, LADIES, LADIES_MID, SURFACE, SURFACE2, BORDER, BRAND_HI, GOLD_MUTED, TEXT, TEXT2, TEXT3, WIN_GOLD, LOSS_RED, WIN_BG, LOSS_BG, F_DISPLAY, F_SANS, F_UI } from "./lib/theme.js";
import { TIES_KEY, SETTINGS_KEY, ENTRIES_KEY, NAME_KEY, load, save, membersToCSV, parseCSV } from "./lib/storage.js";
import { signInOutcome, registerOutcome } from "./lib/signIn.js";
import { endServerSession, flushPendingSignouts, queuePendingSignout, PENDING_SIGNOUT_KEY } from "./lib/session.js";
import { DAY_NAMES, MONTH_ABBR, getSurname, getRoundLabel, fmtDate, parseTournRoundDate, getTournRoundDate, fixtureStatus, findUrgentTie, countdownLabel, countdownDays, getHeadToHead } from "./lib/utils.js";
import { supabase } from "./lib/supabase.js";
import { useRemoteData } from "./lib/useRemoteData.js";
import { tournamentVisibleToMember } from "./lib/sections.js";

// ── component imports ─────────────────────────────────────────────────────────
import BottomSheet from "./components/BottomSheet.jsx";
import AvatarBubble from "./components/AvatarBubble.jsx";
import ProfileSheet from "./components/ProfileSheet.jsx";
import SettingsTab from "./components/tabs/Settings.jsx";
import HelpTab from "./components/tabs/Help.jsx";
import ClubTab from "./components/tabs/Club.jsx";
import LoadNotice from "./components/LoadNotice.jsx";
import FixturesTab from "./components/tabs/Fixtures.jsx";
import FindTab from "./components/tabs/Find.jsx";
import DrawsTab from "./components/tabs/Draws.jsx";
import MembersTab from "./components/tabs/Members.jsx";
import LiveGamesTab from "./components/tabs/LiveGames.jsx";
import WhatsOnTab from "./components/tabs/WhatsOn.jsx";
import AdminPanel from "./components/tabs/AdminPanel.jsx";
import DrawResultSheet from "./components/DrawResultSheet.jsx";









function MemberPill({ name, phone, color = GOLD }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: `${SURFACE}`, border: `1px solid ${GOLD}44`, borderRadius: "4px", padding: "5px 12px" }}>
      <span style={{ fontFamily: F_SANS, fontSize: "14px", fontWeight: "600", color: TEXT }}>{name}</span>
      {phone && <a href={`tel:${phone.replace(/\s/g,"")}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: GOLD, textDecoration: "none", fontFamily: F_UI, fontWeight: "500", padding: "2px 0" }}><Phone size={12} strokeWidth={1.75} />{phone}</a>}
    </div>
  );
}



// ── MAIN APP ───────────────────────────────────────────────────────────────
function MembersOnlySignedIn({ navigateTo }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "36px 24px", textAlign: "center", boxShadow: "0 2px 12px rgba(74,14,31,0.08)" }}>
      <Lock size={28} strokeWidth={1.25} color={BORDER} style={{ marginBottom: "12px" }} />
      <div style={{ fontFamily: F_SANS, fontSize: "20px", fontWeight: "600", color: TEXT2, marginBottom: "6px" }}>Members only</div>
      <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT3, lineHeight: 1.55, maxWidth: "22rem", margin: "0 auto 18px" }}>
        The club directory is for members. Sign in with your name and PIN to see it.
      </div>
      <button onClick={() => navigateTo("myties")}
        style={{ background: MID, border: "none", borderRadius: "9px", color: "#fff", padding: "12px 22px", fontSize: "14px", fontFamily: F_UI, fontWeight: "700", cursor: "pointer" }}>
        Sign in
      </button>
    </div>
  );
}

const isIosDevice  = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInstalled  = () => navigator.standalone === true ||
                           window.matchMedia("(display-mode: standalone)").matches;

// The ladder, in the same order as the migration's check constraint. Anything
// not on this list grants nothing.
const ROLES = ["super_admin", "admin", "draw_admin", "events_admin"];

// "/?game=<id>" — a link shared from a live game. Returns null when absent or
// unreadable, so nothing downstream has to guard against a throw.
function readGameParam() {
  try { return new URLSearchParams(window.location.search).get("game") || null; }
  catch { return null; }
}

// A shared What's On link. Two shapes, because it can arrive two ways:
//   /e/<id>        Vercel rewrites this to api/share.js, which answers the
//                  crawler with the poster and sends a person on to /?event=…
//   /?event=<id>   where that redirect lands — and also what the service
//                  worker cannot produce, so the path form is read too: with
//                  the app installed the worker answers /e/<id> from cache
//                  and the redirect never runs.
function readEventParam() {
  try {
    const q = new URLSearchParams(window.location.search).get("event");
    if (q) return q;
    const m = window.location.pathname.match(/^\/e\/([0-9a-fA-F-]{36})\/?$/);
    return m ? m[1] : null;
  } catch { return null; }
}

export default function BowlsTracker() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  // The roster is declared below, next to the Supabase read that fills it. It
  // used to be seeded here from a hardcoded list in the bundle — 136 of Irvine
  // Park's members and their mobile numbers, shipped to every device and shown
  // to anyone whose own roster had not loaded.
  const [ties, setTies]       = useState(() => load(TIES_KEY, {}));
  // A shared game link, /?game=<id>. Read on the first render rather than in an
  // effect, so someone following a link from WhatsApp lands on the game instead
  // of watching My Ties flash past first.
  const [deepLinkGameId, setDeepLinkGameId] = useState(readGameParam);

  // Take the id out of the address bar once we have it, so a later reload
  // doesn't reopen the game.
  useEffect(() => {
    if (!deepLinkGameId) return;
    try { window.history.replaceState({}, "", window.location.pathname); } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The event link puts the id in the path as well as the query, so this
  // rewrites to "/" rather than to pathname — otherwise a reload of /e/<id>
  // would reopen the night every time.
  useEffect(() => {
    if (!deepLinkEventId) return;
    try { window.history.replaceState({}, "", "/"); } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Same one-shot read as the game link above: held in state so taking it out
  // of the address bar doesn't close the sheet it opened.
  const [deepLinkEventId, setDeepLinkEventId] = useState(readEventParam);

  const [activeTab, setActiveTab] = useState(() =>
    readGameParam() ? "live" : readEventParam() ? "whatson" : "myties");
  const [prevTab, setPrevTab] = useState("myties");
  function navigateTo(tab) { setPrevTab(t => activeTab !== tab ? activeTab : t); setActiveTab(tab); }

  // Honours are a section at the foot of the Club tab, so this switches tabs and
  // then scrolls to them: landing a member at the top of the club's own page to
  // hunt for their honours is worse than the tab they used to have. The rAF is
  // what makes it work — the element doesn't exist until React has rendered the
  // club page.
  function goToMyHonours() {
    navigateTo("club");
    requestAnimationFrame(() => {
      document.getElementById("my-honours")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // ── Settings ──
  const [settings, setSettings] = useState(() =>
    load(SETTINGS_KEY, { fontScale: 1, defaultSection: "gents", seasonYear: new Date().getFullYear(), showReminders: true })
  );
  const fontScale = settings.fontScale || 1;
  function updateSetting(key, val) {
    setSettings(prev => {
      const next = { ...prev, [key]: val };
      save(SETTINGS_KEY, next);
      return next;
    });
  }

  // ── First-time welcome overlay ──
  // Not marked as seen — a first-time visitor who arrives on a shared game link
  // still gets the tour on a later, ordinary visit. It just isn't in the way of
  // the thing they actually clicked.
  const [showWelcome, setShowWelcome] = useState(() => !load("ipbc_welcome_seen", false) && !readGameParam());
  const [welcomeStep, setWelcomeStep] = useState(0);
  function dismissWelcome() {
    save("ipbc_welcome_seen", true);
    setShowWelcome(false);
  }

  // ── iOS install banner ──
  const [showIosBanner, setShowIosBanner] = useState(() => {
    if (load("ipbc_ios_banner_dismissed", false)) return false;
    return isIosDevice() && !isInstalled();
  });
  function dismissIosBanner() {
    save("ipbc_ios_banner_dismissed", true);
    setShowIosBanner(false);
  }

  // ── SW update banner ──
  const [swWaiting, setSwWaiting] = useState(null);
  useEffect(() => {
    function onSwUpdate(e) { setSwWaiting(e.detail); }
    window.addEventListener("swUpdateWaiting", onSwUpdate);
    return () => window.removeEventListener("swUpdateWaiting", onSwUpdate);
  }, []);
  function applySwUpdate() {
    // main.jsx owns the skip-waiting + reload handshake.
    swWaiting?.apply();
  }

  // ── Android install prompt ──
  const [installPrompt, setInstallPrompt] = useState(null);
  useEffect(() => {
    if (isInstalled()) return; // nothing to prompt
    function onInstallReady(e) { setInstallPrompt(e.detail); }
    window.addEventListener("swInstallReady", onInstallReady);
    return () => window.removeEventListener("swInstallReady", onInstallReady);
  }, []);
  async function triggerInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  }

  // ── Section toggle (used across tabs) ──
  // activeSection: "gents" | "ladies" | "gents-senior" | "ladies-senior"
  const [activeSection, setActiveSection] = useState(() => {
    const raw = load(SETTINGS_KEY, { defaultSection: "gents" }).defaultSection || "gents";
    // normalise legacy "gents-seniors" → "gents-senior" etc.
    return raw === "gents-seniors" ? "gents-senior" : raw === "ladies-seniors" ? "ladies-senior" : raw;
  });
  // memberBaseSection: which pool of members to search / filter (strips the -senior suffix)
  const memberBaseSection = activeSection.startsWith("ladies") ? "ladies" : "gents";
  const accentColor = memberBaseSection === "ladies" ? LADIES_MID : GOLD;
  const accentDark  = memberBaseSection === "ladies" ? LADIES     : GREEN;
  // kept as alias so downstream callers that still reference effectiveSection compile
  const effectiveSection = activeSection;

  // ── My Ties state ──
  const [myName, setMyName]       = useState(() => load("bowls_myname", "") || "");
  const [myPin, setMyPin]         = useState(() => load("bowls_mypin", "") || "");

  // The session token, stored where the rest of the sign-in state lives.
  //
  // This is the identity the server can actually check. The name and PIN
  // above cannot be: there is no Supabase auth session, so every request
  // arrives anonymous and a policy has nothing to compare a row against.
  // The token is what lets a SECURITY DEFINER function work out who is
  // asking, which is what has to exist before anon can lose table access.
  //
  // myPin has to stay for now. bowls_admin_role, bowls_grant_admin and the
  // poster ticket still authorise by name and PIN, and they move to the
  // token with the admin panel. Until then the PIN is still on the device.
  const [sessionToken, setSessionToken] = useState(() => load("bowls_session_token", "") || "");

  // The account's key, as the SERVER gave it to us, rather than rebuilt here
  // from the name and PIN.
  //
  // It used to be `${myName}-${myPin}`, which only worked because the PIN was
  // stored in player_name. Two things have made that wrong: a new account's
  // player_name is now a uuid, and a PIN reset no longer moves player_name.
  // Rebuilding the key locally would miss on both.
  //
  // The fallback is for devices that were signed in before this deploy: they
  // have a name and a PIN and no stored key, and must not be signed out. The
  // effect below trades their credentials for a token on the next load, and
  // once it lands this falls through to the stored value like everyone else.
  const [storedCloudKey, setStoredCloudKey] = useState(() => load("bowls_cloud_key", "") || "");

  // The account's uuid. Needed so that linking a roster entry can fill in
  // members.linked_player_id, which is what bowls_sign_in reads to restore
  // the link on the next sign-in. Linking used to write only
  // linked_cloudkey — the column that holds 69 live PINs — and that column
  // goes in Phase D.
  const [myPlayerId, setMyPlayerId] = useState(() => load("bowls_player_id", "") || "");

  // "This member asked to leave", as a fact in its own right rather than
  // something inferred from the absence of a token.
  //
  // The upgrade effect below signs a device in from a stored name and PIN
  // when it finds no token. It cannot be allowed to do that to somebody who
  // has just signed out — and "no token" alone does not tell those two apart.
  // Clearing the name and PIN happens to stop it today, which is precisely
  // the kind of accident that stops being true the first time somebody keeps
  // the name around to prefill the sign-in box.
  const [signedOut, setSignedOut] = useState(() => load("bowls_signed_out", false) === true);

  // Tokens a sign-out failed to revoke, retried on the next load. See
  // src/lib/session.js — a sign-out with no signal must not abandon a live
  // credential.
  const [pendingSignouts, setPendingSignouts] = useState(() => {
    const v = load(PENDING_SIGNOUT_KEY, []);
    return Array.isArray(v) ? v : [];
  });
  // Anyone who has been through sign-in. A visitor following a shared game link
  // has no name, and must not see the roster or anyone's phone number.
  //
  // This is a UI gate and nothing more. Every policy on `members` is
  // using (true) and the anon key ships in the bundle, so the table is still
  // readable by anyone who knows how. 002b is the actual fix; this stops the
  // roster being handed to a visitor who simply backs out of a shared game.
  const signedIn = !!myName;

  // ── The roster (Supabase only) ──
  // This is the read that mattered most. It used to start from a bundled copy
  // of Irvine Park's 136 members — names, sections and mobile numbers — and
  // replace it only when the server returned rows. A second club's roster is
  // empty, so the replacement never happened and its members were handed
  // another club's contact details, permanently.
  //
  // Now the list starts empty and only the server fills it. An empty result is
  // an empty roster and says so; a failed request says that instead.
  //
  // A signed-out visitor still gets the columns the public tabs need and
  // nothing else, so phone numbers never reach the device rather than merely
  // being hidden on it. Signing in refetches the full row.
  const [members, setMembers, membersLoad] = useRemoteData(
    () => supabase
      .from("members")
      .select(signedIn ? "*" : "id, name, section, position, sort_order")
      .order("sort_order").order("name"),
    [signedIn],
    { transform: rows => (rows || []).map(m => ({ ...m, section: m.section || "gents" })) },
  );


  const cloudKey = storedCloudKey || (myName && myPin ? `${myName.toUpperCase()}-${myPin}` : null);
  // Linked member: canonical name from members list (used for draw lookups)
  const [linkedMemberName, setLinkedMemberName] = useState(() => load("bowls_linked_member", "") || "");
  // The roster id of the signed-in member, resolved once and held here. It is
  // what live_games now records as the creator instead of the sign-in
  // credential — see 20260903_live_games_creator_member_id.sql. Null for the
  // 149 of 216 members who have not linked a roster entry; everything that
  // reads it has to cope with that.
  const [linkedMemberId, setLinkedMemberId] = useState(() => load("bowls_linked_member_id", "") || null);
  const [profile, setProfile] = useState(() => load("bowls_profile", { displayName: "", avatar: null, avatarPublic: true }));
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [memberProfiles, setMemberProfiles] = useState({});
  const [showLinkSheet, setShowLinkSheet] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkStatus, setLinkStatus] = useState(null); // null | "linking" | "claimed" | "done"
  const [claimRequests, setClaimRequests] = useState([]);
  const [settingName, setSettingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [pinInput, setPinInput]   = useState("");
  const [nameStep, setNameStep]   = useState("name"); // "name" | "pin"
  // ── Admin role (Supabase-backed) ──
  const [adminRole, setAdminRole] = useState(null); // null | "admin" | "super_admin" | "draw_admin"
  // Has the server confirmed this name+PIN is an admin? Nothing is granted
  // without it — see the effect below.
  const [adminVerified, setAdminVerified] = useState(false);
  const [adminClaimMsg, setAdminClaimMsg] = useState(null);

  // Admin rights are decided by the server, not by matching strings here.
  //
  // This used to read the admins table and compare admins.player_name against
  // whatever name the member signed in with — no PIN anywhere in it. Since
  // bowls_register deliberately allows a second account under an existing name
  // with a different PIN (that is what separates two members with the same
  // initials), anyone could register as an admin and be handed the panel.
  // bowls_is_admin checks the name and PIN against player_data.pin_hash and
  // then finds the admins row by player_id, so a lookalike account fails it.
  //
  // This closes that one route in. It does not make admin secure: almost every
  // admin action in this file still writes straight to a table with the anon
  // key against a using(true) policy, so anyone with the bundle can insert
  // themselves into the admins table without going near this check. That is
  // 002b's job, not this change's.
  useEffect(() => {
    // Fail closed. No rights before the server has confirmed them, none while
    // the check is in flight, and none if it fails for any reason — including
    // a flaky connection. There is deliberately no fallback to the old name
    // match: a fallback would reinstate the bug every time the network dropped.
    setAdminVerified(false);
    setAdminRole(null);
    if (!myName || !myPin) return;

    let cancelled = false;
    const nameUpper = myName.toUpperCase();

    (async () => {
      // One call, and it answers with the role rather than yes/no. A boolean
      // could not express layers, which is why every screen ended up gated on
      // the same flag: a Social Convenor who should only add events got the
      // members' phone numbers and the PIN reset as well.
      //
      // This replaces the old two-step — bowls_is_admin, then reading the
      // admins row by name or cloud key to find the tier. That second step
      // matched on strings the client held, which is the class of bug the
      // grant work spent yesterday removing. The server resolves the account
      // from the PIN and reads the role off its own row.
      const { data: role, error } = await supabase.rpc("bowls_admin_role", {
        p_name: nameUpper,
        p_pin:  myPin,
      });
      // Anything that is not one of the four known roles — an error, a null, a
      // dropped request — leaves them an ordinary member. Fail closed.
      if (cancelled || error) return;
      if (!ROLES.includes(role)) { setAdminVerified(true); return; }

      setAdminRole(role);
      setAdminVerified(true);
    })();

    // Credentials changed while a check was in flight — drop the stale answer.
    return () => { cancelled = true; };
  }, [myName, myPin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gates are by capability, not by "is an admin". The role is one value; what
  // it lets you do is the list below, and every screen asks the question it
  // actually needs answering rather than the general one.
  const role = adminVerified ? adminRole : null;
  const isSuperAdmin = role === "super_admin";
  const isAdmin      = role === "admin" || role === "super_admin";
  const isDrawAdmin  = role === "draw_admin";

  // What's On: the Social Convenor's whole job.
  const canEditEvents  = isAdmin || role === "events_admin";
  // Draws.
  const canRunDraws    = isAdmin || role === "draw_admin";
  // The roster: names, phone numbers, editing a member. Deliberately NOT
  // extended to the section roles — a Social Convenor has no business in the
  // members' contact details.
  const canEditMembers = isAdmin;
  // Setting someone else's PIN.
  const canResetPins   = isAdmin;
  // Handing out rights at all.
  const canGrantAdmin  = isSuperAdmin;
  // Whether there is an admin panel worth opening. An events_admin has no
  // section in it — their rights are exercised on the What's On tab itself —
  // so they get no padlock rather than a padlock onto an empty room.
  const hasAdminPanel  = isAdmin || canRunDraws;

  async function claimSuperAdmin() {
    if (!cloudKey || !myName) return;
    const nameUpper = myName.toUpperCase();
    const { data: existing } = await supabase.from("admins").select("cloud_key, player_name").eq("role", "super_admin");
    // If the existing super admin record belongs to this user, just restore the role locally
    const alreadyMe = existing?.some(r => r.cloud_key === cloudKey || r.player_name === nameUpper);
    if (alreadyMe) {
      setAdminRole("super_admin");
      setAdminClaimMsg("Super admin restored!");
      setTimeout(() => setAdminClaimMsg(null), 4000);
      return;
    }
    if (existing && existing.length > 0) {
      setAdminClaimMsg("A super admin already exists.");
      setTimeout(() => setAdminClaimMsg(null), 4000);
      return;
    }
    const { error } = await supabase.from("admins").upsert({ cloud_key: cloudKey, player_name: nameUpper, role: "super_admin", display_name: nameUpper }, { onConflict: "cloud_key" });
    if (!error) {
      setAdminRole("super_admin");
      setAdminClaimMsg("You are now super admin!");
    } else {
      setAdminClaimMsg("Error claiming super admin.");
    }
    setTimeout(() => setAdminClaimMsg(null), 4000);
  }

  // Legacy compat: superAdminName not used any more but passed to Settings for display
  const superAdminName = "";
  function makeMeSuperAdmin() { claimSuperAdmin(); }
  const [addingTie, setAddingTie] = useState(false);
  const [tieComp, setTieComp]     = useState("");
  const [tieRound, setTieRound]   = useState(0);
  const [oppSearch, setOppSearch] = useState("");
  const [oppPicked, setOppPicked] = useState(null);
  const [delTie, setDelTie]       = useState(null);

  // ── My Entries (tournament tracker) state ──
  const [entries, setEntries]           = useState(() => load("bowls_entries_v1", []));
  const [addingEntry, setAddingEntry]   = useState(false);
  const [entryTournId, setEntryTournId] = useState("");
  const [entryRounds, setEntryRounds]   = useState(4);
  const [entryOppSearch, setEntryOppSearch] = useState("");
  const [entryOppPicked, setEntryOppPicked] = useState(null);
  const [entryRound1Bye, setEntryRound1Bye] = useState(false);
  const [adhocCompName, setAdhocCompName] = useState("");
  const [entryDate, setEntryDate]       = useState("");
  const [entryTime, setEntryTime]       = useState("");
  const [teamPartners, setTeamPartners] = useState(() => load("ipbc_team_partners_v1", {}));
  const [entryMyPartners, setEntryMyPartners] = useState([]);
  const [entryPartnerSearch, setEntryPartnerSearch] = useState("");
  const [entryJustSaved, setEntryJustSaved] = useState(false);
  const [lastAddedTournName, setLastAddedTournName] = useState("");
  const [nextOppPartners, setNextOppPartners] = useState([]);
  const [nextOppPartnerSearch, setNextOppPartnerSearch] = useState("");
  const [editOppPartnersTarget, setEditOppPartnersTarget] = useState(null);
  const [editOppPartnersVal, setEditOppPartnersVal] = useState([]);
  const [editOppPartnerSearch, setEditOppPartnerSearch] = useState("");
  const [editMyPartnersEntryId, setEditMyPartnersEntryId] = useState(null);
  const [editMyPartnersVal, setEditMyPartnersVal] = useState([]);
  const [editMyPartnerSearch, setEditMyPartnerSearch] = useState("");
  const [scoringInfo, setScoringInfo]   = useState(null);
  const [scoreMy, setScoreMy]           = useState("");
  const [reorderMode, setReorderMode]   = useState(false);
  const [reorderPickId, setReorderPickId] = useState(null);

  // ── Edit opponent ──
  const [editOppTarget, setEditOppTarget] = useState(null); // { entryId, roundIdx }
  const [editOppSearch, setEditOppSearch] = useState("");
  const [editOppPicked, setEditOppPicked] = useState(null);

  const editOppResults = useMemo(() => {
    if (!editOppSearch || editOppSearch.length < 2) return [];
    const q = editOppSearch.toUpperCase();
    return members
      .filter(m => (m.section || "gents") === memberBaseSection)
      .filter(m => m.name.toUpperCase().includes(q))
      .slice(0, 6);
  }, [editOppSearch, members, activeSection]);

  const entryPartnerResults = useMemo(() => {
    if (!entryPartnerSearch || entryPartnerSearch.length < 2) return [];
    const q = entryPartnerSearch.toUpperCase();
    return members.filter(m => (m.section || "gents") === memberBaseSection).filter(m => m.name.toUpperCase().includes(q)).slice(0, 6);
  }, [entryPartnerSearch, members, activeSection]);

  const nextOppPartnerResults = useMemo(() => {
    if (!nextOppPartnerSearch || nextOppPartnerSearch.length < 2) return [];
    const q = nextOppPartnerSearch.toUpperCase();
    return members.filter(m => (m.section || "gents") === memberBaseSection).filter(m => m.name.toUpperCase().includes(q)).slice(0, 6);
  }, [nextOppPartnerSearch, members, activeSection]);

  const editOppPartnerResults = useMemo(() => {
    if (!editOppPartnerSearch || editOppPartnerSearch.length < 2) return [];
    const q = editOppPartnerSearch.toUpperCase();
    return members.filter(m => (m.section || "gents") === memberBaseSection).filter(m => m.name.toUpperCase().includes(q)).slice(0, 6);
  }, [editOppPartnerSearch, members, activeSection]);

  const editMyPartnerResults = useMemo(() => {
    if (!editMyPartnerSearch || editMyPartnerSearch.length < 2) return [];
    const q = editMyPartnerSearch.toUpperCase();
    return members.filter(m => (m.section || "gents") === memberBaseSection).filter(m => m.name.toUpperCase().includes(q)).slice(0, 6);
  }, [editMyPartnerSearch, members, activeSection]);

  function teamSizeFor(tournamentId) {
    const t = TOURNAMENTS.find(t2 => t2.id === tournamentId);
    const type = t?.type || "";
    if (type === "Pairs" || type === "Mixed Pairs") return 1;
    if (type === "Triples") return 2;
    if (type === "Rinks") return 3;
    return 0;
  }

  function openEditOpp(entryId, roundIdx, currentName) {
    setEditOppTarget({ entryId, roundIdx });
    setEditOppSearch(currentName || "");
    setEditOppPicked(null);
  }
  function saveEditOpp() {
    if (!editOppTarget) return;
    const name = editOppPicked ? editOppPicked.name : editOppSearch.trim().toUpperCase();
    const phone = editOppPicked ? (editOppPicked.phone || "") : "";
    // Allow saving empty name only on BYE ties (clears the incorrectly set opponent)
    const targetTie = entries.find(e => e.id === editOppTarget.entryId)?.ties.find(t => t.roundIdx === editOppTarget.roundIdx);
    if (!name && targetTie?.result !== "BYE") return;
    setEntries(prev => prev.map(e => {
      if (e.id !== editOppTarget.entryId) return e;
      return { ...e, ties: e.ties.map(t => t.roundIdx === editOppTarget.roundIdx ? { ...t, opponent: name, oppPhone: phone } : t) };
    }));
    setEditOppTarget(null);
    setEditOppSearch("");
    setEditOppPicked(null);
  }
  const [scoreOppV, setScoreOppV]       = useState("");
  const [nextRoundFor, setNextRoundFor] = useState(null);
  const [nextOppSearch, setNextOppSearch] = useState("");
  const [nextOppPicked, setNextOppPicked] = useState(null);
  const [nextDate, setNextDate]         = useState("");
  const [nextTime, setNextTime]         = useState("");
  const [delEntry, setDelEntry]         = useState(null);

  // ── Ties view toggle ──
  const [tiesView, setTiesView]           = useState("current");
  const [historySearch, setHistorySearch] = useState("");

  // ── Find Games state ──
  const [search, setSearch] = useState("");

  // ── Members tab state ──
  const [memberSearch, setMemberSearch] = useState("");
  const [editingId, setEditingId]       = useState(null);
  const [editName, setEditName]         = useState("");
  const [editPhone, setEditPhone]       = useState("");
  const [editSection, setEditSection]   = useState("gents");
  const [editPosition, setEditPosition] = useState("");
  const [newName, setNewName]           = useState("");
  const [newPhone, setNewPhone]         = useState("");
  const [newSection, setNewSection]     = useState("gents");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [uploadMsg, setUploadMsg]       = useState(null);
  const fileInputRef  = useRef(null);
  const backupFileRef = useRef(null);

  // ── Tie date editing state ──
  const [editingTieDate, setEditingTieDate] = useState(null);
  const [editDateVal, setEditDateVal]       = useState("");
  const [editTimeVal, setEditTimeVal]       = useState("");
  const [backupMsg, setBackupMsg]           = useState(null);

  // ── Draws tab state ──
  const [activeTournament, setActiveTournament] = useState(null);
  const [activeRound, setActiveRound]           = useState(0);

  // ── Sheet states ──
  const [sheetEntryId, setSheetEntryId]   = useState(null); // entry detail sheet
  const [showEntrySheet, setShowEntrySheet] = useState(false); // enter tournament sheet
  const [showSetupSheet, setShowSetupSheet] = useState(false); // setup season sheet
  const [showAddMemberSheet, setShowAddMemberSheet] = useState(false); // add member sheet
  const [fixturesExpanded, setFixturesExpanded] = useState(false); // fixtures expand

  // ── Honours ──
  const HONOURS_KEY = "bowls_honours_v1";
  const [honours, setHonours] = useState(() => load(HONOURS_KEY, []));
  const [showHonoursSheet, setShowHonoursSheet] = useState(false);
  const [editHonourId, setEditHonourId] = useState(null);
  const [honourComp, setHonourComp] = useState("");
  const [honourPosition, setHonourPosition] = useState("Winner");
  const [honourYear, setHonourYear] = useState(String(new Date().getFullYear()));
  const [honourNotes, setHonourNotes] = useState("");
  useEffect(() => { save(HONOURS_KEY, honours); }, [honours]);

  const myHonours = useMemo(() => honours.filter(h => h.player === myName).sort((a, b) => b.year - a.year), [honours, myName]);

  const honoursGrouped = useMemo(() => {
    const g = {};
    myHonours.forEach(h => { if (!g[h.year]) g[h.year] = []; g[h.year].push(h); });
    return g;
  }, [myHonours]);
  const honoursYears = useMemo(() => Object.keys(honoursGrouped).sort((a, b) => b - a), [honoursGrouped]);

  const [openHonourYears, setOpenHonourYears] = useState(() => new Set(honoursYears.slice(0, 1)));

  // Keep the most-recent year open whenever a new year appears (e.g. first win of the season)
  useEffect(() => {
    if (honoursYears.length > 0) {
      setOpenHonourYears(prev => {
        if (prev.has(honoursYears[0])) return prev;
        const next = new Set(prev);
        next.add(honoursYears[0]);
        return next;
      });
    }
  }, [honoursYears[0]]);

  function openAddHonour() {
    setEditHonourId(null);
    setHonourComp(""); setHonourPosition("Winner");
    setHonourYear(String(new Date().getFullYear())); setHonourNotes("");
    setShowHonoursSheet(true);
  }
  function openEditHonour(h) {
    setEditHonourId(h.id);
    setHonourComp(h.competition); setHonourPosition(h.position);
    setHonourYear(h.year); setHonourNotes(h.notes || "");
    setShowHonoursSheet(true);
  }
  function saveHonour() {
    if (!honourComp.trim()) return;
    if (editHonourId) {
      setHonours(prev => prev.map(h => h.id === editHonourId
        ? { ...h, competition: honourComp.trim(), position: honourPosition, year: honourYear, notes: honourNotes.trim() }
        : h));
    } else {
      setHonours(prev => [...prev, { id: Date.now().toString(), player: myName, competition: honourComp.trim(), position: honourPosition, year: honourYear, notes: honourNotes.trim() }]);
    }
    setShowHonoursSheet(false);
  }
  function deleteHonour(id) {
    setHonours(prev => prev.filter(h => h.id !== id));
  }

  // ── Head-to-head ──
  const [h2hOpponent, setH2hOpponent] = useState(null); // string | null
  function openH2H(name) { if (name) setH2hOpponent(name.trim()); }

  // ── Competitions (Supabase only) ──
  // There is deliberately no hardcoded fallback. This used to seed from a
  // bundled competition list and only overwrite when the read returned rows,
  // so a club with no competitions of its own was shown Irvine Park's — for
  // ever, because an empty table never stops looking empty. See
  // useRemoteData.js for why the status matters more than the row count.
  const [baseTournaments, setBaseTournaments, tournamentsLoad] = useRemoteData(
    () => supabase.from("tournaments").select("*").order("sort_order"),
    [],
    { transform: rows => (rows || []).map(t => ({ ...t, source: "ipbc", sourceLabel: "IPBC" })) },
  );

  const PERSONAL_COMPS_KEY = "bowls_personal_comps_v1";
  const [personalComps, setPersonalComps] = useState(() => load(PERSONAL_COMPS_KEY, []));
  useEffect(() => { save(PERSONAL_COMPS_KEY, personalComps); }, [personalComps]);

  const TOURNAMENTS = useMemo(() => {
    const personal = personalComps
      .filter(c => c.owner === myName && tournamentVisibleToMember(c.section || "gents", activeSection))
      .map(c => ({ ...c, source: "personal", sourceLabel: "Personal" }));
    const base = baseTournaments.filter(t => tournamentVisibleToMember(t.section || "gents", activeSection));
    return [...base, ...personal];
  }, [baseTournaments, personalComps, myName, activeSection]);

  // ── Fixtures (Supabase only — no hardcoded season) ──
  // event_date leads and sort_order is the same-date tiebreak. That ordering,
  // and not the reverse, is what makes sort_order advisory.
  //
  // Fixtures.jsx takes the "Next Fixture" hero from upcoming[0] — the first
  // row in query order — and addFixture sends no sort_order, so every fixture
  // added through the UI takes the column default of 99. Ordering by
  // sort_order first would still place such a row at numeric position 99
  // whatever its date: with the season seeded at 10..350, a fixture added for
  // October would render between 23 and 31 May. Leading on event_date puts
  // every row on its own date no matter what sort_order says, so the column
  // can only ever break ties between two fixtures on the same day.
  const [fixtures, setFixtures, fixturesLoad] = useRemoteData(
    () => supabase.from("club_fixtures").select("*").order("event_date").order("sort_order"),
    [],
    { transform: rows => (rows || []).map(f => ({ ...f, date: new Date(f.event_date + "T12:00:00") })) },
  );

  // ── Roll of Honour (Supabase only — no hardcoded competition list) ──
  const [rollOfHonour, setRollOfHonour, rollOfHonourLoad] = useRemoteData(
    () => supabase.from("roll_of_honour").select("*").order("sort_order"),
    [],
  );

  // ── Honorary members (Supabase only — no hardcoded names) ──
  // A single club_config row rather than a list, so `initial` is [] and the
  // transform reaches through to the jsonb `value` column.
  const [honoraryMembers, setHonoraryMembers, honoraryLoad] = useRemoteData(
    () => supabase.from("club_config").select("value").eq("key", "honorary_members").maybeSingle(),
    [],
    { transform: row => row?.value || [] },
  );

  // ── Fixture mutations ──
  async function addFixture(data) {
    const tempId = `temp-${Date.now()}`;
    const newFix = { ...data, id: tempId, date: new Date(data.event_date + "T12:00:00") };
    setFixtures(prev => [...prev, newFix].sort((a, b) => a.date - b.date));
    const { data: inserted, error } = await supabase.from("club_fixtures").insert(data).select().single();
    if (error) { setFixtures(prev => prev.filter(f => f.id !== tempId)); return; }
    setFixtures(prev => prev.map(f => f.id === tempId ? { ...inserted, date: new Date(inserted.event_date + "T12:00:00") } : f));
  }
  async function editFixture(id, data) {
    const prev = fixtures.find(f => f.id === id);
    setFixtures(f => f.map(x => x.id === id ? { ...x, ...data, date: new Date(data.event_date + "T12:00:00") } : x));
    const { error } = await supabase.from("club_fixtures").update(data).eq("id", id);
    if (error) setFixtures(f => f.map(x => x.id === id ? prev : x));
  }
  async function deleteFixture(id) {
    setFixtures(prev => prev.filter(f => f.id !== id));
    await supabase.from("club_fixtures").delete().eq("id", id);
  }

  // ── Roll of Honour mutations ──
  // This used to build the new array here and PATCH the table. roll_of_honour
  // is SELECT-only to the app's key — deliberately, because 285 entries going
  // back to 1958 were one careless request away from anybody holding the
  // bundle — so that write had been failing with "permission denied" and the
  // button had been reporting nothing at all.
  //
  // bowls_admin_record_winner is the way in. It re-checks the role on the
  // server against the PIN typed at sign-in rather than the isAdmin flag in
  // this component, derives the club from the account, and owns the {year,
  // winner} shape. Returns the RPC's status object for the caller to report.
  async function recordWinner(compId, year, winner) {
    const { data, error } = await supabase.rpc("bowls_admin_record_winner", {
      p_name:        (myName || "").toUpperCase(),
      p_pin:         myPin || "",
      p_category_id: compId,
      p_year:        Number(year),
      p_winner:      winner,
    });
    if (error) return { status: "error", message: `Couldn't save: ${error.message}` };
    if (!data)  return { status: "error", message: "Couldn't save — no response from the server." };

    // Read the status, not the absence of an error. A refusal comes back as a
    // perfectly successful request carrying status:"not_allowed" — treating
    // that as a save is exactly how a button comes to congratulate someone for
    // a write that never happened.
    if (data.status !== "ok") return data;

    // Re-read rather than patch from here, so the board shows what the server
    // holds — including the order it chose to store the years in.
    const { data: row } = await supabase.from("roll_of_honour").select("winners").eq("id", compId).single();
    if (Array.isArray(row?.winners)) {
      setRollOfHonour(prev => prev.map(c => c.id === compId ? { ...c, winners: row.winners } : c));
    }
    return data;
  }

  // ── Honorary Members mutations ──
  async function addHonoraryMember(name) {
    if (!name.trim()) return;
    const updated = [...honoraryMembers, name.trim()];
    setHonoraryMembers(updated);
    await supabase.from("club_config").upsert({ key: "honorary_members", value: updated }, { onConflict: "key" });
  }
  async function removeHonoraryMember(name) {
    const updated = honoraryMembers.filter(n => n !== name);
    setHonoraryMembers(updated);
    await supabase.from("club_config").upsert({ key: "honorary_members", value: updated }, { onConflict: "key" });
  }

  const [showManageCompsSheet, setShowManageCompsSheet] = useState(false);
  const [editCompId, setEditCompId] = useState(null);
  const [editCompSource, setEditCompSource] = useState("ipbc");
  const [compFormName, setCompFormName] = useState("");
  const [compFormType, setCompFormType] = useState("Singles");
  const [compFormColor, setCompFormColor] = useState("#6b1d2e");

  const COMP_COLORS = ["#ef4444","#f59e0b","#06b6d4","#ec4899","#84cc16","#f97316","#10b981","#8b5cf6","#a78bfa","#6b1d2e","#c9a84c","#2d6a4f"];
  const COMP_TYPES  = ["Singles","Pairs","Triples","Rinks","Handicap","Mixed Pairs","Other"];

  function openAddComp() {
    if (!isSuperAdmin) return;
    setEditCompId(null);
    setEditCompSource("ipbc");
    setCompFormName(""); setCompFormType("Singles"); setCompFormColor("#6b1d2e");
    setShowManageCompsSheet(true);
  }
  function openAddPersonalComp() {
    setEditCompId(null);
    setEditCompSource("personal");
    setCompFormName(""); setCompFormType("Singles"); setCompFormColor("#2d6a4f");
    setShowManageCompsSheet(true);
  }
  function openEditComp(t) {
    if (t?.source === "ipbc" && !isSuperAdmin) return;
    if (t?.source === "personal" && t?.owner && t.owner !== myName) return;
    setEditCompId(t.id);
    setEditCompSource(t.source || "ipbc");
    setCompFormName(t.name); setCompFormType(t.type || "Singles"); setCompFormColor(t.color || "#6b1d2e");
    setShowManageCompsSheet(true);
  }
  async function saveComp() {
    if (!compFormName.trim()) return;
    if (editCompSource === "ipbc" && !isSuperAdmin) return;
    if (editCompId && editCompSource === "ipbc") {
      // Update existing IPBC tournament in Supabase
      const updated = { name: compFormName.trim(), type: compFormType, color: compFormColor };
      setBaseTournaments(prev => prev.map(t => t.id === editCompId ? { ...t, ...updated } : t));
      await supabase.from("tournaments").update(updated).eq("id", editCompId);
    } else if (editCompId && editCompSource === "personal") {
      setPersonalComps(prev => prev.map(c => c.id === editCompId && c.owner === myName ? { ...c, name: compFormName.trim(), type: compFormType, color: compFormColor } : c));
    } else if (editCompSource === "personal") {
      setPersonalComps(prev => [...prev, { id: `personal-${Date.now()}`, owner: myName, section: effectiveSection, name: compFormName.trim(), type: compFormType, color: compFormColor, rounds: [], custom: true, source: "personal" }]);
    } else {
      // New IPBC competition — insert to Supabase
      const newId = `custom-${Date.now()}`;
      const newComp = { id: newId, name: compFormName.trim(), type: compFormType, color: compFormColor, rounds: [], round_dates: [], source: "ipbc", sort_order: 99 };
      setBaseTournaments(prev => [...prev, { ...newComp, sourceLabel: "IPBC" }]);
      await supabase.from("tournaments").insert(newComp);
    }
    setShowManageCompsSheet(false);
  }
  async function deleteComp(id) {
    if (editCompSource === "ipbc" && !isSuperAdmin) return;
    if (editCompSource === "ipbc") {
      setBaseTournaments(prev => prev.filter(t => t.id !== id));
      await supabase.from("tournaments").delete().eq("id", id);
    } else {
      setPersonalComps(prev => prev.filter(c => !(c.id === id && c.owner === myName)));
    }
    setShowManageCompsSheet(false);
  }

  // Master round dates: stored in tournaments.round_dates in Supabase

  const [showRoundDatesSheet, setShowRoundDatesSheet] = useState(false);
  const [roundDatesCompId, setRoundDatesCompId] = useState("");
  const [roundDatesValues, setRoundDatesValues] = useState([]);

  function getRoundDateForComp(tournamentId, roundIdx) {
    const t = baseTournaments.find(t2 => t2.id === tournamentId);
    const manual = t?.round_dates?.[roundIdx];
    if (manual) return manual;
    // baseTournaments, not a hardcoded list: the round dates must come from
    // the same competitions the rest of the screen is showing.
    return getTournRoundDate(baseTournaments, tournamentId, roundIdx, settings.seasonYear || new Date().getFullYear());
  }

  function openAllRoundDatesEditor(t) {
    if (!isSuperAdmin) return;
    const yr = settings.seasonYear || new Date().getFullYear();
    const existing = Array.isArray(t.round_dates) ? t.round_dates : [];
    const rounds = Array.isArray(t.rounds) ? t.rounds : [];
    const base = rounds.map(r => parseTournRoundDate(r, yr));
    const len = Math.max(existing.length, rounds.length, 1);
    const merged = Array.from({ length: len }, (_, i) => existing[i] || base[i] || "");
    setRoundDatesCompId(t.id);
    setRoundDatesValues(merged);
    setShowRoundDatesSheet(true);
  }

  async function saveAllRoundDates() {
    if (!isSuperAdmin) return;
    if (!roundDatesCompId) return;
    const dates = [...roundDatesValues];
    setBaseTournaments(prev => prev.map(t =>
      t.id === roundDatesCompId ? { ...t, round_dates: dates } : t
    ));
    await supabase.from("tournaments").update({ round_dates: dates }).eq("id", roundDatesCompId);
    // Push dates to any existing draws for this competition so Find tab shows them
    await supabase.from("draws").update({ round_dates: dates }).eq("tournament_id", roundDatesCompId);
    setShowRoundDatesSheet(false);
  }

  // ── Phase 3: opponent notes ──
  const NOTES_KEY = "bowls_opp_notes_v1";
  const [oppNotes, setOppNotes] = useState(() => load(NOTES_KEY, {}));
  const [editingNote, setEditingNote] = useState(null); // { key, value }
  const [shareToast, setShareToast] = useState(null); // toast message
  useEffect(() => { save(NOTES_KEY, oppNotes); }, [oppNotes]);

  function saveOppNote(opponent, note) {
    const key = opponent?.trim().toUpperCase();
    if (!key) return;
    setOppNotes(prev => ({ ...prev, [key]: note }));
    setEditingNote(null);
  }

  const [appShareToast, setAppShareToast] = useState(null);

  async function shareApp() {
    const url = window.location.origin;
    const title = "Irvine Park Bowling Club";
    const text = "Join me on the IPBC Bowls app — track tournament draws, results and the member directory for Irvine Park Bowling Club. Install it on your phone in seconds!";
    if (navigator.share) {
      try { await navigator.share({ title, text: `${text}\n\n${url}`, url }); return; } catch {}
    }
    try {
      await navigator.clipboard.writeText(`${title}\n${text}\n\n${url}`);
      setAppShareToast("Link copied to clipboard!");
    } catch {
      setAppShareToast(url);
    }
    setTimeout(() => setAppShareToast(null), 4000);
  }

  function shareResult(tie, tournamentName) {
    const verb = tie.result === "W" ? "beat" : "lost to";
    const score = tie.result === "BYE" ? "bye" : `${tie.myScore}–${tie.oppScore}`;
    const msg = tie.result === "BYE"
      ? `${myName} advanced via bye in the ${tournamentName} (${tie.roundLabel})`
      : `${myName} ${verb} ${tie.opponent} ${score} in the ${tournamentName} (${tie.roundLabel})`;
    navigator.clipboard?.writeText(msg).then(() => {
      setShareToast("Result copied to clipboard!");
      setTimeout(() => setShareToast(null), 3000);
    }).catch(() => {
      setShareToast(msg);
      setTimeout(() => setShareToast(null), 5000);
    });
  }

  // Members are now sourced from Supabase; no localStorage save needed
  useEffect(() => { save(TIES_KEY, ties); },       [ties]);
  useEffect(() => { save("bowls_myname", myName); }, [myName]);
  useEffect(() => { save("bowls_mypin", myPin); }, [myPin]);
  useEffect(() => { save("bowls_session_token", sessionToken); }, [sessionToken]);
  useEffect(() => { save("bowls_cloud_key", storedCloudKey); }, [storedCloudKey]);
  useEffect(() => { save("bowls_player_id", myPlayerId); }, [myPlayerId]);
  useEffect(() => { save("bowls_signed_out", signedOut); }, [signedOut]);
  useEffect(() => { save(PENDING_SIGNOUT_KEY, pendingSignouts); }, [pendingSignouts]);
  useEffect(() => { save("bowls_linked_member", linkedMemberName); }, [linkedMemberName]);
  useEffect(() => { save("bowls_linked_member_id", linkedMemberId || ""); }, [linkedMemberId]);
  useEffect(() => { save("bowls_profile", profile); }, [profile]);
  useEffect(() => { save("bowls_entries_v1", entries); }, [entries]);

  // ── Supabase cloud sync ──
  const [syncStatus, setSyncStatus] = useState("idle"); // "idle"|"syncing"|"synced"|"error"

  // Set once the cloud copy for the current account has been read. The upload below
  // waits for it, so a slow first fetch can't push this device's empty state over
  // data that is already in the cloud.
  const [hydratedKey, setHydratedKey] = useState(null);

  // On load: pull entries + ties + profile from cloud. Keeps retrying while it fails —
  // uploads stay parked until it lands, so a phone that opened offline can't overwrite
  // the cloud copy with an empty one.
  useEffect(() => {
    if (!cloudKey || hydratedKey === cloudKey) return;
    let cancelled = false;
    let timer = null;

    async function hydrate(attempt = 0) {
      if (cancelled) return;
      setSyncStatus("syncing");
      const { data, error } = await supabase
        .from("player_data")
        .select("entries, ties, profile")
        .eq("player_name", cloudKey)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setSyncStatus("error");
        timer = setTimeout(() => hydrate(attempt + 1), Math.min(30000, 3000 * 2 ** attempt));
        return;
      }
      if (data?.entries?.length > 0) {
        setEntries(prev => {
          const localIds = new Set(prev.map(e => e.id));
          const merged = [...prev, ...data.entries.filter(e => !localIds.has(e.id))];
          return merged;
        });
      }
      if (data?.ties && Object.keys(data.ties).length > 0) {
        setTies(prev => ({ ...data.ties, ...prev }));
      }
      if (data?.profile && Object.keys(data.profile).length > 0) {
        setProfile(data.profile);
      }
      setHydratedKey(cloudKey);
      setSyncStatus("synced");
    }

    hydrate();
    const onOnline = () => { clearTimeout(timer); hydrate(); };
    window.addEventListener("online", onOnline);
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener("online", onOnline); };
  }, [cloudKey, hydratedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore the member link from the cloud so a device that lost its local storage
  // isn't asked to link a name that is already linked to this account.
  useEffect(() => {
    if (!cloudKey || (linkedMemberName && linkedMemberId)) return;
    let cancelled = false;
    // Signing in no longer needs this: bowls_sign_in and bowls_session_state
    // both return member_id and member_name, resolved through
    // members.linked_player_id. What is left is the fallback for a link made
    // before linked_player_id was filled in, which is found by cloud key or
    // not at all. It goes with the rest of the members reads in Step 3d.
    supabase.from("members").select("id, name").eq("linked_cloudkey", cloudKey).maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        if (data.name) setLinkedMemberName(data.name);
        if (data.id) setLinkedMemberId(data.id);
      });
    return () => { cancelled = true; };
  }, [cloudKey, linkedMemberName, linkedMemberId]);

  // Ask the browser to keep our storage. Without this iOS evicts localStorage after
  // about a week of not opening the app, which signs the member out again.
  useEffect(() => {
    if (myName && navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  }, [myName]);

  // On entries, ties or profile change: debounced upsert to cloud
  useEffect(() => {
    if (!cloudKey || hydratedKey !== cloudKey) return;
    const timer = setTimeout(() => {
      setSyncStatus("syncing");
      supabase
        .from("player_data")
        .upsert({ player_name: cloudKey, entries, ties, profile, updated_at: new Date().toISOString() }, { onConflict: "player_name" })
        .then(({ error }) => setSyncStatus(error ? "error" : "synced"));
    }, 2500);
    return () => clearTimeout(timer);
  }, [entries, ties, profile, cloudKey, hydratedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch profiles + entries for all members who have linked their account
  useEffect(() => {
    const cloudKeys = members.filter(m => m.linked_cloudkey).map(m => m.linked_cloudkey);
    if (cloudKeys.length === 0) return;
    supabase.from("player_data").select("player_name, profile, entries")
      .in("player_name", cloudKeys)
      .then(({ data }) => {
        if (!data) return;
        const map = {};
        data.forEach(row => {
          if (row.profile && Object.keys(row.profile).length > 0) {
            map[row.player_name] = { ...row.profile, entries: row.entries || [] };
          }
        });
        setMemberProfiles(map);
      });
  }, [members]); // eslint-disable-line react-hooks/exhaustive-deps

  // One-time migration: ensure entries/ties have section for proper Ladies/Gents split
  useEffect(() => {
    setEntries(prev => {
      const needs = prev.some(e => !e.section);
      return needs ? prev.map(e => ({ ...e, section: e.section || activeSection || "gents" })) : prev;
    });
    setTies(prev => {
      const keys = Object.keys(prev);
      const needs = keys.some(id => !prev[id]?.section);
      if (!needs) return prev;
      const next = { ...prev };
      keys.forEach(id => { next[id] = { ...next[id], section: next[id].section || activeSection || "gents" }; });
      return next;
    });
  }, [activeSection]);

  // ── Derived ──
  const sectionMembers = useMemo(() => members.filter(m => (m.section || "gents") === memberBaseSection), [members, memberBaseSection]);

  const myTiesList = useMemo(() =>
    Object.values(ties)
      .filter(t => t.myName === myName && tournamentVisibleToMember(t.section || "gents", activeSection))
      .sort((a, b) => a.tournamentId.localeCompare(b.tournamentId) || a.roundIdx - b.roundIdx),
    [ties, myName, activeSection]
  );
  const wins   = myTiesList.filter(t => t.result === "W").length;
  const losses = myTiesList.filter(t => t.result === "L").length;

  const myEntries = useMemo(
    () => entries.filter(e => e && e.myName?.replace(/\s+/g,"").toUpperCase() === myName?.replace(/\s+/g,"").toUpperCase() && tournamentVisibleToMember(e.section || "gents", activeSection)),
    [entries, myName, activeSection]
  );

  const [remindersExpanded, setRemindersExpanded] = useState(false);

  const reminderItems = useMemo(() => {
    if (!(settings.showReminders ?? true)) return [];
    const items = [];
    for (const entry of myEntries.filter(e => e.status === "active")) {
      const nextRoundIdx = entry.ties.length;
      if (nextRoundIdx >= entry.totalRounds) continue;
      const tie = entry.ties.find(t => t.roundIdx === nextRoundIdx);
      const sched = getRoundDateForComp(entry.tournamentId, nextRoundIdx);
      if (!tie) {
        // Trigger 1: no opponent set, round deadline ≤5 days or passed
        if (sched) {
          const d = countdownDays(sched);
          if (d !== null && d <= 5) {
            items.push({ entryName: entry.tournamentName, color: entry.tournamentColor,
              message: d < 0 ? "Round date passed — opponent not yet set" : "Round date is soon — opponent not set yet" });
          }
        }
      } else if (!tie.result) {
        const checkDate = tie.date || sched;
        if (checkDate) {
          const d = countdownDays(checkDate);
          if (d !== null && d < 0) {
            // Trigger 3: date has passed, no score
            items.push({ entryName: entry.tournamentName, color: entry.tournamentColor,
              message: "Round date passed — if this wasn't played, check the clubhouse book" });
          } else if (d !== null && d <= 1) {
            // Trigger 2: today or tomorrow, no score
            items.push({ entryName: entry.tournamentName, color: entry.tournamentColor,
              message: d === 0 ? "Match today — enter the score after you play" : "Match tomorrow — good luck!" });
          }
        }
      }
    }
    return items;
  }, [myEntries, settings.showReminders, settings.seasonYear]);

  function placeEntryBefore(sourceId, targetId) {
    setEntries(prev => {
      const arr = [...prev];
      const from = arr.findIndex(e => e.id === sourceId);
      const to = arr.findIndex(e => e.id === targetId);
      if (from < 0 || to < 0 || from === to) return prev;
      const [moved] = arr.splice(from, 1);
      const adjustedTo = from < to ? to - 1 : to;
      arr.splice(adjustedTo, 0, moved);
      return arr;
    });
  }

  const oppResults = useMemo(() => {
    if (!oppSearch || oppSearch.length < 2) return [];
    const q = oppSearch.toUpperCase();
    return sectionMembers.filter(m => m.name.toUpperCase().includes(q)).slice(0, 8);
  }, [oppSearch, sectionMembers]);

  const filteredMembers = useMemo(() => {
    const sorted = [...sectionMembers].sort((a,b) => getSurname(a.name).localeCompare(getSurname(b.name)));
    if (!memberSearch) return sorted;
    const q = memberSearch.toUpperCase();
    return sorted.filter(m => getSurname(m.name).startsWith(q) || m.name.toUpperCase().includes(q));
  }, [sectionMembers, memberSearch]);

  const groupedMembers = useMemo(() => {
    const g = {};
    filteredMembers.forEach(m => {
      const l = getSurname(m.name)[0] || "#";
      if (!g[l]) g[l] = [];
      g[l].push(m);
    });
    return g;
  }, [filteredMembers]);

  // ── All draws (admin sees drafts + published; Find tab sees only published) ──
  const [allDraws, setAllDraws]         = useState([]);
  const [drawPairings, setDrawPairings] = useState([]);
  const [drawResults, setDrawResults]   = useState([]);
  const publishedDraws = useMemo(() => allDraws.filter(d => d.published && (!d.is_test || isSuperAdmin) && tournamentVisibleToMember(d.section || "gents", activeSection)), [allDraws, isSuperAdmin, activeSection]);
  useEffect(() => {
    supabase.from("draws").select("*")
      .then(({ data }) => { if (data) setAllDraws(data); });
    supabase.from("draw_pairings").select("*")
      .then(({ data }) => { if (data) setDrawPairings(data); });
    supabase.from("draw_results").select("*")
      .then(({ data }) => { if (data) setDrawResults(data); });
  }, []);

  const playerGames = useMemo(() => {
    if (!search || search.length < 2) return [];
    const upper = search.toUpperCase().trim();

    function getMainOpponent(row) {
      if (row.slot_index == null) return null;
      const partnerSlot = row.slot_index % 2 === 1 ? row.slot_index + 1 : row.slot_index - 1;
      const partner = drawPairings.find(p => p.draw_id === row.draw_id && p.round_type === 'main' && p.slot_index === partnerSlot);
      return partner?.player_name || null;
    }

    const publishedIds = new Set(publishedDraws.map(d => d.id));
    const matches = drawPairings.filter(p => {
      if (!publishedIds.has(p.draw_id)) return false;
      if (p.player_name.toUpperCase().includes(upper)) return true;
      if (p.round_type === 'prelim') return (p.opponent_name || "").toUpperCase().includes(upper);
      return (getMainOpponent(p) || "").toUpperCase().includes(upper);
    });

    return matches.map(p => {
      const draw = publishedDraws.find(d => d.id === p.draw_id);
      const isSearchedPlayer = p.player_name.toUpperCase().includes(upper);
      let entry, opponent;
      if (p.round_type === 'prelim') {
        entry    = isSearchedPlayer ? p.player_name : p.opponent_name;
        opponent = isSearchedPlayer ? p.opponent_name : p.player_name;
      } else {
        const mainOpp = getMainOpponent(p);
        entry    = isSearchedPlayer ? p.player_name : mainOpp;
        opponent = isSearchedPlayer ? mainOpp : p.player_name;
      }
      return {
        tournament:   draw?.tournament_name || "",
        tournamentId: draw?.tournament_id   || "",
        seasonYear:   draw?.season_year,
        roundType:    p.round_type || 'main',
        entry:        entry || "",
        opponent:     opponent || null,
        isBye:        !opponent,
        drawId:       p.draw_id,
      };
    });
  }, [search, drawPairings, publishedDraws]);

  // Auto-derive Round 1 draw entries for the current user from published draws
  const myDrawEntries = useMemo(() => {
    const lookupName = linkedMemberName || myName;
    if (!lookupName) return [];
    const upper = lookupName.toUpperCase().trim();
    const publishedIds = new Set(publishedDraws.map(d => d.id));
    const seen = new Set();
    const result = [];
    drawPairings.forEach(p => {
      if (!publishedIds.has(p.draw_id)) return;
      if (seen.has(p.draw_id)) return;
      if (p.player_name.toUpperCase().trim() !== upper) return;
      seen.add(p.draw_id);
      const draw = publishedDraws.find(d => d.id === p.draw_id);
      let opponent = null;
      if (p.round_type === 'prelim') {
        opponent = p.opponent_name || null;
      } else {
        const pairSlot = p.slot_index % 2 === 1 ? p.slot_index + 1 : p.slot_index - 1;
        const pair = drawPairings.find(x => x.draw_id === p.draw_id && x.round_type === 'main' && x.slot_index === pairSlot);
        opponent = pair?.player_name || null;
      }
      const roundDates = Array.isArray(draw?.round_dates) ? draw.round_dates : [];
      result.push({
        drawId: p.draw_id,
        tournamentId: draw?.tournament_id || "",
        tournamentName: draw?.tournament_name || "",
        seasonYear: draw?.season_year,
        isPrelim: p.round_type === 'prelim',
        opponent,
        isBye: !opponent,
        roundDate: roundDates[0] || null,
        roundDates,
        playerSlot: p.slot_index,
        draw,
      });
    });
    return result;
  }, [drawPairings, publishedDraws, myName, linkedMemberName]);

  const currentSeason = settings.seasonYear || new Date().getFullYear();
  const futureDrawEntries = myDrawEntries.filter(de => de.seasonYear >= currentSeason);

  // Bracket progression: derive current round / opponent from draw_results
  const DRAW_ROUND_LABELS = ["", "1st Round", "2nd Round", "3rd Round", "4th Round", "Semi-Final", "Final"];
  function getPlayerDrawStatus(drawId, mySlot, roundDates) {
    const myResults = drawResults
      .filter(r => r.draw_id === drawId && r.player_slot === mySlot)
      .sort((a, b) => a.round_num - b.round_num);
    let currentRound = 1;
    for (const r of myResults) {
      if (r.result === 'L') return { eliminated: true, lastRound: r.round_num, results: myResults };
      if (r.result === 'W' || r.result === 'BYE') currentRound = r.round_num + 1;
    }
    if (currentRound > 6) return { winner: true, results: myResults, roundLabel: "Winner!" };
    // Find opponent for current round
    let opponentName = null;
    if (currentRound === 1) {
      const pairSlot = mySlot % 2 === 1 ? mySlot + 1 : mySlot - 1;
      const pair = drawPairings.find(p => p.draw_id === drawId && p.slot_index === pairSlot && p.round_type === 'main');
      opponentName = pair?.player_name || null;
    } else {
      const groupSize = Math.pow(2, currentRound - 1);
      const myGroup = Math.ceil(mySlot / groupSize);
      const adjGroup = myGroup % 2 === 1 ? myGroup + 1 : myGroup - 1;
      const minSlot = (adjGroup - 1) * groupSize + 1;
      const maxSlot = adjGroup * groupSize;
      const eligibleSlots = drawPairings
        .filter(p => p.draw_id === drawId && p.round_type === 'main' && p.slot_index >= minSlot && p.slot_index <= maxSlot)
        .map(p => p.slot_index);
      for (const slot of eligibleSlots) {
        const slotResults = drawResults.filter(r => r.draw_id === drawId && r.player_slot === slot);
        const wins = slotResults.filter(r => r.result === 'W' || r.result === 'BYE').length;
        if (wins === currentRound - 1) {
          const pairing = drawPairings.find(p => p.draw_id === drawId && p.slot_index === slot && p.round_type === 'main');
          if (pairing?.player_name) { opponentName = pairing.player_name; break; }
        }
      }
      if (!opponentName) opponentName = "TBD";
    }
    const roundLabel = DRAW_ROUND_LABELS[currentRound] || `Round ${currentRound}`;
    const roundDate = Array.isArray(roundDates) ? roundDates[currentRound - 1] || null : null;
    return { currentRound, opponentName, roundLabel, roundDate, results: myResults, eliminated: false, winner: false };
  }

  // Roll of Honour tournament mapping
  // Which honours board a tournament's final belongs on. Every value must be
  // a real roll_of_honour.id — a target that does not exist fails as
  // `no_category` and reads, from the outside, exactly like nothing happening.
  // "presidents" pointed at "roh-president" for as long as anyone can
  // remember; that category held 0 entries and has now been deleted as the
  // stray it was, which is the only reason the dangling pointer surfaced.
  // test/rohMap.test.mjs checks every value against the ids production holds.
  const ROH_MAP = {
    "championship":                "roh-gents-singles",
    // TWO Presidents competitions, not one. The gents tournament is the bare
    // "presidents" (67 seasons) and the ladies one is "ladies-presidents"
    // (65) — separate boards. The ladies side had no entry here at all, so it
    // was silently doing nothing for the same reason the gents side was.
    "presidents":                  "roh-gents-presidents",
    "pairs":                       "roh-gents-pairs",
    "triples":                     "roh-gents-triples",
    "rinks":                       "roh-gents-rinks",
    "ladies-championship":         "roh-ladies-singles",
    "ladies-presidents":           "roh-ladies-presidents",
    "ladies-pairs":                "roh-ladies-pairs",
    "ladies-triples":              "roh-ladies-triples",
    "ladies-rinks":                "roh-ladies-rinks",
    // roh-mixed-pairs has existed all along with nothing pointing at it, so
    // the board could never be written to — the same silent nothing as the
    // ladies Presidents, just not found yet. Balloted Pairs is the other
    // mixed competition and has no board of its own; it is not mapped here,
    // because two tournaments writing one board would overwrite each other's
    // year.
    "mixed-pairs":                 "roh-mixed-pairs",
    // The four generic `seniors` tournaments are legacy and map to nothing on
    // purpose: the 2026 set below owns these boards. Retiring them is the
    // real action there, and it is Joseph's call, not a mapping change.
    "seniors-championship":        "roh-seniors-singles",
    "seniors-pairs":               "roh-seniors-pairs",
    "seniors-triples":             "roh-seniors-triples",
    "ladies-seniors-championship": "roh-ladies-seniors-singles",
    "ladies-seniors-pairs":        "roh-ladies-seniors-pairs",
  };

  async function recordDrawResult(de, resultRow) {
    const { draw_id: _, ...row } = { draw_id: de.drawId, ...resultRow };
    const full = { draw_id: de.drawId, ...resultRow };
    const { error } = await supabase.from("draw_results").upsert(full, { onConflict: "draw_id,round_num,player_slot" });
    if (error) { alert("Error saving result: " + error.message); return; }
    setDrawResults(prev => {
      const filtered = prev.filter(r => !(r.draw_id === full.draw_id && r.round_num === full.round_num && r.player_slot === full.player_slot));
      return [...filtered, full];
    });
    // If Final win, prompt for Roll of Honour
    if (full.round_num === 6 && full.result === 'W') {
      setRohPrompt({ tournamentId: de.tournamentId, tournamentName: de.tournamentName, playerName: full.player_name, seasonYear: de.seasonYear });
    }
  }

  const [activeDrawEntry, setActiveDrawEntry] = useState(null);
  const [rohPrompt, setRohPrompt]             = useState(null);
  const [rohPromptMsg, setRohPromptMsg]       = useState(null);

  // ── Sign-in flow ──
  const [pinConfirm, setPinConfirm]   = useState("");
  const [signInState, setSignInState] = useState("idle"); // "idle"|"checking"|"confirm-new"|"wrong-pin"|"offline"|"locked"
  const [lockoutInfo, setLockoutInfo] = useState(null); // { id, attempts, locked_until, unlock_requested }

  // ── Sign-in goes through the server ──────────────────────────────────────
  //
  // What used to happen here: the client SELECTed every row of player_data,
  // filtered them in JavaScript for one whose name matched, and compared the
  // last four characters of player_name against the PIN that had just been
  // typed. Signing in meant downloading all 92 members' names and PINs to the
  // device doing it, and the publishable key that made that request ships in
  // the bundle — so it was not only members who could make it.
  //
  // Now one RPC does the whole thing. bowls_sign_in matches on name_key and
  // a bcrypt comparison, counts failed attempts, applies the lockout, and
  // hands back a session token. The client learns whether it worked and
  // nothing else. findAccounts is gone, and with it the only reason this app
  // ever had to read the account table.
  //
  // ensureAccountRow is gone too. It wrote { player_name: "NAME-PIN" }
  // straight into player_data and let a trigger derive the hash from the
  // name — which is how every account came to have its PIN in a readable
  // column. Registration is bowls_register's job now.

  // One shape for "we are signed in as this account", used by sign-in,
  // registration and the token check on load, so the four pieces of state
  // cannot get out of step with each other.
  // `background: true` is the token refresh for a device that was already
  // signed in. It updates who the server says we are and touches nothing the
  // member can see: no rename, no link sheet, and none of the form resets —
  // those belong to an actual sign-in, and doing them on a load would close
  // a sheet the member had just opened.
  function applySession(payload, pin, { background = false } = {}) {
    // The name the account is STORED under, not the one that was typed.
    // myName is matched as a string — `t.myName === myName` for ties, and
    // against draw pairings, personal-comp owners and honours — so a member
    // who types "J.FREW" today when they typed "J FREW" last time has to end
    // up with the same value or their own data stops being theirs.
    // account_name is the server's answer to that, and it is byte-for-byte
    // what the old client stored for all 92 accounts. A background refresh
    // renames nobody: it runs on load, and a rename there is one the member
    // did not ask for and would hide their own ties from them.
    if (!background && payload.account_name) setMyName(payload.account_name);
    if (typeof pin === "string") setMyPin(pin);
    setSessionToken(payload.token || "");
    setStoredCloudKey(payload.cloud_key || "");
    setMyPlayerId(payload.id || "");
    setSignedOut(false);

    if (!background) {
      setNameInput(""); setPinInput(""); setPinConfirm("");
      setSignInState("idle"); setLockoutInfo(null);
      setSettingName(false);
    }

    // The member link comes back with the sign-in, so the separate members
    // lookup that used to run here is gone. It is resolved through
    // members.linked_player_id — the uuid — rather than linked_cloudkey,
    // which is the column holding 69 live PINs and is dropped in Phase D.
    if (payload.member_name) setLinkedMemberName(payload.member_name);
    if (payload.member_id)   setLinkedMemberId(payload.member_id);
    if (!background && !payload.member_name && !linkedMemberName) setShowLinkSheet(true);
  }

  // Forget the account on this device. Used when the server has told us the
  // session is gone — a PIN reset, an admin lock, a deleted account — and by
  // "switch account". Local entries and ties stay in localStorage; they come
  // back when they sign in again.
  function signOutLocally() {
    setSessionToken("");
    setStoredCloudKey("");
    setMyPlayerId("");
    setMyPin("");
    setMyName("");
    setLinkedMemberName("");
    setLinkedMemberId(null);
    // The explicit part. Without it the upgrade effect would see a device
    // with no token and sign it straight back in from what it could still
    // find.
    setSignedOut(true);
    setSettingName(true);
    setNameStep("name");
    setSignInState("idle");
  }

  // Signing out, both halves, in this order.
  //
  // The server is told FIRST, while the token is still in hand. The previous
  // version cleared local state and then tried to call bowls_sign_out — and
  // the call it made was `supabase.rpc(...).catch(...)`, which throws, because
  // rpc() returns a PostgrestFilterBuilder and a builder has no .catch. The
  // request was never dispatched, and the throw skipped the local sign-out
  // that came after it — so every tap minted a session, abandoned it, and
  // left the member signed in as themselves. See src/lib/session.js.
  //
  // If the server cannot be reached the member is still signed out here —
  // they asked to leave this device, and a bad signal is not a reason to
  // refuse — but the token is queued so the next load can revoke it, rather
  // than being forgotten while it is still valid for 90 days.
  async function endSession() {
    const token = sessionToken;
    const { ok } = await endServerSession(supabase, token);
    if (!ok) setPendingSignouts(p => queuePendingSignout(p, token));
    signOutLocally();
    return ok;
  }

  // ── Sign-outs that never reached the server ──────────────────────────────
  // A token queued here is live: 90 days, and bowls_session_player slides
  // that forward on every use, so an abandoned one outlives the member's
  // interest in it by a wide margin. Retry until the server confirms, and
  // only drop a token once it has.
  useEffect(() => {
    if (pendingSignouts.length === 0) return;
    let cancelled = false;
    (async () => {
      const left = await flushPendingSignouts(supabase, pendingSignouts);
      if (cancelled || left.length === pendingSignouts.length) return;
      setPendingSignouts(left);
    })();
    return () => { cancelled = true; };
  }, [pendingSignouts]);

  // ── Is this device still signed in? ──────────────────────────────────────
  // Ending a session is invisible until something asks. This is the asking.
  //
  // Three answers, and they are not the same thing:
  //   "ok"      — still signed in; refresh who we are from the server
  //   "expired" — this token is definitively dead. Sign out.
  //   anything else (an error, a null) — NOT an answer. Leave the member
  //   signed in and ask again next time. Treating a dropped connection as a
  //   dead session would sign the whole club out the next time the club
  //   wi-fi wobbled.
  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("bowls_session_state", { p_token: sessionToken });
      if (cancelled || error || !data) return;
      if (data.status === "expired") { signOutLocally(); return; }
      if (data.status !== "ok") return;
      // Deliberately does not touch myName: see applySession. This effect
      // runs on every load, and a rename here would be a rename nobody asked
      // for.
      if (data.cloud_key)    setStoredCloudKey(data.cloud_key);
      if (data.id)           setMyPlayerId(data.id);
      if (data.member_name)  setLinkedMemberName(data.member_name);
      if (data.member_id)    setLinkedMemberId(data.member_id);
    })();
    return () => { cancelled = true; };
  }, [sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Devices that were signed in before sessions existed ──────────────────
  // They have a name and a PIN in localStorage and no token. Trade them for
  // one, quietly, on the next load — so that by the time Step 4 revokes anon
  // access they are already on the new path rather than being signed out en
  // masse by it.
  //
  // At most one attempt per stale credential: if the PIN no longer works the
  // device is signed out here rather than retrying on every load and walking
  // the member into their own lockout. "locked" is left alone — it costs no
  // attempt and clears itself after 24 hours.
  useEffect(() => {
    if (sessionToken || signedOut || !myName || !myPin) return;
    let cancelled = false;
    (async () => {
      const outcome = signInOutcome(await supabase.rpc("bowls_sign_in", { p_name: myName, p_pin: myPin }));
      if (cancelled) return;
      if (outcome.action === "signed-in") { applySession(outcome.payload, myPin, { background: true }); return; }
      if (outcome.action === "wrong-pin" || outcome.action === "register") signOutLocally();
    })();
    return () => { cancelled = true; };
  }, [sessionToken, signedOut, myName, myPin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignIn() {
    if (!nameInput.trim() || pinInput.length !== 4) return;
    const nameUpper = nameInput.toUpperCase().trim();
    setSignInState("checking");

    const outcome = signInOutcome(await supabase.rpc("bowls_sign_in", { p_name: nameUpper, p_pin: pinInput }));

    if (outcome.action === "signed-in") { applySession(outcome.payload, pinInput); return; }
    if (outcome.action === "offline")   { setSignInState("offline"); return; }
    if (outcome.action === "locked")    { setLockoutInfo({ name: nameUpper, ...outcome.lockout }); setSignInState("locked"); return; }
    if (outcome.action === "wrong-pin") { setLockoutInfo({ name: nameUpper, ...outcome.lockout }); setSignInState("wrong-pin"); return; }
    if (outcome.action === "register") {
      // No account under this name yet. Being on the roster is not evidence
      // of having registered, so this costs no PIN attempt.
      setPinConfirm("");
      setSignInState("confirm-new");
      return;
    }
    // "invalid" — a name that squashes to nothing. The form has already
    // checked the PIN, so going back to idle leaves their input on screen.
    setSignInState("idle");
  }

  // Registration. The confirm-new step calls this once the member has typed
  // their PIN twice.
  //
  // bowls_register creates the row with a player_name that is not built from
  // the PIN, hashes the PIN itself, and signs them in. "existing" comes back
  // if they already had an account under this name and PIN — two people can
  // share a name, so that is a real case and not an error.
  async function registerAccount(nameOverride, pinOverride) {
    const name = (typeof nameOverride === "string" ? nameOverride : nameInput).toUpperCase().trim();
    const pin  = typeof pinOverride === "string" ? pinOverride : pinInput;
    if (!name || !/^\d{4}$/.test(pin)) return;

    setSignInState("checking");
    const outcome = registerOutcome(await supabase.rpc("bowls_register", { p_name: name, p_pin: pin }));
    if (outcome.action !== "signed-in") { setSignInState("offline"); return; }
    applySession(outcome.payload, pin);
  }

  // The locked-out screen's "ask an admin to let me back in" button.
  //
  // It used to UPDATE login_lockouts by row id, which the client only had
  // because it had just read the whole row. bowls_sign_in's locked status
  // carries no id — and after Step 4 there is no row to read — so this goes
  // through an RPC that takes only the name. Deliberately no PIN: they are
  // locked out precisely because they do not know it.
  async function requestUnlock() {
    const name = lockoutInfo?.name || nameInput.toUpperCase().trim();
    if (!name) return;
    await supabase.rpc("bowls_request_unlock", { p_name: name });
    // The server says nothing back on purpose — an endpoint that confirmed
    // whether a name exists would be a way to enumerate members without ever
    // spending a PIN attempt. So the screen reports what was asked for, not
    // what was found.
    setLockoutInfo(p => ({ ...(p || {}), name, unlock_requested: true }));
  }


  function closeLinkSheet() {
    setShowLinkSheet(false);
    setLinkStatus(null);
    setLinkSearch("");
  }

  // Filtered members for link search
  const linkResults = linkSearch.length >= 2
    ? members.filter(m => m.name.toUpperCase().includes(linkSearch.toUpperCase())).slice(0, 8)
    : [];

  async function claimMemberLink(member) {
    if (!cloudKey) return;
    setLinkStatus("linking");
    // Check if already claimed by another account
    const { data } = await supabase.from("members").select("linked_cloudkey, name").eq("id", member.id).maybeSingle();
    if (data?.linked_cloudkey && data.linked_cloudkey !== cloudKey) {
      setLinkStatus({ type: "claimed", member, currentHolder: data.linked_cloudkey });
      return;
    }
    // Unclaimed or already ours — claim it
    // Both columns. linked_player_id is what bowls_sign_in reads to give the
    // link back on the next sign-in, so writing only the cloud key would
    // leave a member being asked to link again every time. linked_cloudkey
    // is still written because the admin panel and the profile sheet read
    // it; both move to the uuid in Step 3e, and the column goes in Phase D.
    await supabase.from("members")
      .update({ linked_cloudkey: cloudKey, linked_player_id: myPlayerId || null })
      .eq("id", member.id);
    // Remove any previous link this account held on another member
    await supabase.from("members")
      .update({ linked_cloudkey: null, linked_player_id: null })
      .eq("linked_cloudkey", cloudKey).neq("id", member.id);
    setLinkedMemberName(member.name);
    // Same moment, same fact: linking is the point at which this account
    // acquires a roster id, and live_games needs it to record who set a game
    // up. Without this line a member who links and then immediately creates a
    // game would still have their sign-in credential written to the row.
    setLinkedMemberId(member.id);
    setLinkStatus("done");
    setTimeout(closeLinkSheet, 1200);
  }

  async function submitClaimRequest(member, currentHolder) {
    if (!cloudKey) return;
    await supabase.from("member_claim_requests").insert({
      requester_cloudkey: cloudKey,
      requester_display_name: myName,
      target_member_id: member.id,
      target_member_name: member.name,
      current_linked_cloudkey: currentHolder,
      status: "pending",
    });
    setLinkStatus({ type: "requested", member });
  }

  async function resolveClaimRequest(reqId, approve, req) {
    if (approve) {
      // Remove old link, apply new one
      await supabase.from("members").update({ linked_cloudkey: null }).eq("linked_cloudkey", req.current_linked_cloudkey);
      await supabase.from("members").update({ linked_cloudkey: req.requester_cloudkey }).eq("id", req.target_member_id);
    }
    await supabase.from("member_claim_requests").update({ status: approve ? "approved" : "rejected", resolved_at: new Date().toISOString() }).eq("id", reqId);
    setClaimRequests(prev => prev.filter(r => r.id !== reqId));
  }

  function unlinkMember() {
    if (!cloudKey || !linkedMemberName) return;
    supabase.from("members").update({ linked_cloudkey: null, linked_player_id: null }).eq("linked_cloudkey", cloudKey);
    setLinkedMemberName("");
    // Both halves of the link go together. Leaving the id behind would let an
    // unlinked account keep scoring games it "created" under a roster entry it
    // no longer holds.
    setLinkedMemberId(null);
  }
  // A member who has a name from before PINs existed, setting one for the
  // first time. Same path as registration: bowls_register creates the row if
  // there isn't one and returns the existing account if there is, and either
  // way it signs them in properly with a token. It used to write
  // "NAME-PIN" straight into player_data, which is the whole bug.
  function saveExistingPin() {
    if (!/^\d{4}$/.test(pinInput)) return;
    registerAccount(myName, pinInput);
  }

  // ── Tournament entry handlers ──
  function createEntry() {
    if (!myName) return;
    // If ad-hoc comp name entered, create a personal comp on the fly first
    let resolvedTournId = entryTournId;
    if (entryTournId === "__adhoc__" && adhocCompName.trim()) {
      const newId = `personal-${Date.now()}`;
      const newComp = { id: newId, owner: myName, section: effectiveSection, name: adhocCompName.trim(), type: "Singles", color: "#2d6a4f", rounds: [], custom: true, source: "personal" };
      setPersonalComps(prev => [...prev, newComp]);
      resolvedTournId = newId;
    }
    if (!resolvedTournId) return;
    const t = TOURNAMENTS.find(t2 => t2.id === resolvedTournId) || (entryTournId === "__adhoc__" && adhocCompName.trim() ? { id: resolvedTournId, name: adhocCompName.trim(), color: "#2d6a4f", rounds: [] } : null);
    if (!t) return;
    const rounds = t?.rounds?.length > 0 ? t.rounds.length : Math.max(1, entryRounds);
    const firstTie = entryRound1Bye
      ? { roundIdx: 0, roundLabel: getRoundLabel(0, rounds), opponent: "", oppPhone: "", date: "", time: "", myScore: null, oppScore: null, result: "BYE" }
      : entryOppPicked
      ? { roundIdx: 0, roundLabel: getRoundLabel(0, rounds), opponent: entryOppPicked.name, oppPhone: entryOppPicked.phone || "", date: entryDate, time: entryTime, myScore: null, oppScore: null, result: null }
      : null;
    const tournName = t?.name || resolvedTournId;
    setEntries(prev => [...prev, {
      id: `entry-${Date.now()}`,
      myName,
      section: effectiveSection,
      year: settings.seasonYear || new Date().getFullYear(),
      tournamentId: resolvedTournId,
      tournamentName: tournName,
      tournamentColor: t?.color || GOLD,
      totalRounds: rounds,
      status: "active",
      myPartners: [...entryMyPartners],
      ties: firstTie ? [firstTie] : [],
    }]);
    if (entryMyPartners.length > 0 && resolvedTournId !== "balloted-pairs") {
      const updated = { ...teamPartners, [resolvedTournId]: entryMyPartners };
      setTeamPartners(updated);
      save("ipbc_team_partners_v1", updated);
    }
    setEntryTournId(""); setEntryRounds(4);
    setEntryOppSearch(""); setEntryOppPicked(null); setEntryRound1Bye(false);
    setEntryDate(""); setEntryTime("");
    setEntryMyPartners([]); setEntryPartnerSearch("");
    setAdhocCompName("");
    setLastAddedTournName(tournName);
    setEntryJustSaved(true);
  }

  function recomputeStatus(e, updatedTies) {
    const last = [...updatedTies].reverse().find(t => t.result !== null);
    if (!last) return "active";
    if (last.result === "L") return "eliminated";
    if ((last.result === "W" || last.result === "BYE") && last.roundIdx === e.totalRounds - 1) return "champion";
    return "active";
  }

  function maybeAddHonour(entry, newStatus) {
    if (newStatus !== "champion") return;
    const comp = entry.tournamentName || entry.tournamentId || "";
    const yr   = settings.seasonYear || new Date().getFullYear();
    setHonours(prev => {
      const dup = prev.some(h =>
        h.player === myName &&
        h.competition === comp &&
        String(h.year) === String(yr) &&
        h.position === "Winner"
      );
      if (dup) return prev;
      return [...prev, { id: Date.now().toString(), player: myName, competition: comp, position: "Winner", year: yr, notes: "" }];
    });
  }

  function submitEntryScore(entryId, roundIdx) {
    const me = parseInt(scoreMy, 10);
    const opp = parseInt(scoreOppV, 10);
    if (isNaN(me) || isNaN(opp)) return;
    const result = me > opp ? "W" : me < opp ? "L" : null;
    let champion = null;
    setEntries(prev => prev.map(e => {
      if (e.id !== entryId) return e;
      const newTies = e.ties.map(t =>
        t.roundIdx === roundIdx ? { ...t, myScore: me, oppScore: opp, result } : t
      );
      const newStatus = recomputeStatus(e, newTies);
      if (newStatus === "champion") champion = { entry: e, newStatus };
      return { ...e, ties: newTies, status: newStatus };
    }));
    if (champion) maybeAddHonour(champion.entry, champion.newStatus);
    setScoringInfo(null); setScoreMy(""); setScoreOppV("");
  }

  function markBye(entryId, roundIdx) {
    let champion = null;
    setEntries(prev => prev.map(e => {
      if (e.id !== entryId) return e;
      const newTies = e.ties.map(t =>
        t.roundIdx === roundIdx ? { ...t, myScore: null, oppScore: null, result: "BYE" } : t
      );
      const newStatus = recomputeStatus(e, newTies);
      if (newStatus === "champion") champion = { entry: e, newStatus };
      return { ...e, ties: newTies, status: newStatus };
    }));
    if (champion) maybeAddHonour(champion.entry, champion.newStatus);
  }

  function doAddNextRound(entryId) {
    const opp = nextOppPicked;
    if (!opp) return;
    setEntries(prev => prev.map(e => {
      if (e.id !== entryId) return e;
      const nextIdx = e.ties.length;
      return {
        ...e,
        ties: [...e.ties, {
          roundIdx: nextIdx,
          roundLabel: getRoundLabel(nextIdx, e.totalRounds),
          opponent: opp.name,
          oppPhone: opp.phone || "",
          date: nextDate,
          time: nextTime,
          myScore: null, oppScore: null, result: null,
          oppPartners: [...nextOppPartners],
        }],
      };
    }));
    setNextRoundFor(null);
    setNextOppSearch(""); setNextOppPicked(null);
    setNextDate(""); setNextTime("");
    setNextOppPartners([]); setNextOppPartnerSearch("");
  }


  function saveTieDate(entryId, roundIdx) {
    setEntries(prev => prev.map(e => {
      if (e.id !== entryId) return e;
      return { ...e, ties: e.ties.map(t => t.roundIdx === roundIdx ? { ...t, date: editDateVal, time: editTimeVal } : t) };
    }));
    setEditingTieDate(null); setEditDateVal(""); setEditTimeVal("");
  }

  function saveTieDateDirect(entryId, roundIdx, date, time) {
    setEntries(prev => prev.map(e => {
      if (e.id !== entryId) return e;
      return { ...e, ties: e.ties.map(t => t.roundIdx === roundIdx ? { ...t, date, time } : t) };
    }));
  }

  async function exportBackup() {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toTimeString().slice(0, 5).replace(":", "");
    const fileName = `ipbc-bowls-${dateStr}-${timeStr}.json`;
    const data = JSON.stringify({ entries, myName, exportedAt: now.toISOString() }, null, 2);
    const blob = new Blob([data], { type: "application/octet-stream" });
    const file = new File([blob], fileName, { type: "application/octet-stream" });

    // Try native share sheet — lets user pick Google Drive, iCloud, WhatsApp etc.
    if (navigator.share) {
      try {
        await navigator.share({ title: "IPBC Bowls Backup", text: "My IPBC Bowls tournament data", files: [file] });
        setBackupMsg("Shared successfully");
        setTimeout(() => setBackupMsg(null), 3000);
        return;
      } catch (e) {
        if (e.name === "AbortError") return; // user cancelled — do nothing
        // fall through to direct download if share not supported
      }
    }

    // Fallback: direct download (desktop browsers)
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
    setBackupMsg("File downloaded");
    setTimeout(() => setBackupMsg(null), 3000);
  }

  function handleBackupImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!Array.isArray(parsed.entries)) throw new Error("Invalid format");
        const restored = parsed.entries.map(e => ({ ...e, section: e.section || "gents" }));
        setEntries(restored);
        save(ENTRIES_KEY, restored);
        if (parsed.myName) { setMyName(parsed.myName); save(NAME_KEY, parsed.myName); }
        setBackupMsg(`Restored ${parsed.entries.length} tournament entries`);
      } catch {
        setBackupMsg("⚠️ Could not read backup file — was it exported from this app?");
      }
      setTimeout(() => setBackupMsg(null), 4000);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function startEdit(m) { setEditingId(m.id); setEditName(m.name); setEditPhone(m.phone); setEditSection(m.section || "gents"); setEditPosition(m.position || ""); }
  function saveEdit() {
    const updated = { name: editName.toUpperCase(), phone: editPhone, section: editSection, position: editPosition, updated_at: new Date().toISOString() };
    const prevMembers = members;
    setMembers(prev => prev.map(m => m.id === editingId ? { ...m, ...updated } : m));
    setEditingId(null);
    supabase.from("members").update(updated).eq("id", editingId).then(({ error }) => {
      if (error) setMembers(prevMembers);
    });
  }
  async function requestPhoneChange(memberId, memberName, currentPhone, requestedPhone) {
    await supabase.from("phone_change_requests").insert({ member_id: memberId, member_name: memberName, current_phone: currentPhone, requested_phone: requestedPhone });
  }

  const [phoneRequests, setPhoneRequests] = useState([]);
  const [joinRequests, setJoinRequests]   = useState([]);
  const [lockouts, setLockouts]           = useState([]);
  const [adminListState, setAdminListState]             = useState([]);
  const [pendingAdminRequests, setPendingAdminRequests] = useState([]);
  const [registeredUsers, setRegisteredUsers] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from("phone_change_requests").select("*").order("requested_at")
      .then(({ data }) => { if (data) setPhoneRequests(data); });
    supabase.from("login_lockouts").select("*").order("updated_at", { ascending: false })
      .then(({ data }) => { if (data) setLockouts(data); });
    supabase.from("player_data").select("player_name, updated_at").order("updated_at", { ascending: false })
      .then(({ data }) => { if (data) setRegisteredUsers(data); });
    supabase.from("member_join_requests").select("*").eq("status", "pending").order("requested_at")
      .then(({ data }) => { if (data) setJoinRequests(data); });
    supabase.from("member_claim_requests").select("*").eq("status", "pending").order("requested_at")
      .then(({ data }) => { if (data) setClaimRequests(data); });
    if (isSuperAdmin) {
      supabase.from("admins").select("*").then(({ data }) => { if (data) setAdminListState(data); });
      supabase.from("admin_requests").select("*").order("requested_at")
        .then(({ data }) => { if (data) setPendingAdminRequests(data); });
    }
  }, [isAdmin, isSuperAdmin]);

  async function clearLockout(id) {
    setLockouts(l => l.filter(x => x.id !== id));
    await supabase.from("login_lockouts").delete().eq("id", id);
  }

  async function lockAppAccount(name) {
    const lockedUntil = "2099-01-01T00:00:00.000Z";
    const row = { name, attempts: 0, locked_until: lockedUntil, updated_at: new Date().toISOString() };
    await supabase.from("login_lockouts").upsert(row, { onConflict: "name" });
    setLockouts(l => { const idx = l.findIndex(x => x.name === name); if (idx >= 0) { const c = [...l]; c[idx] = { ...c[idx], ...row }; return c; } return [{ ...row }, ...l]; });
  }

  async function unlockAppAccount(name) {
    await supabase.from("login_lockouts").delete().eq("name", name);
    setLockouts(l => l.filter(x => x.name !== name));
  }

  async function deleteAppAccount(playerName) {
    await supabase.from("player_data").delete().eq("player_name", playerName);
    setRegisteredUsers(u => u.filter(x => x.player_name !== playerName));
    // Also clear any lockout
    const namePart = playerName.split("-").slice(0, -1).join("-");
    if (namePart) { await supabase.from("login_lockouts").delete().eq("name", namePart); setLockouts(l => l.filter(x => x.name !== namePart)); }
  }

  // Reset a member's PIN. The client never builds the new key or the hash —
  // bowls_admin_reset_pin owns both, and re-checks that the caller really is an
  // admin using the PIN they type in, not the isAdmin flag sitting in this
  // component. Returns the RPC's status object for the UI to report.
  async function resetMemberPin(memberId, newPin, adminPin) {
    const { data, error } = await supabase.rpc("bowls_admin_reset_pin", {
      p_admin_name: myName,
      p_admin_pin:  adminPin,
      p_member_id:  String(memberId),
      p_new_pin:    newPin,
    });
    if (error) return { status: "error", message: error.message };
    if (data?.status !== "ok") return data || { status: "error", message: "No response from the server." };

    // A reset ends every session for that account — that is the point of it,
    // and it is what makes the reset actually lock out whoever knew the old
    // PIN rather than merely changing what they would have to type. If the
    // admin has just reset their OWN PIN, one of the sessions it ended was
    // this one, so this device signs out and they come back with the new PIN.
    // The server works out whose account it was; comparing names here could
    // not tell two members with the same initials apart.
    if (data.is_self) signOutLocally();

    // The account list is re-read because updated_at has moved.
    supabase.from("player_data").select("player_name, updated_at").order("updated_at", { ascending: false })
      .then(({ data: rows }) => { if (rows) setRegisteredUsers(rows); });
    setLockouts(l => l.filter(x => x.name?.toUpperCase() !== data.account_name?.toUpperCase()));
    // No members patch any more: the reset changes pin_hash and nothing else,
    // so linked_cloudkey still points at the same account it did before.
    return data;
  }

  // Granting used to write { cloud_key: "PENDING-<name>", player_id: null }
  // straight into admins and hope. Nothing ever filled player_id in, and
  // bowls_is_admin finds the row BY player_id — so the grant was inert and
  // said nothing to anybody. Both of these now go through a SECURITY DEFINER
  // function that resolves the member to a real account through the roster
  // link, checks the caller is a super admin on the server, and reports back
  // in words. No optimistic local update: the list is re-read from what the
  // server actually did, because "it looked like it worked" is the bug.
  const [accessMsg, setAccessMsg] = useState(null);

  async function refreshAdminList() {
    const { data } = await supabase.from("admins").select("*");
    if (data) setAdminListState(data);
  }

  async function grantAdmin(member, role = "admin") {
    setAccessMsg(null);
    const { data, error } = await supabase.rpc("bowls_grant_admin", {
      p_admin_name: (myName || "").toUpperCase(),
      p_admin_pin:  myPin || "",
      p_member_id:  String(member.id),
      p_role:       role,
    });
    if (error || !data) {
      setAccessMsg({ ok: false, text: error?.message ? `Couldn't grant: ${error.message}` : "Couldn't grant — no response from the server." });
      return;
    }
    setAccessMsg({ ok: data.status === "granted", text: data.message });
    if (data.status === "granted") await refreshAdminList();
  }

  // Keyed on the account id, not the cloud key. cloud_key is NAME-PIN, and
  // sending it meant lifting another admin's sign-in credential out of the
  // world-readable admins table and putting it in a request payload.
  async function revokeAdmin(playerId) {
    setAccessMsg(null);
    if (!playerId) {
      setAccessMsg({ ok: false, text: "That row was never linked to an app account, so there's nothing to revoke. Grant that member again to replace it." });
      return;
    }
    const { data, error } = await supabase.rpc("bowls_revoke_admin", {
      p_admin_name: (myName || "").toUpperCase(),
      p_admin_pin:  myPin || "",
      p_player_id:  playerId,
    });
    if (error || !data) {
      setAccessMsg({ ok: false, text: error?.message ? `Couldn't revoke: ${error.message}` : "Couldn't revoke — no response from the server." });
      return;
    }
    setAccessMsg({ ok: data.status === "revoked", text: data.message });
    await refreshAdminList();
  }

  // Approving had the same defect granting did — an 'APPROVED-<name>' row
  // with no player_id, which granted nothing and said nothing. Same treatment:
  // the server resolves the account, checks the caller, and reports in words.
  // No optimistic removal from the queue either; a refused request has to stay
  // in it, because a refusal is something the super admin needs to act on.
  async function approveAdminRequest(req) {
    setAccessMsg(null);
    const { data, error } = await supabase.rpc("bowls_approve_admin_request", {
      p_admin_name: (myName || "").toUpperCase(),
      p_admin_pin:  myPin || "",
      p_request_id: String(req.id),
    });
    if (error || !data) {
      setAccessMsg({ ok: false, text: error?.message ? `Couldn't approve: ${error.message}` : "Couldn't approve — no response from the server." });
      return;
    }
    setAccessMsg({ ok: data.status === "granted", text: data.message });
    const { data: queue } = await supabase.from("admin_requests").select("*").order("requested_at");
    if (queue) setPendingAdminRequests(queue);
    if (data.status === "granted") await refreshAdminList();
  }

  async function approveJoinRequest(req) {
    setJoinRequests(j => j.filter(r => r.id !== req.id));
    await supabase.from("members").insert({ name: req.name, phone: req.phone || null, section: req.section, sort_order: 9999 });
    await supabase.from("member_join_requests").update({ status: "approved" }).eq("id", req.id);
    // Re-read through the same hook that owns the roster, so a failure here is
    // reported the same way as a failure on first load rather than silently
    // leaving a stale list on screen.
    membersLoad.reload();
  }

  async function declineJoinRequest(reqId) {
    setJoinRequests(j => j.filter(r => r.id !== reqId));
    await supabase.from("member_join_requests").update({ status: "declined" }).eq("id", reqId);
  }

  async function approvePhoneRequest(req) {
    const prev = members;
    setMembers(m => m.map(x => x.id === req.member_id ? { ...x, phone: req.requested_phone } : x));
    setPhoneRequests(p => p.filter(r => r.id !== req.id));
    await supabase.from("members").update({ phone: req.requested_phone, updated_at: new Date().toISOString() }).eq("id", req.member_id);
    await supabase.from("phone_change_requests").delete().eq("id", req.id);
  }

  async function declinePhoneRequest(reqId) {
    setPhoneRequests(p => p.filter(r => r.id !== reqId));
    await supabase.from("phone_change_requests").delete().eq("id", reqId);
  }
  function deleteMember(id) {
    const prevMembers = members;
    setMembers(prev => prev.filter(m => m.id !== id));
    setConfirmDelete(null);
    supabase.from("members").delete().eq("id", id).then(({ error }) => {
      if (error) setMembers(prevMembers); // revert on error
    });
  }
  function addMember() {
    if (!newName.trim()) return;
    const newId = Date.now().toString();
    const newMember = { id: newId, name: newName.toUpperCase(), phone: newPhone, section: newSection, sort_order: 999 };
    setMembers(prev => [...prev, newMember]);
    setNewName(""); setNewPhone("");
    supabase.from("members").insert(newMember).then(({ error }) => {
      if (error) setMembers(prev => prev.filter(m => m.id !== newId)); // revert on error
    });
  }

  // ── CSV download ──
  function downloadCSV() {
    const csv = membersToCSV(members);
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "bowls-members.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // ── CSV upload ──
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseCSV(ev.target.result);
      if (!parsed) { setUploadMsg("Error: Could not read file — check it has Name, Phone, Section columns."); return; }
      setMembers(parsed);
      // Deliberately still local-only — this has never written to Supabase, and
      // wiring it up belongs with the onboarding work, not here. What changes
      // is that it no longer says otherwise: with the roster now starting
      // empty, an admin importing into a new club would previously watch the
      // members appear and then lose them on the next refresh with no warning.
      setUploadMsg(`Previewing ${parsed.length} members from file — NOT saved. Importing to the club's records isn't built yet.`);
      setTimeout(() => setUploadMsg(null), 8000);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function BowlsBallIcon({ size = 22, strokeWidth = 1.5, color = "currentColor" }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <circle cx="9" cy="9" r="2" fill={color} stroke="none" />
      </svg>
    );
  }

  const TABS = [
    { id: "myties",      label: "My Ties",   Icon: BowlsBallIcon },
    { id: "live",        label: "Live",      Icon: Radio      },
    { id: "search",      label: "Find",      Icon: Binoculars },
    // Honours moved into the Club tab, which is already the "about the club"
    // page. The bar is for what people check weekly: the band plays every
    // Saturday, while a roll of honour is read once and then now and again.
    { id: "whatson",     label: "What's On", Icon: PartyPopper },
    { id: "fixtures",    label: "Fixtures",  Icon: Calendar   },
    ...(signedIn ? [{ id: "members", label: "Members", Icon: Users }] : []),
    { id: "club",        label: "Club",      Icon: Shield     },
  ];

  const selectedT = activeTournament ? TOURNAMENTS.find(t => t.id === activeTournament) : null;

  // BottomSheet is imported from ./components/BottomSheet.jsx

  // ── Section toggle ──
  function SectionToggle({ style = {} }) {
    const isSenior = activeSection.includes("senior");
    const baseSection = memberBaseSection; // "gents" | "ladies"
    function toggleBase(s) {
      setActiveSection(isSenior ? `${s}-senior` : s);
    }
    function toggleSenior() {
      if (isSenior) setActiveSection(baseSection);
      else setActiveSection(`${baseSection}-senior`);
    }
    return (
      <div style={{ display: "inline-flex", flexDirection: "column", gap: "4px", ...style }}>
        <div style={{ display: "inline-flex", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "6px", padding: "2px" }}>
          {[["gents","Gents"],["ladies","Ladies"]].map(([s, label]) => (
            <button key={s} onClick={() => toggleBase(s)} style={{
              background: baseSection === s ? MID : "transparent",
              border: "none", borderRadius: "4px",
              color: baseSection === s ? "#ffffff" : TEXT2,
              padding: "5px 14px", fontSize: "11px", cursor: "pointer",
              fontFamily: F_UI, fontWeight: baseSection === s ? "600" : "400",
              letterSpacing: "0.08em", textTransform: "uppercase",
              transition: "all 0.15s",
            }}>{label}</button>
          ))}
        </div>
        <button onClick={toggleSenior} style={{
          background: isSenior ? `${GOLD}22` : "transparent",
          border: `1px solid ${isSenior ? GOLD : BORDER}`,
          borderRadius: "5px", padding: "3px 10px",
          fontSize: "10px", cursor: "pointer", fontFamily: F_UI,
          fontWeight: isSenior ? "700" : "400",
          color: isSenior ? GOLD : TEXT3,
          letterSpacing: "0.1em", textTransform: "uppercase",
          transition: "all 0.15s", alignSelf: "stretch", textAlign: "center",
        }}>Seniors</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: F_UI, color: TEXT, zoom: fontScale }}>

      {/* ── iOS INSTALL BANNER ── */}
      {showIosBanner && (
        <div style={{ position: "fixed", bottom: "70px", left: "12px", right: "12px", zIndex: 200, background: GREEN, borderRadius: "14px", padding: "14px 16px", boxShadow: "0 4px 20px rgba(74,14,31,0.3)", display: "flex", alignItems: "flex-start", gap: "12px", animation: "slideUp 0.22s cubic-bezier(0.32,0.72,0,1)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: F_SANS, fontSize: "15px", fontWeight: "700", color: "#fff", marginBottom: "3px" }}>Install this app</div>
            <div style={{ fontFamily: F_UI, fontSize: "12px", color: "rgba(255,255,255,0.82)", lineHeight: 1.5 }}>
              Tap <strong style={{ color: GOLD }}>Share</strong> then <strong style={{ color: GOLD }}>Add to Home Screen</strong> to install IPBC Bowls on your iPhone.
            </div>
          </div>
          <button onClick={dismissIosBanner} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "8px", color: "#fff", padding: "6px 8px", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* ── ANDROID INSTALL BANNER ── */}
      {installPrompt && (
        <div style={{ position: "fixed", bottom: "70px", left: "12px", right: "12px", zIndex: 200, background: GREEN, borderRadius: "14px", padding: "14px 16px", boxShadow: "0 4px 20px rgba(74,14,31,0.3)", display: "flex", alignItems: "center", gap: "12px", animation: "slideUp 0.22s cubic-bezier(0.32,0.72,0,1)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: F_SANS, fontSize: "15px", fontWeight: "700", color: "#fff", marginBottom: "2px" }}>Install this app</div>
            <div style={{ fontFamily: F_UI, fontSize: "12px", color: "rgba(255,255,255,0.82)" }}>Add IPBC Bowls to your home screen</div>
          </div>
          <button onClick={triggerInstall} style={{ background: GOLD, border: "none", borderRadius: "8px", color: "#4a0e1f", padding: "9px 16px", fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: F_UI, whiteSpace: "nowrap", flexShrink: 0 }}>
            Install
          </button>
          <button onClick={() => setInstallPrompt(null)} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "8px", color: "#fff", padding: "9px", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center" }}>
            <X size={15} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* ── SW UPDATE BANNER ── */}
      {swWaiting && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 300, background: MID, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", boxShadow: "0 2px 8px rgba(74,14,31,0.2)", animation: "slideInFromTop 0.22s ease" }}>
          <div style={{ fontFamily: F_UI, fontSize: "13px", color: "#fff" }}>Update available</div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button onClick={applySwUpdate} style={{ background: GOLD, border: "none", borderRadius: "6px", color: "#4a0e1f", padding: "7px 14px", fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: F_UI, whiteSpace: "nowrap" }}>
              Tap to refresh
            </button>
            <button onClick={() => setSwWaiting(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: "4px" }}>
              <X size={15} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      {/* ── WELCOME OVERLAY ── */}
      {showWelcome && (() => {
        const steps = [
          {
            icon: "🎯",
            title: "Track your ties",
            body: "Add your competitions and record each round as you play. Your whole tournament journey in one place.",
          },
          {
            icon: "📋",
            title: "Find members",
            body: "Look up any club member's name and phone number instantly. Tap a number to call them directly.",
          },
          {
            icon: "📅",
            title: "Check the draw",
            body: "See this season's fixtures and check your round deadlines so you never miss a tie.",
          },
        ];
        const step = steps[welcomeStep];
        const isLast = welcomeStep === steps.length - 1;
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
            <div style={{ background: SURFACE, borderRadius: "20px", width: "100%", maxWidth: "360px", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
              {/* Progress dots */}
              <div style={{ display: "flex", justifyContent: "center", gap: "6px", paddingTop: "20px" }}>
                {steps.map((_, i) => (
                  <div key={i} style={{ width: i === welcomeStep ? "20px" : "7px", height: "7px", borderRadius: "4px", background: i === welcomeStep ? GREEN : BORDER, transition: "all 0.25s" }} />
                ))}
              </div>
              {/* Content */}
              <div style={{ padding: "24px 28px 20px", textAlign: "center" }}>
                <div style={{ fontSize: "52px", lineHeight: 1, marginBottom: "16px" }}>{step.icon}</div>
                <div style={{ fontFamily: F_SANS, fontSize: "26px", fontWeight: "700", color: GREEN, marginBottom: "10px" }}>{step.title}</div>
                <div style={{ fontFamily: F_UI, fontSize: "15px", color: TEXT2, lineHeight: 1.6 }}>{step.body}</div>
              </div>
              {/* Buttons */}
              <div style={{ padding: "0 24px 28px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <button
                  onClick={() => isLast ? dismissWelcome() : setWelcomeStep(s => s + 1)}
                  style={{ width: "100%", background: GREEN, border: "none", borderRadius: "12px", color: "#fff", padding: "15px", fontSize: "16px", fontWeight: "700", cursor: "pointer", fontFamily: F_UI, letterSpacing: "0.02em" }}>
                  {isLast ? "Get Started" : "Next"}
                </button>
                <button onClick={dismissWelcome} style={{ background: "none", border: "none", color: TEXT3, fontSize: "13px", cursor: "pointer", fontFamily: F_UI, padding: "4px" }}>
                  Skip intro
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── UPDATE BANNER ── */}
      {needRefresh && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999, background: GREEN, color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", fontFamily: F_UI, fontSize: "14px", gap: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}>
          <span>A new version is available</span>
          <button onClick={() => updateServiceWorker(true)}
            style={{ background: "#fff", color: GREEN, border: "none", borderRadius: "8px", padding: "6px 14px", fontFamily: F_UI, fontSize: "13px", fontWeight: "700", cursor: "pointer", flexShrink: 0 }}>
            Update now
          </button>
        </div>
      )}

      {/* The floating help button used to live here: a second HelpCircle, in a
          burgundy circle above the tab bar, opening the same Help tab as the "?"
          in the top row. Two identical icons on one screen, and this one sat on
          top of the content and the last tab. The top row keeps the one. */}

      {/* ── HEADER ── */}
      <div style={{ background: SURFACE, borderBottom: `3px solid ${GREEN}`, boxShadow: "0 1px 4px rgba(74,14,31,0.08)" }}>
        <div style={{ padding: "0 16px", maxWidth: "680px", margin: "0 auto" }}>

          {/* Main header row */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingTop: "12px", paddingBottom: "12px" }}>

            {/* Club crest */}
            <div style={{ width: "62px", height: "62px", borderRadius: "50%", border: `1.5px solid ${GOLD}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 8px rgba(74,14,31,0.12)", overflow: "hidden" }}>
              <img
                src="/ipbc-badge.png"
                alt="Irvine Park Bowling Club"
                style={{ height: "46px", width: "46px", objectFit: "contain" }}
                onError={e => {
                  e.target.style.display = "none";
                  e.target.parentNode.querySelector(".crest-fallback").style.display = "flex";
                }}
              />
              <span className="crest-fallback" style={{ display: "none", fontFamily: F_SANS, fontSize: "16px", fontWeight: "700", color: GOLD, letterSpacing: "1px" }}>IP</span>
            </div>

            {/* Title — centred between crest and pill */}
            <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
              <div style={{ fontFamily: F_DISPLAY, fontSize: "18px", fontWeight: "700", color: GREEN, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1.1 }}>
                Irvine Park Bowling Club
              </div>
              <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "500", color: GOLD_MUTED, letterSpacing: "0.15em", textTransform: "uppercase", marginTop: "3px" }}>
                {activeSection === "gents" ? "Gents Section" : activeSection === "ladies" ? "Ladies Section" : activeSection === "gents-senior" ? "Gents Seniors" : "Ladies Seniors"} · {settings.seasonYear || new Date().getFullYear()}
              </div>
            </div>

            {/* Logged-in user pill */}
            {myName ? (
              <button onClick={() => setShowProfileSheet(true)}
                style={{ background: "transparent", border: `1px solid ${GREEN}44`, borderRadius: "20px", color: GREEN, padding: "4px 10px 4px 4px", fontSize: "11px", cursor: "pointer", fontFamily: F_SANS, fontWeight: "600", flexShrink: 0, letterSpacing: "0.02em", display: "flex", alignItems: "center", gap: "7px" }}>
                <AvatarBubble displayName={profile.displayName || myName} avatar={profile.avatar} size={26} />
                <span>{profile.displayName ? profile.displayName.split(" ")[0] : myName}</span>
              </button>
            ) : (
              <div style={{ width: "44px" }} />
            )}
          </div>

          {/* Section toggle + settings/help row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "10px" }}>
            <SectionToggle />
            <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              {/* Cloud sync indicator */}
              {myName && (
                <div title={syncStatus === "synced" ? "Data saved to cloud" : syncStatus === "syncing" ? "Syncing…" : syncStatus === "error" ? "Sync failed — data saved locally" : ""}
                  style={{ width: "8px", height: "8px", borderRadius: "50%", marginRight: "4px", flexShrink: 0,
                    background: syncStatus === "synced" ? "#2d6a4f" : syncStatus === "syncing" ? GOLD : syncStatus === "error" ? LOSS_RED : BORDER,
                    transition: "background 0.4s",
                    animation: syncStatus === "syncing" ? "pulse 1s ease-in-out infinite" : "none",
                  }} />
              )}
              <button onClick={shareApp} title="Share app"
                style={{ background: "none", border: "none", cursor: "pointer", padding: "7px 6px", color: TEXT3, borderRadius: "8px", display: "flex", alignItems: "center" }}>
                <Share2 size={20} strokeWidth={1.5} />
              </button>
              <button onClick={() => navigateTo("help")} title="Help"
                style={{ background: activeTab === "help" ? `${GREEN}12` : "none", border: "none", cursor: "pointer", padding: "7px 6px", color: activeTab === "help" ? GREEN : TEXT3, borderRadius: "8px", display: "flex", alignItems: "center" }}>
                <HelpCircle size={20} strokeWidth={activeTab === "help" ? 2 : 1.5} />
              </button>
              {/* Admin sits up here with Help and Settings rather than in the tab
                  bar. Eight tabs did not fit: on anything narrower than about
                  383px — an iPhone SE or 8 at 375, a great many Androids at 360
                  — the last tab was laid out past the right edge of the screen
                  and could not be reached at all. It is also the right home for
                  it: the bar below is the club, this row is the app. */}
              {hasAdminPanel && (
                <button onClick={() => navigateTo("admin")} title="Admin"
                  style={{ background: activeTab === "admin" ? `${GREEN}12` : "none", border: "none", cursor: "pointer", padding: "7px 6px", color: activeTab === "admin" ? GREEN : TEXT3, borderRadius: "8px", display: "flex", alignItems: "center" }}>
                  <Lock size={20} strokeWidth={activeTab === "admin" ? 2 : 1.5} />
                </button>
              )}
              <button onClick={() => navigateTo("settings")} title="Settings"
                style={{ background: activeTab === "settings" ? `${GREEN}12` : "none", border: "none", cursor: "pointer", padding: "7px 6px", color: activeTab === "settings" ? GREEN : TEXT3, borderRadius: "8px", display: "flex", alignItems: "center" }}>
                <Settings size={20} strokeWidth={activeTab === "settings" ? 2 : 1.5} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── SCROLLABLE CONTENT ── */}
      <div key={activeTab} style={{ padding: "20px 16px 100px", maxWidth: "680px", margin: "0 auto", animation: "tabFadeIn 0.18s ease" }}>

        {/* ══════════════════════════════════════════
            MY TIES TAB
        ══════════════════════════════════════════ */}
        {activeTab === "myties" && (
          <div>
            {(!myName || settingName) ? (
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "32px 24px", boxShadow: "0 2px 12px rgba(74,14,31,0.08)", textAlign: "center" }}>
                <div style={{ fontFamily: F_SANS, fontSize: "28px", fontWeight: "600", color: GREEN, marginBottom: "4px" }}>
                  {settingName ? "Update Sign-in" : "Welcome"}
                </div>
                <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, marginBottom: "24px", lineHeight: 1.5 }}>
                  {settingName ? "Enter your name and PIN to switch account." : "Enter your name and 4-digit PIN. If you've signed in before, use the same details to restore your data."}
                </div>

                {signInState === "locked" ? (
                  <>
                    <div style={{ background: `${LOSS_RED}0d`, border: `1px solid ${LOSS_RED}44`, borderRadius: "12px", padding: "16px", marginBottom: "20px", textAlign: "left" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                        <Lock size={16} strokeWidth={2} color={LOSS_RED} />
                        <div style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: "700", color: LOSS_RED }}>Account Locked</div>
                      </div>
                      <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, lineHeight: 1.5, marginBottom: "4px" }}>
                        Too many incorrect PIN attempts for <strong>{nameInput.toUpperCase().trim() || lockoutInfo?.name}</strong>. This account is locked for 24 hours.
                      </div>
                      {lockoutInfo?.locked_until && (
                        <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>
                          Unlocks: {new Date(lockoutInfo.locked_until).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      )}
                    </div>
                    {lockoutInfo?.unlock_requested
                      ? <div style={{ fontFamily: F_UI, fontSize: "13px", color: GREEN, textAlign: "center", marginBottom: "16px" }}>Unlock request sent — your admin will review it.</div>
                      : <button onClick={requestUnlock} style={{ width: "100%", background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "13px", fontSize: "14px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700", marginBottom: "12px" }}>Request Admin Unlock</button>
                    }
                    <button onClick={() => { setSignInState("idle"); setLockoutInfo(null); setNameInput(""); setPinInput(""); }}
                      style={{ width: "100%", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "11px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>
                      Back
                    </button>
                  </>
                ) : signInState !== "confirm-new" ? (
                  <>
                    {signInState === "wrong-pin" && (
                      <div style={{ background: `${LOSS_RED}0d`, border: `1px solid ${LOSS_RED}44`, borderRadius: "10px", padding: "10px 14px", marginBottom: "16px", textAlign: "left" }}>
                        <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "700", color: LOSS_RED, marginBottom: "3px" }}>That PIN doesn't match</div>
                        <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, lineHeight: 1.5 }}>
                          You already have an account under this name. Try your PIN again{typeof lockoutInfo?.remaining === "number" ? ` — ${lockoutInfo.remaining} attempt${lockoutInfo.remaining === 1 ? "" : "s"} left before it locks` : ""}. If you've forgotten it, ask an admin to reset your account.
                        </div>
                      </div>
                    )}
                    {signInState === "offline" && (
                      <div style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}44`, borderRadius: "10px", padding: "10px 14px", marginBottom: "16px", textAlign: "left" }}>
                        <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "700", color: TEXT, marginBottom: "3px" }}>Can't reach the club server</div>
                        <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, lineHeight: 1.5 }}>
                          Check your connection and try again. We won't sign you in offline in case it creates a second account by mistake.
                        </div>
                      </div>
                    )}
                    <div style={{ textAlign: "left", marginBottom: "12px" }}>
                      <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Your Name</div>
                      <input value={nameInput} onChange={e => { setNameInput(e.target.value.toUpperCase()); if (signInState === "wrong-pin" || signInState === "offline") setSignInState("idle"); }}
                        placeholder="e.g. J FREW" autoFocus
                        onKeyDown={e => e.key === "Enter" && document.getElementById("pin-input")?.focus()}
                        style={{ width: "100%", boxSizing: "border-box", padding: "13px", fontSize: "16px", border: `1px solid ${BORDER}`, borderRadius: "8px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE, letterSpacing: "2px" }} />
                    </div>
                    <div style={{ textAlign: "left", marginBottom: "20px" }}>
                      <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>4-Digit PIN</div>
                      <input id="pin-input" value={pinInput} onChange={e => { setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4)); if (signInState === "wrong-pin" || signInState === "offline") setSignInState("idle"); }}
                        placeholder="••••" inputMode="numeric" maxLength={4}
                        onKeyDown={e => e.key === "Enter" && handleSignIn()}
                        style={{ width: "100%", boxSizing: "border-box", padding: "13px", fontSize: "22px", border: `1px solid ${BORDER}`, borderRadius: "8px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE, textAlign: "center", letterSpacing: "8px" }} />
                      <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "5px" }}>Your PIN keeps your data private — you'll need it if you change phones.</div>
                    </div>
                    <div style={{ display: "flex", gap: "10px" }}>
                      {settingName && (
                        <button onClick={() => { setSettingName(false); setNameInput(""); setPinInput(""); setSignInState("idle"); }}
                          style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "11px 18px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>
                          Cancel
                        </button>
                      )}
                      <button onClick={handleSignIn} disabled={!nameInput.trim() || pinInput.length !== 4 || signInState === "checking"}
                        style={{ flex: 1, background: nameInput.trim() && pinInput.length === 4 ? MID : BORDER, border: "none", borderRadius: "8px", color: "#fff", padding: "13px 28px", fontSize: "14px", cursor: nameInput.trim() && pinInput.length === 4 ? "pointer" : "default", fontFamily: F_UI, fontWeight: "700" }}>
                        {signInState === "checking" ? "Checking…" : settingName ? "Update" : "Sign In"}
                      </button>
                    </div>
                    <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, textAlign: "center", marginTop: "12px", lineHeight: 1.5 }}>
                      Can't find your data? Make sure your name and PIN match exactly what you used before.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ background: `${GOLD}12`, border: `1px solid ${GOLD}44`, borderRadius: "10px", padding: "10px 14px", marginBottom: "16px", textAlign: "left" }}>
                      <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT, marginBottom: "3px" }}>Looks like you're new here</div>
                      <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, lineHeight: 1.5 }}>If you've signed in before, go back and check your name and PIN match exactly. Otherwise confirm your PIN below to create your account.</div>
                    </div>
                    <div style={{ textAlign: "left", marginBottom: "20px" }}>
                      <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "5px" }}>Confirm PIN</div>
                      <input autoFocus value={pinConfirm} onChange={e => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="••••" inputMode="numeric" maxLength={4}
                        onKeyDown={e => e.key === "Enter" && pinConfirm === pinInput && registerAccount()}
                        style={{ width: "100%", boxSizing: "border-box", padding: "13px", fontSize: "22px", border: `1px solid ${pinConfirm.length === 4 && pinConfirm !== pinInput ? "#e07070" : BORDER}`, borderRadius: "8px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE, textAlign: "center", letterSpacing: "8px" }} />
                      {pinConfirm.length === 4 && pinConfirm !== pinInput && (
                        <div style={{ fontFamily: F_UI, fontSize: "12px", color: "#c0392b", marginTop: "5px" }}>PINs don't match — try again</div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button onClick={() => { setPinConfirm(""); setSignInState("idle"); }}
                        style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "11px 18px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>
                        Back
                      </button>
                      <button onClick={() => registerAccount()} disabled={pinConfirm !== pinInput || pinConfirm.length !== 4}
                        style={{ flex: 1, background: pinConfirm === pinInput && pinConfirm.length === 4 ? MID : BORDER, border: "none", borderRadius: "8px", color: "#fff", padding: "13px 28px", fontSize: "14px", cursor: pinConfirm === pinInput && pinConfirm.length === 4 ? "pointer" : "default", fontFamily: F_UI, fontWeight: "700" }}>
                        Create Account
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* ── TOURNAMENT TRACKER DASHBOARD ── */
              <>
                {(() => {
                  const activeEntries = myEntries.filter(e => e.status === "active");
                  const allWins  = myEntries.reduce((s, e) => s + e.ties.filter(t => t.result === "W").length, 0);
                  const allLosses = myEntries.reduce((s, e) => s + e.ties.filter(t => t.result === "L").length, 0);
                  const entryOppResults = entryOppSearch.length >= 2
                    ? sectionMembers.filter(m => m.name.toUpperCase().includes(entryOppSearch.toUpperCase())).slice(0, 8)
                    : [];
                  const nextOppResults = nextOppSearch.length >= 2
                    ? sectionMembers.filter(m => m.name.toUpperCase().includes(nextOppSearch.toUpperCase())).slice(0, 8)
                    : [];
                  const urgent = findUrgentTie(myEntries);
                  const sheetEntry = sheetEntryId ? myEntries.find(e => e.id === sheetEntryId) : null;

                  function closeEntrySheet() {
                    setSheetEntryId(null);
                    setActiveRound(-1);
                    setScoringInfo(null); setScoreMy(""); setScoreOppV("");
                    setNextRoundFor(null); setNextOppSearch(""); setNextOppPicked(null);
                    setNextDate(""); setNextTime("");
                    setDelEntry(null); setEditingTieDate(null);
                  }

                  return (
                    <>
                      {/* hidden backup file input still needed */}
                      <input ref={backupFileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleBackupImport} />

                      {/* ── PIN setup prompt (existing users without PIN) ── */}
                      {myName && !myPin && (
                        <div style={{ background: `${GOLD}12`, border: `1.5px solid ${GOLD}55`, borderRadius: "14px", padding: "18px 16px", marginBottom: "14px" }}>
                          <div style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: "700", color: TEXT, marginBottom: "4px" }}>🔒 Set up a PIN to protect your data</div>
                          <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, lineHeight: 1.5, marginBottom: "12px" }}>Add a 4-digit PIN so your cloud data can't be mixed up with another member who shares your initials. You'll only need to do this once.</div>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <input value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                              placeholder="4 digits" inputMode="numeric" maxLength={4}
                              onKeyDown={e => e.key === "Enter" && saveExistingPin()}
                              style={{ flex: 1, padding: "10px 12px", fontSize: "18px", border: `1px solid ${GOLD}55`, borderRadius: "8px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE, textAlign: "center", letterSpacing: "6px" }} />
                            <button onClick={saveExistingPin} disabled={pinInput.length !== 4}
                              style={{ background: pinInput.length === 4 ? MID : BORDER, border: "none", borderRadius: "8px", color: "#fff", padding: "11px 18px", fontSize: "13px", cursor: pinInput.length === 4 ? "pointer" : "default", fontFamily: F_UI, fontWeight: "600", whiteSpace: "nowrap" }}>
                              Set PIN
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── Share toast ── */}
                      {shareToast && (
                        <div style={{ position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: GREEN, color: "#fff", borderRadius: "10px", padding: "10px 18px", fontSize: "13px", fontFamily: F_UI, fontWeight: "600", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", whiteSpace: "nowrap", maxWidth: "90vw", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {shareToast}
                        </div>
                      )}

                      {/* ── App share toast ── */}
                      {appShareToast && (
                        <div style={{ position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: MID, color: "#fff", borderRadius: "10px", padding: "10px 18px", fontSize: "13px", fontFamily: F_UI, fontWeight: "600", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", whiteSpace: "nowrap", maxWidth: "90vw", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {appShareToast}
                        </div>
                      )}

                      {/* ─── HERO CARD ─── */}
                      {urgent ? (
                        <div style={{ background: GREEN, borderRadius: "16px", padding: "20px", marginBottom: "14px", position: "relative", overflow: "hidden" }}>
                          <div style={{ position: "absolute", top: -30, right: -30, width: "120px", height: "120px", background: "rgba(201,168,76,0.12)", borderRadius: "50%", pointerEvents: "none" }} />
                          <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: GOLD, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "6px" }}>Next Up</div>
                          <div style={{ fontFamily: F_SANS, fontSize: "24px", fontWeight: "700", color: "#ffffff", letterSpacing: "0.02em", lineHeight: 1.1, marginBottom: "4px" }}>
                            {urgent.entry.tournamentName}
                          </div>
                          <div style={{ fontFamily: F_UI, fontSize: "14px", color: "rgba(255,255,255,0.85)", marginBottom: "4px" }}>
                            {urgent.roundLabel} · vs {urgent.opponent}
                          </div>
                          {urgent.date ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", color: GOLD }}>
                                <Calendar size={12} strokeWidth={2} />{fmtDate(urgent.date)}{urgent.time ? ` · ${urgent.time}` : ""}
                              </span>
                              {countdownLabel(urgent.date) && (
                                <span style={{ background: "rgba(201,168,76,0.2)", border: "1px solid rgba(201,168,76,0.4)", borderRadius: "12px", padding: "2px 9px", fontSize: "11px", fontWeight: "700", color: GOLD, fontFamily: F_UI, letterSpacing: "0.02em" }}>
                                  {countdownLabel(urgent.date)}
                                </span>
                              )}
                            </div>
                          ) : <div style={{ marginBottom: "14px" }} />}
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button onClick={() => { setSheetEntryId(urgent.entry.id); setScoringInfo({ entryId: urgent.entry.id, roundIdx: urgent.roundIdx }); setScoreMy(""); setScoreOppV(""); }}
                              style={{ flex: 1, background: GOLD, border: "none", borderRadius: "10px", color: "#4a0e1f", padding: "11px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700", letterSpacing: "0.04em" }}>
                              Enter Score
                            </button>
                            <button onClick={() => setSheetEntryId(urgent.entry.id)}
                              style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "10px", color: "#ffffff", padding: "11px 16px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "500", display: "flex", alignItems: "center", gap: "4px" }}>
                              Details <ChevronRight size={14} strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                      ) : myEntries.length > 0 ? (
                        <div style={{ background: WIN_BG, border: `1px solid ${GOLD}44`, borderRadius: "14px", padding: "16px 18px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "12px" }}>
                          <Trophy size={26} strokeWidth={1.5} color={GOLD} />
                          <div>
                            <div style={{ fontFamily: F_SANS, fontSize: "16px", fontWeight: "600", color: GREEN }}>All caught up!</div>
                            <div style={{ fontSize: "12px", color: TEXT2, marginTop: "2px" }}>No pending ties — well played so far</div>
                          </div>
                        </div>
                      ) : null}

                      {/* ─── EMPTY STATE / DRAW ENTRIES ─── */}
                      {myEntries.length === 0 && futureDrawEntries.length === 0 && (
                        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "32px 24px", textAlign: "center", marginBottom: "14px" }}>
                          <div style={{ marginBottom: "12px", display: "flex", justifyContent: "center" }}><Target size={32} strokeWidth={1.25} color={GREEN} /></div>
                          <div style={{ fontFamily: F_SANS, fontSize: "22px", color: GREEN, marginBottom: "8px" }}>No draws published yet</div>
                          <div style={{ fontSize: "12px", color: TEXT2, marginBottom: "4px" }}>Your competitions will appear here automatically once draws are published by the admin.</div>
                        </div>
                      )}

                      {/* ─── AUTO-POPULATED DRAW ENTRIES ─── */}
                      {futureDrawEntries.length > 0 && myEntries.length === 0 && (
                        <div style={{ marginBottom: "14px" }}>
                          <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>
                            My Competitions · {settings.seasonYear || new Date().getFullYear()} Season
                          </div>
                          {futureDrawEntries.map(de => {
                            const t = TOURNAMENTS.find(t2 => t2.id === de.tournamentId);
                            const color = t?.color || MID;
                            const status = de.playerSlot ? getPlayerDrawStatus(de.drawId, de.playerSlot, de.roundDates) : null;
                            const roundLabel = status?.roundLabel || (de.isPrelim ? "Preliminary" : "1st Round");
                            const opponent = status?.opponentName ?? de.opponent;
                            const isBye = status ? (status.opponentName === null) : de.isBye;
                            const roundDate = status?.roundDate ? new Date(status.roundDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
                            const canRecord = !status?.eliminated && !status?.winner && !de.draw?.is_test;
                            return (
                              <div key={de.drawId} onClick={() => canRecord && setActiveDrawEntry({ de, status })}
                                style={{ background: SURFACE, border: `1px solid ${status?.eliminated ? LOSS_RED + "55" : status?.winner ? GOLD + "88" : BORDER}`, borderLeft: `3px solid ${status?.eliminated ? LOSS_RED : status?.winner ? GOLD : color}`, borderRadius: "10px", padding: "12px 14px", marginBottom: "8px", cursor: canRecord ? "pointer" : "default" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                                  <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "700", color: TEXT }}>{de.tournamentName}</div>
                                  <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: status?.eliminated ? LOSS_RED : status?.winner ? GOLD : GREEN }}>{status?.winner ? "🏆 Winner!" : status?.eliminated ? "Eliminated" : "Draw live ✓"}</div>
                                </div>
                                <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2 }}>
                                  {roundLabel} · {isBye ? <span style={{ color: GOLD_MUTED, fontWeight: "600" }}>BYE</span> : opponent === "TBD" ? <span style={{ color: TEXT3 }}>Awaiting opponent</span> : <>vs <span style={{ fontWeight: "600", color: TEXT }}>{opponent}</span></>}
                                </div>
                                {roundDate && !status?.eliminated && !status?.winner && <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "3px" }}>Must play by: {roundDate}</div>}
                                {canRecord && <div style={{ fontFamily: F_UI, fontSize: "11px", color: MID, fontWeight: "600", marginTop: "5px" }}>Tap to record result →</div>}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* ─── STAT PILLS ─── */}
                      {myEntries.length > 0 && (
                        <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                          {[
                            { label: "Active", val: activeEntries.length, col: GREEN },
                            { label: "Won",    val: allWins,              col: WIN_GOLD },
                            { label: "Lost",   val: allLosses,            col: LOSS_RED },
                          ].map(s => (
                            <div key={s.label} style={{ flex: 1, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "10px 6px", textAlign: "center" }}>
                              <div style={{ fontFamily: F_SANS, fontSize: "28px", fontWeight: "700", color: s.col, lineHeight: 1 }}>{s.val}</div>
                              <div style={{ fontSize: "10px", color: TEXT3, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "3px", fontWeight: "500" }}>{s.label}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Reminder banner ── */}
                      {reminderItems.length > 0 && (
                        <div style={{ marginBottom: "14px", background: "#fffbeb", border: "1px solid #f59e0b44", borderRadius: "10px", overflow: "hidden", animation: "fadeIn 0.2s ease" }}>
                          <button
                            onClick={() => setRemindersExpanded(v => !v)}
                            style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "11px 14px", display: "flex", alignItems: "center", gap: "10px", textAlign: "left" }}>
                            <Bell size={15} strokeWidth={2} color="#b45309" style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1, fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: "#92400e" }}>
                              {reminderItems.length === 1 ? "1 competition needs attention" : `${reminderItems.length} competitions need attention`}
                            </div>
                            <ChevronDown size={14} strokeWidth={2} color="#b45309" style={{ flexShrink: 0, transform: remindersExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                          </button>
                          {remindersExpanded && (
                            <div style={{ borderTop: "1px solid #f59e0b33", padding: "4px 14px 12px" }}>
                              {reminderItems.map((item, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "10px" }}>
                                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: item.color || "#b45309", flexShrink: 0, marginTop: "4px" }} />
                                  <div>
                                    <div style={{ fontFamily: F_UI, fontSize: "12px", fontWeight: "700", color: "#92400e", marginBottom: "1px" }}>{item.entryName}</div>
                                    <div style={{ fontFamily: F_UI, fontSize: "12px", color: "#b45309", lineHeight: 1.4 }}>{item.message}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── Match Secretary contact strip ── */}
                      {myEntries.length > 0 && <a href="tel:+447402348205" style={{ display: "flex", alignItems: "center", gap: "10px", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", textDecoration: "none" }}>
                        <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: `${GREEN}10`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Phone size={15} strokeWidth={2} color={GREEN} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em" }}>Match Secretary</div>
                          <div style={{ fontFamily: F_SANS, fontSize: "16px", fontWeight: "700", color: GREEN, lineHeight: 1.2 }}>Matt Kirkland</div>
                        </div>
                        <div style={{ fontFamily: F_UI, fontSize: "12px", color: GOLD_MUTED, fontWeight: "700" }}>Call</div>
                      </a>}

                      {/* ── View toggle ── */}
                      {myEntries.length > 0 && (
                        <div style={{ display: "flex", gap: "0", marginBottom: "14px", borderBottom: `1px solid ${BORDER}` }}>
                          {[{ id: "current", label: "My Competitions" }, { id: "history", label: "History" }].map(v => (
                            <button key={v.id} onClick={() => setTiesView(v.id)} style={{
                              flex: 1, background: "transparent", border: "none",
                              borderBottom: tiesView === v.id ? `3px solid ${GREEN}` : "3px solid transparent",
                              color: tiesView === v.id ? GREEN : TEXT3,
                              padding: "10px 8px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600",
                              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "-1px", minHeight: "44px",
                            }}>{v.label}</button>
                          ))}
                        </div>
                      )}

                      {/* ── CURRENT: Compact competition list ── */}
                      {tiesView === "current" && (<>
                        {/* Draw entries alongside manual entries */}
                        {myEntries.length > 0 && futureDrawEntries.length > 0 && (
                          <div style={{ marginBottom: "14px" }}>
                            <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>From Draw · {settings.seasonYear || new Date().getFullYear()}</div>
                            {futureDrawEntries.map(de => {
                              const t = TOURNAMENTS.find(t2 => t2.id === de.tournamentId);
                              const color = t?.color || MID;
                              const status = de.playerSlot ? getPlayerDrawStatus(de.drawId, de.playerSlot, de.roundDates) : null;
                              const roundLabel = status?.roundLabel || (de.isPrelim ? "Preliminary" : "1st Round");
                              const opponent = status?.opponentName ?? de.opponent;
                              const isBye = status ? (status.opponentName === null) : de.isBye;
                              const roundDate = status?.roundDate ? new Date(status.roundDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
                              const canRecord = !status?.eliminated && !status?.winner && !de.draw?.is_test;
                              return (
                                <div key={de.drawId} onClick={() => canRecord && setActiveDrawEntry({ de, status })}
                                  style={{ background: SURFACE, border: `1px solid ${status?.eliminated ? LOSS_RED + "55" : status?.winner ? GOLD + "88" : BORDER}`, borderLeft: `3px solid ${status?.eliminated ? LOSS_RED : status?.winner ? GOLD : color}`, borderRadius: "10px", padding: "12px 14px", marginBottom: "8px", cursor: canRecord ? "pointer" : "default" }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                                    <div style={{ fontFamily: F_UI, fontSize: "13px", fontWeight: "700", color: TEXT }}>{de.tournamentName}</div>
                                    <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: status?.eliminated ? LOSS_RED : status?.winner ? GOLD : GREEN }}>{status?.winner ? "🏆 Winner!" : status?.eliminated ? "Eliminated" : "Draw live ✓"}</div>
                                  </div>
                                  <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2 }}>
                                    {roundLabel} · {isBye ? <span style={{ color: GOLD_MUTED, fontWeight: "600" }}>BYE</span> : opponent === "TBD" ? <span style={{ color: TEXT3 }}>Awaiting opponent</span> : <>vs <span style={{ fontWeight: "600", color: TEXT }}>{opponent}</span></>}
                                  </div>
                                  {roundDate && !status?.eliminated && !status?.winner && <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "3px" }}>Must play by: {roundDate}</div>}
                                  {canRecord && <div style={{ fontFamily: F_UI, fontSize: "11px", color: MID, fontWeight: "600", marginTop: "5px" }}>Tap to record result →</div>}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {myEntries.length > 0 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                          <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>
                            {reorderMode
                              ? (reorderPickId ? "Now tap where to place it" : "Tap a competition to pick it up")
                              : "Tap a competition to open details"}
                          </div>
                          <button
                            onClick={() => {
                              const next = !reorderMode;
                              setReorderMode(next);
                              if (!next) setReorderPickId(null);
                            }}
                            style={{
                              background: reorderMode ? `${GOLD}20` : SURFACE2,
                              border: `1px solid ${reorderMode ? `${GOLD}66` : BORDER}`,
                              borderRadius: "8px",
                              color: reorderMode ? GOLD_MUTED : TEXT2,
                              padding: "7px 10px",
                              fontSize: "11px",
                              fontFamily: F_UI,
                              fontWeight: "700",
                              cursor: "pointer",
                            }}
                          >
                            {reorderMode ? "Done" : "Reorder"}
                          </button>
                        </div>}

                        {myEntries.map((entry, entryIdx) => {
                          const lastTie = entry.ties.length > 0 ? entry.ties[entry.ties.length - 1] : null;
                          const currentRound = lastTie ? lastTie.roundLabel : getRoundLabel(0, entry.totalRounds);
                          const hasPending = entry.ties.some(t => !t.result) || entry.ties.length === 0;
                          const statusLabel = entry.status === "active" ? "Active" : entry.status === "champion" ? "Champion" : "Eliminated";
                          const statusCol = entry.status === "active" ? TEXT2 : entry.status === "champion" ? GOLD_MUTED : LOSS_RED;
                          const isPicked = reorderPickId === entry.id;
                          const nextPendingTie = entry.ties.find(t => !t.result);
                          const nextRoundIdx = nextPendingTie
                            ? nextPendingTie.roundIdx
                            : (entry.ties.length > 0 ? entry.ties[entry.ties.length - 1].roundIdx + 1 : 0);
                          const deadlineDate = getRoundDateForComp(entry.tournamentId, nextRoundIdx);
                          const arrangedDate  = nextPendingTie?.date || null;
                          const deadlineDays  = deadlineDate && entry.status === "active" && nextRoundIdx < entry.totalRounds
                            ? countdownDays(deadlineDate) : null;
                          return (
                            <div
                              key={entry.id}
                              onClick={() => {
                                if (!reorderMode) {
                                  setSheetEntryId(entry.id);
                                  setActiveRound(entry.ties.length > 0 ? entry.ties.length - 1 : 0);
                                  return;
                                }
                                if (!reorderPickId) {
                                  setReorderPickId(entry.id);
                                  return;
                                }
                                if (reorderPickId === entry.id) {
                                  setReorderPickId(null);
                                  return;
                                }
                                placeEntryBefore(reorderPickId, entry.id);
                                setReorderPickId(null);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                                padding: "13px 14px",
                                background: isPicked ? `${GOLD}14` : SURFACE,
                                border: `1px solid ${isPicked ? `${GOLD}77` : BORDER}`,
                                borderLeft: `4px solid ${entry.tournamentColor}`,
                                borderRadius: "12px",
                                marginBottom: "8px",
                                cursor: "pointer",
                                minHeight: "58px",
                              }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontFamily: F_SANS, fontSize: "16px", fontWeight: "600", color: GREEN, letterSpacing: "0.02em" }}>{entry.tournamentName}</div>
                                  <div style={{ fontSize: "11px", color: TEXT2, marginTop: "2px" }}>
                                    {currentRound}
                                    {lastTie && lastTie.result === null && ` · vs ${lastTie.opponent}`}
                                    {lastTie && lastTie.result === "W" && ` · Won ${lastTie.myScore}–${lastTie.oppScore}`}
                                    {lastTie && lastTie.result === "L" && ` · Lost ${lastTie.myScore}–${lastTie.oppScore}`}
                                    {lastTie && lastTie.result === "BYE" && ` · Bye`}
                                    {!lastTie && " · No opponent set"}
                                  </div>
                                  {entry.status === "active" && nextRoundIdx < entry.totalRounds && (
                                    <div style={{ fontSize: "10px", color: TEXT3, marginTop: "2px", fontFamily: F_UI }}>
                                      Must play by:{" "}
                                      <span style={{ color: deadlineDays !== null && deadlineDays < 0 ? LOSS_RED : TEXT2, fontWeight: "600" }}>
                                        {deadlineDate
                                          ? deadlineDays < 0 ? `${fmtDate(deadlineDate)} · Overdue`
                                            : countdownLabel(deadlineDate) ? `${fmtDate(deadlineDate)} · ${countdownLabel(deadlineDate)}`
                                            : fmtDate(deadlineDate)
                                          : "No date set"}
                                      </span>
                                    </div>
                                  )}
                                  {arrangedDate && arrangedDate !== deadlineDate && (
                                    <div style={{ fontSize: "10px", color: TEXT3, marginTop: "1px", fontFamily: F_UI }}>
                                      Playing:{" "}
                                      <span style={{ color: GREEN, fontWeight: "600" }}>
                                        {fmtDate(arrangedDate)}{countdownLabel(arrangedDate) ? ` · ${countdownLabel(arrangedDate)}` : ""}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                                  <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "4px", border: `1px solid ${statusCol}44`, color: statusCol, fontFamily: F_UI, fontWeight: "600" }}>{statusLabel}</span>
                                  {hasPending && entry.status === "active" && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: GOLD, display: "inline-block", flexShrink: 0 }} />}
                                  <ChevronRight size={16} strokeWidth={1.75} color={reorderMode ? (isPicked ? GOLD_MUTED : TEXT2) : TEXT3} />
                                </div>
                            </div>
                          );
                        })}

                        {/* ─── Action row ─── */}
                        <div style={{ marginTop: "8px" }}>
                          <button onClick={() => { setShowEntrySheet(true); setEntryJustSaved(false); setEntryTournId(""); setEntryRounds(4); setEntryOppSearch(""); setEntryOppPicked(null); setEntryDate(""); setEntryTime(""); }}
                            style={{ width: "100%", background: MID, border: "none", borderRadius: "10px", color: "#ffffff", padding: "12px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                            <Plus size={14} strokeWidth={2.5} /> Add Tournament
                          </button>
                        </div>

                        {/* Honours teaser — this used to open a tab of its own. Now
                            that honours live at the foot of the Club page, jump
                            straight to them rather than dropping the member at the
                            top of the club's own page to scroll for it. */}
                        {myHonours.length > 0 && (
                          <button onClick={() => goToMyHonours()}
                            style={{ width: "100%", marginTop: "16px", background: `${GOLD}08`, border: `1px solid ${GOLD}33`, borderRadius: "10px", padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", textAlign: "left" }}>
                            <Medal size={18} strokeWidth={1.5} color={GOLD_MUTED} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: GOLD_MUTED, letterSpacing: "0.08em", textTransform: "uppercase" }}>My Honours</div>
                              <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, marginTop: "1px" }}>{myHonours.length} achievement{myHonours.length !== 1 ? "s" : ""} recorded</div>
                            </div>
                            <ChevronRight size={16} strokeWidth={1.75} color={TEXT3} />
                          </button>
                        )}
                      </>)}

                      {/* ══════════════════════════════════════════
                          HISTORY VIEW
                      ══════════════════════════════════════════ */}
                      {tiesView === "history" && (() => {
                        const q = historySearch.trim().toUpperCase();
                        const allTies = myEntries.flatMap(e =>
                          e.ties.map(t => ({ ...t, tournamentName: e.tournamentName, tournamentColor: e.tournamentColor, entryId: e.id }))
                        );
                        const h2hGames = q.length >= 2
                          ? allTies.filter(t => t.opponent.toUpperCase().includes(q) && t.result !== null)
                          : [];
                        const h2hWins   = h2hGames.filter(g => g.result === "W").length;
                        const h2hLosses = h2hGames.filter(g => g.result === "L").length;

                        return (
                          <div>
                            {/* Head-to-head search */}
                            <div style={{ background: SURFACE, borderRadius: "12px", padding: "14px", boxShadow: "0 1px 4px rgba(74,14,31,0.06)", marginBottom: "14px" }}>
                              <div style={{ fontSize: "11px", color: TEXT2, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "1px" }}>Head-to-Head Lookup</div>
                              <input value={historySearch} onChange={e => setHistorySearch(e.target.value)}
                                placeholder="Type a player's name…"
                                style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "14px", outline: "none", fontFamily: F_UI, color: GREEN, background: SURFACE }} />

                              {q.length >= 2 && (
                                h2hGames.length > 0 ? (
                                  <div style={{ marginTop: "12px" }}>
                                    <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                                      <div style={{ flex: 1, background: "#0d1f15", borderRadius: "8px", padding: "8px", textAlign: "center" }}>
                                        <div style={{ fontSize: "20px", fontWeight: "bold", color: GOLD_LIGHT }}>{h2hWins}</div>
                                        <div style={{ fontSize: "10px", color: TEXT2, textTransform: "uppercase", letterSpacing: "1px" }}>Wins</div>
                                      </div>
                                      <div style={{ flex: 1, background: "#fef2f2", borderRadius: "8px", padding: "8px", textAlign: "center" }}>
                                        <div style={{ fontSize: "20px", fontWeight: "bold", color: "#e07070" }}>{h2hLosses}</div>
                                        <div style={{ fontSize: "10px", color: TEXT2, textTransform: "uppercase", letterSpacing: "1px" }}>Losses</div>
                                      </div>
                                      <div style={{ flex: 1, background: GREEN, borderRadius: "8px", padding: "8px", textAlign: "center" }}>
                                        <div style={{ fontSize: "20px", fontWeight: "bold", color: "#fff" }}>{h2hGames.length}</div>
                                        <div style={{ fontSize: "10px", color: TEXT2, textTransform: "uppercase", letterSpacing: "1px" }}>Played</div>
                                      </div>
                                    </div>
                                    {h2hGames.map((g, i) => (
                                      <div key={i} style={{
                                        background: g.result === "W" ? "#f0fdf4" : g.result === "BYE" ? "#eff6ff" : "#fef2f2",
                                        borderRadius: "9px", padding: "10px 13px", marginBottom: "6px",
                                        borderLeft: `3px solid ${g.result === "W" ? "#16a34a" : g.result === "BYE" ? "#60a5fa" : "#dc2626"}`,
                                      }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                          <div>
                                            <span style={{ fontSize: "11px", background: `${g.tournamentColor}22`, color: g.tournamentColor, padding: "2px 7px", borderRadius: "8px", fontWeight: "bold", marginRight: "6px" }}>{g.tournamentName}</span>
                                            <span style={{ fontSize: "11px", color: TEXT2 }}>{g.roundLabel}</span>
                                          </div>
                                          {g.date && <span style={{ fontSize: "11px", color: TEXT2 }}>{fmtDate(g.date)}</span>}
                                        </div>
                                        <div style={{ fontSize: "14px", fontWeight: "bold", marginTop: "4px",
                                          color: g.result === "W" ? "#16a34a" : g.result === "BYE" ? "#1d4ed8" : "#dc2626" }}>
                                          {g.result === "W"   && `Won ${g.myScore}–${g.oppScore}`}
                                          {g.result === "L"   && `Lost ${g.myScore}–${g.oppScore}`}
                                          {g.result === "BYE" && "Bye — advanced"}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ marginTop: "10px", fontSize: "13px", color: TEXT2 }}>No recorded games vs &ldquo;{historySearch}&rdquo;</div>
                                )
                              )}
                            </div>

                            {/* ── Full tournament history ── */}
                            {!q && (
                              <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "bold" }}>
                                All Tournaments — {myEntries.length} {myEntries.length === 1 ? "entry" : "entries"}
                              </div>
                            )}
                            {[...myEntries].reverse().map(entry => (
                              <div key={entry.id} style={{ background: SURFACE, borderRadius: "12px", boxShadow: "0 1px 4px rgba(74,14,31,0.06)", marginBottom: "12px", overflow: "hidden", borderTop: `4px solid ${entry.tournamentColor}` }}>
                                {/* Entry header */}
                                <div style={{ padding: "11px 14px", borderBottom: entry.ties.length > 0 ? "1px solid #f3f4f6" : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                  <div>
                                    <span style={{ fontSize: "13px", fontWeight: "bold", color: entry.tournamentColor }}>{entry.tournamentName}</span>
                                    <span style={{ fontSize: "10px", color: TEXT2, marginLeft: "8px" }}>{entry.totalRounds} rounds</span>
                                  </div>
                                  <span style={{
                                    fontSize: "10px", fontWeight: "bold", padding: "2px 8px", borderRadius: "8px",
                                    background: entry.status === "active" ? "#f0fdf4" : entry.status === "champion" ? "#fef9c3" : "#fef2f2",
                                    color: entry.status === "active" ? "#16a34a" : entry.status === "champion" ? "#854d0e" : "#dc2626",
                                  }}>
                                    {entry.status === "active" ? "Active" : entry.status === "champion" ? "Champion" : "Out"}
                                  </span>
                                </div>
                                {/* Ties timeline */}
                                {entry.ties.length === 0 && (
                                  <div style={{ padding: "10px 14px", fontSize: "12px", color: TEXT2, fontStyle: "italic" }}>No games played yet</div>
                                )}
                                {entry.ties.map((tie, ti) => (
                                  <div key={ti} style={{ padding: "10px 14px", borderBottom: ti < entry.ties.length - 1 ? "1px solid #f3f4f6" : "none", display: "flex", alignItems: "center", gap: "10px" }}>
                                    <div style={{ width: "3px", alignSelf: "stretch", borderRadius: "2px", background: tie.result === "W" ? "#16a34a" : tie.result === "L" ? "#dc2626" : "#d1d5db", flexShrink: 0 }} />
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: "10px", color: TEXT2, textTransform: "uppercase", letterSpacing: "1px" }}>{tie.roundLabel}</div>
                                      <button onClick={() => openH2H(tie.opponent)}
                                        style={{ background: "none", border: "none", padding: "0", cursor: "pointer", fontSize: "13px", fontWeight: "bold", color: GREEN, fontFamily: F_UI, textAlign: "left" }}>
                                        vs {tie.opponent}
                                      </button>
                                      {tie.date && <span style={{ fontSize: "10px", color: TEXT2, marginLeft: "6px" }}>{fmtDate(tie.date)}</span>}
                                    </div>
                                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                                      {tie.result === "W"   && <span style={{ fontSize: "13px", fontWeight: "bold", color: GOLD }}>Won {tie.myScore}–{tie.oppScore}</span>}
                                      {tie.result === "L"   && <span style={{ fontSize: "13px", fontWeight: "bold", color: "#dc2626" }}>Lost {tie.myScore}–{tie.oppScore}</span>}
                                      {tie.result === "BYE" && <span style={{ fontSize: "13px", fontWeight: "bold", color: "#1d4ed8" }}>Bye</span>}
                                      {tie.result === null  && <span style={{ fontSize: "11px", color: TEXT2 }}>Pending</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ))}

                            {myEntries.length === 0 && (
                              <div style={{ background: SURFACE, borderRadius: "12px", padding: "28px", textAlign: "center", color: TEXT2, boxShadow: "0 1px 4px rgba(74,14,31,0.06)" }}>
                                <div style={{ fontFamily: F_SANS, fontSize: "20px", fontWeight: "600", color: GREEN, marginBottom: "4px" }}>No history yet</div>
                                <div style={{ fontSize: "12px" }}>Switch to Competitions to enter your first tournament</div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* ══ BOTTOM SHEET: Entry Detail ══ */}
                      {(() => {
                        if (!sheetEntry) return null;
                        const entry = sheetEntry;
                        return (
                          <BottomSheet open={!!sheetEntryId} onClose={closeEntrySheet}
                            title={entry.tournamentName}
                            titleColor={entry.tournamentColor}>

                            {/* ── Header: stats + remove ── */}
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
                              {/* W / L pills */}
                              {(() => {
                                const wins   = entry.ties.filter(t => t.result === "W" || t.result === "BYE").length;
                                const losses = entry.ties.filter(t => t.result === "L").length;
                                return (
                                  <>
                                    <div style={{ display: "flex", alignItems: "center", gap: "5px", background: `${WIN_GOLD}18`, border: `1px solid ${WIN_GOLD}55`, borderRadius: "8px", padding: "5px 10px" }}>
                                      <span style={{ fontFamily: F_SANS, fontSize: "16px", fontWeight: "700", color: WIN_GOLD }}>{wins}</span>
                                      <span style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: WIN_GOLD, textTransform: "uppercase", letterSpacing: "0.08em" }}>Won</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "5px", background: `${LOSS_RED}10`, border: `1px solid ${LOSS_RED}44`, borderRadius: "8px", padding: "5px 10px" }}>
                                      <span style={{ fontFamily: F_SANS, fontSize: "16px", fontWeight: "700", color: LOSS_RED }}>{losses}</span>
                                      <span style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: LOSS_RED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Lost</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "5px", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "8px", padding: "5px 10px" }}>
                                      <span style={{ fontFamily: F_SANS, fontSize: "16px", fontWeight: "700", color: TEXT2 }}>{entry.totalRounds}</span>
                                      <span style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.08em" }}>Rounds</span>
                                    </div>
                                  </>
                                );
                              })()}
                              <button onClick={() => { setEntries(prev => prev.filter(e => e.id !== entry.id)); closeEntrySheet(); }}
                                style={{ marginLeft: "auto", background: "none", border: `1px solid #e8c5c5`, borderRadius: "6px", color: LOSS_RED, cursor: "pointer", fontSize: "11px", padding: "5px 10px", fontFamily: F_UI }}>
                                Remove
                              </button>
                            </div>

                            {/* ── Round timeline ── */}
                            <div style={{ marginBottom: "12px" }}>
                              {Array.from({ length: entry.totalRounds }, (_, rIdx) => {
                                const tie        = entry.ties.find(t => t.roundIdx === rIdx);
                                const isNext     = !tie && entry.ties.length === rIdx; // next playable round
                                const isFuture   = !tie && !isNext;
                                const isExpanded = activeRound === rIdx && !isFuture;
                                const isScoring  = scoringInfo?.entryId === entry.id && scoringInfo?.roundIdx === rIdx;
                                const roundLabel = getRoundLabel(rIdx, entry.totalRounds);

                                // colours
                                let accentCol = BORDER, rowBg = SURFACE, textCol = TEXT;
                                if (tie?.result === "W")   { accentCol = WIN_GOLD; rowBg = WIN_BG; }
                                if (tie?.result === "BYE") { accentCol = GOLD_MUTED; rowBg = SURFACE2; }
                                if (tie?.result === "L")   { accentCol = LOSS_RED; rowBg = LOSS_BG; }
                                if (isNext)                { accentCol = entry.tournamentColor || GREEN; rowBg = `${entry.tournamentColor || GREEN}08`; }
                                if (isFuture)              { textCol = TEXT3; }

                                const resultLabel = tie?.result === "W" ? `Won ${tie.myScore}–${tie.oppScore}`
                                  : tie?.result === "L" ? `Lost ${tie.myScore}–${tie.oppScore}`
                                  : tie?.result === "BYE" ? "Bye"
                                  : null;

                                const noteKey = tie?.opponent?.trim().toUpperCase();
                                const note = noteKey ? oppNotes[noteKey] : null;
                                const sched = getRoundDateForComp(entry.tournamentId, rIdx);
                                const schedDays = sched ? countdownDays(sched) : null;
                                const countdown = tie && !tie.result && tie.date ? countdownLabel(tie.date) : null;
                                const isEditingOpp = editOppTarget?.entryId === entry.id && editOppTarget?.roundIdx === rIdx;
                                const isEditingDate = editingTieDate?.entryId === entry.id && editingTieDate?.roundIdx === rIdx;
                                const isEditingNoteHere = editingNote?.key === noteKey;

                                return (
                                  <div key={rIdx} style={{ marginBottom: "6px" }}>
                                    {/* ── Compact row (always visible) ── */}
                                    <div
                                      onClick={() => !isFuture && setActiveRound(isExpanded ? -1 : rIdx)}
                                      style={{
                                        display: "flex", alignItems: "center", gap: "10px",
                                        background: rowBg, borderRadius: isExpanded ? "10px 10px 0 0" : "10px",
                                        border: `1px solid ${isExpanded ? accentCol : BORDER}`,
                                        borderLeft: `3px solid ${accentCol}`,
                                        padding: "11px 14px",
                                        cursor: isFuture ? "default" : "pointer",
                                        opacity: isFuture ? 0.45 : 1,
                                        transition: "border-color 0.15s",
                                      }}>
                                      {/* Round number badge */}
                                      <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: isFuture ? BORDER : accentCol, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                        <span style={{ fontFamily: F_SANS, fontSize: "11px", fontWeight: "700", color: isFuture ? TEXT3 : "#fff" }}>{rIdx + 1}</span>
                                      </div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: textCol === TEXT ? TEXT3 : textCol, textTransform: "uppercase", letterSpacing: "0.08em" }}>{roundLabel}</div>
                                        <div style={{ fontFamily: F_SANS, fontSize: "14px", fontWeight: "600", color: textCol, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {tie ? `vs ${tie.opponent}` : isNext ? "Set opponent" : "Upcoming"}
                                        </div>
                                      </div>
                                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                                        {resultLabel && <div style={{ fontFamily: F_UI, fontSize: "12px", fontWeight: "700", color: accentCol }}>{resultLabel}</div>}
                                        {tie && !tie.result && tie.date && <div style={{ fontFamily: F_UI, fontSize: "11px", color: GREEN }}>{fmtDate(tie.date)}</div>}
                                        {tie && !tie.result && !tie.date && sched && <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>by {fmtDate(sched)}</div>}
                                        {isNext && !tie && <div style={{ fontFamily: F_UI, fontSize: "11px", color: entry.tournamentColor || GREEN, fontWeight: "600" }}>▶ Next</div>}
                                        {isNext && !tie && <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>{sched ? fmtDate(sched) : "Date TBC"}</div>}
                                        {isFuture && <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>{sched ? fmtDate(sched) : "Date TBC"}</div>}
                                      </div>
                                      {!isFuture && <ChevronRight size={14} strokeWidth={2} color={TEXT3} style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />}
                                    </div>

                                    {/* ── Expanded panel ── */}
                                    {isExpanded && (
                                      <div style={{ background: rowBg, border: `1px solid ${accentCol}`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: "14px" }}>

                                        {/* Opponent row */}
                                        {tie && (
                                          <div style={{ marginBottom: "12px" }}>
                                            {isEditingOpp ? (
                                              <div>
                                                <input value={editOppSearch} onChange={e => { setEditOppSearch(e.target.value.toUpperCase()); setEditOppPicked(null); }} placeholder="Search or type name…" autoFocus
                                                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: `2px solid ${GREEN}`, borderRadius: "8px", fontSize: "14px", fontFamily: F_UI, outline: "none", color: TEXT, background: SURFACE, marginBottom: "6px" }} />
                                                {editOppResults.length > 0 && (
                                                  <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", overflow: "hidden", marginBottom: "6px" }}>
                                                    {editOppResults.map(m => (
                                                      <div key={m.id} onMouseDown={() => { setEditOppPicked(m); setEditOppSearch(m.name); }}
                                                        style={{ padding: "9px 12px", cursor: "pointer", fontFamily: F_UI, fontSize: "13px", color: TEXT, borderBottom: `1px solid ${BORDER}` }}>
                                                        {m.name}{m.phone ? <span style={{ color: TEXT3, marginLeft: "8px", fontSize: "11px" }}>{m.phone}</span> : ""}
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                                <div style={{ display: "flex", gap: "6px" }}>
                                                  <button onMouseDown={saveEditOpp} style={{ flex: 1, background: MID, border: "none", borderRadius: "7px", color: "#fff", padding: "9px", fontSize: "13px", fontFamily: F_UI, fontWeight: "700", cursor: "pointer" }}>Save</button>
                                                  <button onMouseDown={() => setEditOppTarget(null)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "7px", color: TEXT2, padding: "9px 12px", fontSize: "13px", fontFamily: F_UI, cursor: "pointer" }}>Cancel</button>
                                                </div>
                                              </div>
                                            ) : (
                                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                                                <div>
                                                  <button onClick={() => openH2H(tie.opponent)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: F_SANS, fontSize: "18px", fontWeight: "700", color: GREEN, textAlign: "left" }}>vs {tie.opponent}</button>
                                                  {tie.oppPhone && <a href={`tel:${tie.oppPhone.replace(/\s/g,"")}`} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "13px", color: GOLD, textDecoration: "none", fontFamily: F_UI, fontWeight: "500", marginTop: "3px" }}><Phone size={13} strokeWidth={1.75} />{tie.oppPhone}</a>}
                                                </div>
                                                <button onClick={() => openEditOpp(entry.id, tie.roundIdx, tie.opponent)}
                                                  style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT3, padding: "4px 9px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                                                  <Pencil size={10} strokeWidth={1.75} /> Edit
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {/* Team members for team competitions */}
                                        {tie && (() => {
                                          const ts = teamSizeFor(entry.tournamentId);
                                          if (ts === 0) return null;
                                          const myParts = entry.myPartners || [];
                                          const oppParts = tie.oppPartners || [];
                                          const isEditingOppParts = editOppPartnersTarget?.entryId === entry.id && editOppPartnersTarget?.roundIdx === rIdx;
                                          return (
                                            <div style={{ marginBottom: "12px" }}>
                                              {editMyPartnersEntryId === entry.id ? (
                                                <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "8px", padding: "10px 12px", marginBottom: "6px" }}>
                                                  <div style={{ fontSize: "10px", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Your team members</div>
                                                  {editMyPartnersVal.map((p, pi) => (
                                                    <div key={pi} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                                                      <span style={{ flex: 1, fontFamily: F_UI, fontSize: "13px", color: TEXT }}>{p.name}</span>
                                                      <button onClick={() => setEditMyPartnersVal(prev => prev.filter((_, j) => j !== pi))} style={{ background: "none", border: "none", color: TEXT3, cursor: "pointer" }}><X size={12} strokeWidth={2} /></button>
                                                    </div>
                                                  ))}
                                                  {editMyPartnersVal.length < ts && (
                                                    <div>
                                                      <input value={editMyPartnerSearch} onChange={e => setEditMyPartnerSearch(e.target.value)} placeholder="Search name…"
                                                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: "6px", fontSize: "13px", fontFamily: F_UI, outline: "none" }} />
                                                      {editMyPartnerSearch.length >= 2 && (
                                                        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "6px", marginTop: "4px", overflow: "hidden" }}>
                                                          {editMyPartnerResults.map(m => (
                                                            <div key={m.id} onClick={() => { setEditMyPartnersVal(prev => [...prev, { name: m.name, phone: m.phone || "" }]); setEditMyPartnerSearch(""); }}
                                                              style={{ padding: "8px 12px", cursor: "pointer", fontSize: "13px", fontFamily: F_UI, color: TEXT, borderBottom: `1px solid ${BORDER}` }}>{m.name}</div>
                                                          ))}
                                                          <div onClick={() => { setEditMyPartnersVal(prev => [...prev, { name: editMyPartnerSearch.toUpperCase(), phone: "" }]); setEditMyPartnerSearch(""); }}
                                                            style={{ padding: "8px 12px", cursor: "pointer", fontSize: "12px", color: GOLD_MUTED }}>+ Add manually</div>
                                                        </div>
                                                      )}
                                                    </div>
                                                  )}
                                                  <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                                                    <button onClick={() => {
                                                      setEntries(prev => prev.map(e2 => e2.id !== entry.id ? e2 : { ...e2, myPartners: editMyPartnersVal }));
                                                      setEditMyPartnersEntryId(null); setEditMyPartnerSearch("");
                                                    }} style={{ flex: 1, background: MID, border: "none", borderRadius: "6px", color: "#fff", padding: "8px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>Save</button>
                                                    <button onClick={() => { setEditMyPartnersEntryId(null); setEditMyPartnerSearch(""); }}
                                                      style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT2, padding: "8px 12px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI }}>Cancel</button>
                                                  </div>
                                                </div>
                                              ) : (
                                                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                                  <div style={{ flex: 1, fontSize: "12px", color: TEXT2, fontFamily: F_UI }}>
                                                    {myParts.length > 0 ? (
                                                      <><span style={{ fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "10px" }}>Your team: </span>{myParts.map(p => p.name).join(", ")}</>
                                                    ) : (
                                                      <span style={{ color: TEXT3, fontSize: "11px" }}>Your team not set</span>
                                                    )}
                                                  </div>
                                                  <button onClick={() => { setEditMyPartnersEntryId(entry.id); setEditMyPartnersVal(myParts.length > 0 ? [...myParts] : []); setEditMyPartnerSearch(""); }}
                                                    style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT3, padding: "3px 8px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "3px", flexShrink: 0 }}>
                                                    <Pencil size={10} strokeWidth={1.75} /> {myParts.length > 0 ? "Edit" : "Add"}
                                                  </button>
                                                </div>
                                              )}
                                              {isEditingOppParts ? (
                                                <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "8px", padding: "10px 12px" }}>
                                                  <div style={{ fontSize: "10px", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Opponent's team members</div>
                                                  {editOppPartnersVal.map((p, pi) => (
                                                    <div key={pi} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                                                      <span style={{ flex: 1, fontFamily: F_UI, fontSize: "13px", color: TEXT }}>{p.name}</span>
                                                      <button onClick={() => setEditOppPartnersVal(prev => prev.filter((_, j) => j !== pi))} style={{ background: "none", border: "none", color: TEXT3, cursor: "pointer" }}><X size={12} strokeWidth={2} /></button>
                                                    </div>
                                                  ))}
                                                  {editOppPartnersVal.length < ts && (
                                                    <div>
                                                      <input value={editOppPartnerSearch} onChange={e => setEditOppPartnerSearch(e.target.value)} placeholder="Search name…"
                                                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: "6px", fontSize: "13px", fontFamily: F_UI, outline: "none" }} />
                                                      {editOppPartnerSearch.length >= 2 && (
                                                        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "6px", marginTop: "4px", overflow: "hidden" }}>
                                                          {editOppPartnerResults.map(m => (
                                                            <div key={m.id} onClick={() => { setEditOppPartnersVal(prev => [...prev, { name: m.name, phone: m.phone || "" }]); setEditOppPartnerSearch(""); }}
                                                              style={{ padding: "8px 12px", cursor: "pointer", fontSize: "13px", fontFamily: F_UI, color: TEXT, borderBottom: `1px solid ${BORDER}` }}>{m.name}</div>
                                                          ))}
                                                          <div onClick={() => { setEditOppPartnersVal(prev => [...prev, { name: editOppPartnerSearch.toUpperCase(), phone: "" }]); setEditOppPartnerSearch(""); }}
                                                            style={{ padding: "8px 12px", cursor: "pointer", fontSize: "12px", color: GOLD_MUTED }}>+ Add manually</div>
                                                        </div>
                                                      )}
                                                    </div>
                                                  )}
                                                  <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                                                    <button onClick={() => {
                                                      setEntries(prev => prev.map(e2 => e2.id !== entry.id ? e2 : { ...e2, ties: e2.ties.map(t2 => t2.roundIdx !== rIdx ? t2 : { ...t2, oppPartners: editOppPartnersVal }) }));
                                                      setEditOppPartnersTarget(null); setEditOppPartnerSearch("");
                                                    }} style={{ flex: 1, background: MID, border: "none", borderRadius: "6px", color: "#fff", padding: "8px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>Save</button>
                                                    <button onClick={() => { setEditOppPartnersTarget(null); setEditOppPartnerSearch(""); }}
                                                      style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT2, padding: "8px 12px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI }}>Cancel</button>
                                                  </div>
                                                </div>
                                              ) : (
                                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                  <div style={{ flex: 1, fontSize: "12px", color: TEXT2, fontFamily: F_UI }}>
                                                    {oppParts.length > 0 ? (
                                                      <><span style={{ fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "10px" }}>Their team: </span>{oppParts.map(p => p.name).join(", ")}</>
                                                    ) : (
                                                      <span style={{ color: TEXT3, fontSize: "11px" }}>Their team not recorded</span>
                                                    )}
                                                  </div>
                                                  <button onClick={() => { setEditOppPartnersTarget({ entryId: entry.id, roundIdx: rIdx }); setEditOppPartnersVal(tie.oppPartners ? [...tie.oppPartners] : []); setEditOppPartnerSearch(""); }}
                                                    style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT3, padding: "3px 8px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "3px", flexShrink: 0 }}>
                                                    <Pencil size={10} strokeWidth={1.75} /> {oppParts.length > 0 ? "Edit" : "Add"}
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })()}

                                        {/* Date row for pending ties */}
                                        {tie && !tie.result && (
                                          <div style={{ marginBottom: "12px" }}>
                                            {/* Deadline block */}
                                            {sched && (
                                              <div style={{ background: schedDays < 0 ? `${LOSS_RED}08` : `${GOLD}08`, border: `1px solid ${schedDays < 0 ? `${LOSS_RED}33` : `${GOLD}33`}`, borderRadius: "8px", padding: "8px 12px", marginBottom: "8px" }}>
                                                <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: "700", color: schedDays < 0 ? LOSS_RED : GOLD_MUTED, marginBottom: "2px" }}>Must be played by</div>
                                                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                                  <span style={{ fontFamily: F_SANS, fontSize: "16px", fontWeight: "700", color: schedDays < 0 ? LOSS_RED : TEXT }}>{fmtDate(sched)}</span>
                                                  {schedDays < 0
                                                    ? <span style={{ background: `${LOSS_RED}15`, color: LOSS_RED, borderRadius: "10px", padding: "2px 8px", fontSize: "11px", fontWeight: "700", fontFamily: F_UI }}>Overdue</span>
                                                    : countdownLabel(sched) && <span style={{ background: `${GOLD}22`, color: GOLD_MUTED, borderRadius: "10px", padding: "2px 8px", fontSize: "11px", fontWeight: "700", fontFamily: F_UI }}>{countdownLabel(sched)}</span>
                                                  }
                                                </div>
                                              </div>
                                            )}
                                            {/* Personal date block */}
                                            <div style={{ background: tie.date ? `${GREEN}08` : SURFACE2, border: `1px solid ${tie.date ? `${GREEN}33` : BORDER}`, borderRadius: "8px", padding: "10px 12px" }}>
                                              {isEditingDate ? (
                                                <div>
                                                  <div style={{ fontSize: "10px", fontWeight: "700", color: GREEN, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>When are you playing?</div>
                                                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                                    <div style={{ flex: 1, minWidth: "130px" }}>
                                                      <div style={{ fontSize: "9px", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "3px" }}>Date</div>
                                                      <input type="date" value={editDateVal} onChange={e => setEditDateVal(e.target.value)}
                                                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: "6px", fontSize: "14px", fontFamily: F_UI, outline: "none", color: TEXT, background: SURFACE }} />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: "110px" }}>
                                                      <div style={{ fontSize: "9px", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "3px" }}>Time (optional)</div>
                                                      <input type="text" value={editTimeVal} onChange={e => setEditTimeVal(e.target.value)} placeholder="e.g. 6:30pm"
                                                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: "6px", fontSize: "14px", fontFamily: F_UI, outline: "none", color: TEXT, background: SURFACE }} />
                                                    </div>
                                                  </div>
                                                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                                                    <button onClick={() => saveTieDate(entry.id, tie.roundIdx)} style={{ flex: 1, background: GREEN, border: "none", borderRadius: "6px", color: "#fff", padding: "9px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>Save Date</button>
                                                    <button onClick={() => setEditingTieDate(null)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT2, padding: "9px 14px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>Cancel</button>
                                                  </div>
                                                </div>
                                              ) : tie.date ? (
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                                  <div>
                                                    <div style={{ fontSize: "9px", color: GREEN, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: "700", marginBottom: "2px" }}>You&apos;re playing</div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                                      <span style={{ fontFamily: F_SANS, fontSize: "16px", fontWeight: "700", color: GREEN }}>{fmtDate(tie.date)}</span>
                                                      {tie.time && <span style={{ fontSize: "13px", color: TEXT2 }}>{tie.time}</span>}
                                                      {countdown && <span style={{ background: GREEN, color: "#fff", borderRadius: "10px", padding: "2px 8px", fontSize: "11px", fontWeight: "700", fontFamily: F_UI }}>{countdown}</span>}
                                                    </div>
                                                  </div>
                                                  <button onClick={() => { setEditingTieDate({ entryId: entry.id, roundIdx: tie.roundIdx }); setEditDateVal(tie.date); setEditTimeVal(tie.time || ""); }}
                                                    style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT2, cursor: "pointer", padding: "5px 10px", fontSize: "11px", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                                                    <Pencil size={11} strokeWidth={1.75} /> Change
                                                  </button>
                                                </div>
                                              ) : (
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                                                  <div style={{ fontSize: "12px", color: TEXT3 }}>When are you playing this tie?</div>
                                                  <button onClick={() => { setEditingTieDate({ entryId: entry.id, roundIdx: tie.roundIdx }); setEditDateVal(sched || ""); setEditTimeVal(""); }}
                                                    style={{ background: GREEN, border: "none", borderRadius: "6px", color: "#fff", padding: "7px 14px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
                                                    <Calendar size={13} strokeWidth={2} /> Set Date
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}

                                        {/* Date display for completed ties */}
                                        {tie?.result && tie.result !== "BYE" && tie.date && (
                                          <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: TEXT3, marginBottom: "10px" }}>
                                            <Clock size={11} strokeWidth={1.75} />{fmtDate(tie.date)}{tie.time ? ` · ${tie.time}` : ""}
                                          </div>
                                        )}

                                        {/* Score section */}
                                        {tie && (isScoring ? (
                                          <div style={{ marginBottom: "12px" }}>
                                            <div style={{ fontSize: "11px", color: TEXT2, marginBottom: "8px" }}>First to 21 wins</div>
                                            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", marginBottom: "10px" }}>
                                              <div style={{ flex: 1, textAlign: "center" }}>
                                                <div style={{ fontSize: "11px", color: TEXT2, marginBottom: "4px", fontWeight: "500" }}>{myName}</div>
                                                <input type="number" min="0" value={scoreMy} onChange={e => setScoreMy(e.target.value)} autoFocus
                                                  style={{ width: "100%", boxSizing: "border-box", padding: "6px 4px", fontSize: "48px", fontFamily: F_SANS, fontWeight: "700", border: `2px solid ${GOLD}66`, borderRadius: "8px", textAlign: "center", outline: "none", color: GOLD }} />
                                              </div>
                                              <div style={{ fontSize: "20px", color: TEXT3, paddingBottom: "12px" }}>–</div>
                                              <div style={{ flex: 1, textAlign: "center" }}>
                                                <div style={{ fontSize: "11px", color: TEXT2, marginBottom: "4px", fontWeight: "500" }}>{tie.opponent}</div>
                                                <input type="number" min="0" value={scoreOppV} onChange={e => setScoreOppV(e.target.value)}
                                                  style={{ width: "100%", boxSizing: "border-box", padding: "6px 4px", fontSize: "48px", fontFamily: F_SANS, fontWeight: "700", border: `1px solid ${BORDER}`, borderRadius: "8px", textAlign: "center", outline: "none", color: TEXT }} />
                                              </div>
                                            </div>
                                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                              <button onClick={() => submitEntryScore(entry.id, tie.roundIdx)} style={{ flex: 1, background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "11px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>Save Score</button>
                                              <button onClick={() => { markBye(entry.id, tie.roundIdx); setScoringInfo(null); setScoreMy(""); setScoreOppV(""); }} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "11px 16px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600" }}>Bye</button>
                                              <button onClick={() => { setScoringInfo(null); setScoreMy(""); setScoreOppV(""); }} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "11px 12px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>Cancel</button>
                                            </div>
                                          </div>
                                        ) : tie.result !== null ? (
                                          <div style={{ marginBottom: "10px" }}>
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "8px" }}>
                                              <div style={{ fontSize: "15px", fontWeight: "700", color: tie.result === "W" ? WIN_GOLD : tie.result === "BYE" ? GOLD_MUTED : LOSS_RED }}>
                                                {tie.result === "W" && `Won ${tie.myScore}–${tie.oppScore}`}
                                                {tie.result === "L" && `Lost ${tie.myScore}–${tie.oppScore}`}
                                                {tie.result === "BYE" && "Bye — advanced"}
                                              </div>
                                              <div style={{ display: "flex", gap: "5px" }}>
                                                <button onClick={() => shareResult(tie, entry.tournamentName)} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT2, padding: "6px 10px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                                                  <RefreshCw size={10} strokeWidth={2} /> Share
                                                </button>
                                                <button onClick={() => { setScoringInfo({ entryId: entry.id, roundIdx: tie.roundIdx }); setScoreMy(tie.myScore?.toString() || ""); setScoreOppV(tie.oppScore?.toString() || ""); }} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT2, padding: "6px 10px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                                                  <Pencil size={11} strokeWidth={2} /> Edit
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        ) : (
                                          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                                            <button onClick={() => { setScoringInfo({ entryId: entry.id, roundIdx: tie.roundIdx }); setScoreMy(""); setScoreOppV(""); }} style={{ flex: 1, background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "10px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>Enter Score</button>
                                            <button onClick={() => markBye(entry.id, tie.roundIdx)} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "10px 14px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600" }}>Bye</button>
                                          </div>
                                        ))}

                                        {/* Notes */}
                                        {tie && noteKey && tie.result !== "BYE" && (
                                          <div>
                                            {isEditingNoteHere ? (
                                              <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                                                <input value={editingNote.value} onChange={e => setEditingNote(n => ({ ...n, value: e.target.value }))} placeholder={`Note about ${tie.opponent}…`} autoFocus
                                                  style={{ flex: 1, padding: "6px 9px", border: `1px solid ${BORDER}`, borderRadius: "6px", fontSize: "12px", fontFamily: F_UI, outline: "none", color: TEXT, background: SURFACE }} />
                                                <button onClick={() => saveOppNote(noteKey, editingNote.value)} style={{ background: MID, border: "none", borderRadius: "6px", color: "#fff", padding: "6px 10px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600" }}>Save</button>
                                                <button onClick={() => setEditingNote(null)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT2, padding: "6px 8px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI }}><X size={11} strokeWidth={2} /></button>
                                              </div>
                                            ) : note ? (
                                              <div style={{ display: "flex", gap: "6px", alignItems: "flex-start", background: `${GOLD}0a`, borderRadius: "6px", padding: "8px 10px", border: `1px solid ${GOLD}22` }}>
                                                <div style={{ flex: 1, fontSize: "12px", color: TEXT2, fontFamily: F_UI, lineHeight: 1.5 }}>{note}</div>
                                                <button onClick={() => setEditingNote({ key: noteKey, value: note })} style={{ background: "none", border: "none", color: GOLD_MUTED, cursor: "pointer", padding: "0", flexShrink: 0 }}><Pencil size={11} strokeWidth={1.75} /></button>
                                              </div>
                                            ) : (
                                              <button onClick={() => setEditingNote({ key: noteKey, value: "" })}
                                                style={{ background: "none", border: `1px dashed ${BORDER}`, borderRadius: "6px", padding: "6px 10px", color: GOLD_MUTED, fontSize: "11px", cursor: "pointer", fontFamily: F_UI, display: "inline-flex", alignItems: "center", gap: "4px", width: "100%", justifyContent: "center" }}>
                                                <Plus size={11} strokeWidth={2} /> Add note about {tie.opponent}
                                              </button>
                                            )}
                                          </div>
                                        )}

                                        {/* Next round prompt (isNext panel) */}
                                        {isNext && !tie && nextRoundFor !== entry.id && (
                                          <button onClick={() => { setNextRoundFor(entry.id); setNextOppSearch(""); setNextOppPicked(null); setNextDate(getRoundDateForComp(entry.tournamentId, rIdx)); setNextTime(""); }}
                                            style={{ width: "100%", background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "10px 20px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>
                                            + Set {roundLabel} Opponent
                                          </button>
                                        )}

                                        {/* Advance button */}
                                        {tie && (tie.result === "W" || tie.result === "BYE") && rIdx < entry.totalRounds - 1 && entry.ties.length === rIdx + 1 && nextRoundFor !== entry.id && (
                                          <button onClick={() => { setNextRoundFor(entry.id); setNextOppSearch(""); setNextOppPicked(null); setNextDate(getRoundDateForComp(entry.tournamentId, rIdx + 1)); setNextTime(""); setActiveRound(rIdx + 1); }}
                                            style={{ marginTop: "10px", width: "100%", background: GOLD, border: "none", borderRadius: "8px", color: "#4a0e1f", padding: "11px 20px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                                            Next Round <ChevronRight size={15} strokeWidth={2.5} /> {getRoundLabel(rIdx + 1, entry.totalRounds)}
                                          </button>
                                        )}

                                        {/* Champion banner */}
                                        {tie && (tie.result === "W" || tie.result === "BYE") && rIdx === entry.totalRounds - 1 && (
                                          <div style={{ marginTop: "10px", padding: "10px 14px", background: "#fffbf0", border: `1px solid ${GOLD}`, borderRadius: "8px", fontSize: "14px", fontWeight: "700", color: "#4a0e1f", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                                            <Trophy size={18} strokeWidth={2} /> Tournament Winner!
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Add next round form */}
                            {nextRoundFor === entry.id && (
                              <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "16px", marginTop: "4px" }}>
                                <div style={{ fontFamily: F_SANS, fontSize: "18px", fontWeight: "600", color: GREEN, marginBottom: "14px" }}>
                                  {getRoundLabel(entry.ties.length, entry.totalRounds)} — Who do you play?
                                </div>
                                {nextOppPicked ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                                    <MemberPill name={nextOppPicked.name} phone={nextOppPicked.phone} />
                                    <button onClick={() => { setNextOppPicked(null); setNextOppSearch(""); }} style={{ background: "none", border: "none", color: TEXT2, cursor: "pointer" }}><X size={14} strokeWidth={2} /></button>
                                  </div>
                                ) : (
                                  <div style={{ marginBottom: "12px" }}>
                                    <input value={nextOppSearch} onChange={e => setNextOppSearch(e.target.value)} placeholder="Search or type opponent name…"
                                      style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "14px", outline: "none", fontFamily: F_UI }} />
                                    {nextOppSearch.length >= 2 && (
                                      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", marginTop: "4px", overflow: "hidden", boxShadow: "0 2px 8px rgba(74,14,31,0.1)" }}>
                                        {nextOppResults.map(m => (
                                          <div key={m.id} onClick={() => { setNextOppPicked(m); setNextOppSearch(""); }}
                                            style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
                                            <span style={{ fontSize: "14px", fontWeight: "600", color: TEXT, fontFamily: F_SANS }}>{m.name}</span>
                                            {m.phone && <a href={`tel:${m.phone.replace(/\s/g,"")}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: GOLD, textDecoration: "none", fontFamily: F_UI, fontWeight: "500" }}><Phone size={12} strokeWidth={1.75} />{m.phone}</a>}
                                          </div>
                                        ))}
                                        <div onClick={() => { setNextOppPicked({ name: nextOppSearch.toUpperCase(), phone: "" }); setNextOppSearch(""); }}
                                          style={{ padding: "10px 14px", cursor: "pointer", fontSize: "12px", color: GREEN, fontWeight: "600", borderTop: `1px solid ${BORDER}` }}>
                                          + Add &ldquo;{nextOppSearch.toUpperCase()}&rdquo; manually
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {teamSizeFor(entry.tournamentId) > 0 && (
                                  <div style={{ marginBottom: "12px" }}>
                                    <div style={{ fontSize: "10px", color: TEXT3, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1.5px" }}>
                                      Their partner{teamSizeFor(entry.tournamentId) > 1 ? "s" : ""} <span style={{ fontWeight: "400" }}>({nextOppPartners.length}/{teamSizeFor(entry.tournamentId)}) — optional</span>
                                    </div>
                                    {nextOppPartners.map((p, i) => (
                                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                                        <MemberPill name={p.name} phone={p.phone} />
                                        <button onClick={() => setNextOppPartners(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: TEXT2, cursor: "pointer" }}><X size={14} strokeWidth={2} /></button>
                                      </div>
                                    ))}
                                    {nextOppPartners.length < teamSizeFor(entry.tournamentId) && (
                                      <div>
                                        <input value={nextOppPartnerSearch} onChange={e => setNextOppPartnerSearch(e.target.value)} placeholder="Search partner by surname…"
                                          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "14px", outline: "none", fontFamily: F_UI }} />
                                        {nextOppPartnerSearch.length >= 2 && (
                                          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", marginTop: "4px", overflow: "hidden" }}>
                                            {nextOppPartnerResults.map(m => (
                                              <div key={m.id} onClick={() => { setNextOppPartners(prev => [...prev, { name: m.name, phone: m.phone || "" }]); setNextOppPartnerSearch(""); }}
                                                style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
                                                <span style={{ fontSize: "14px", fontWeight: "600", color: TEXT, fontFamily: F_SANS }}>{m.name}</span>
                                                {m.phone && <span style={{ fontSize: "12px", color: GOLD }}>{m.phone}</span>}
                                              </div>
                                            ))}
                                            <div onClick={() => { setNextOppPartners(prev => [...prev, { name: nextOppPartnerSearch.toUpperCase(), phone: "" }]); setNextOppPartnerSearch(""); }}
                                              style={{ padding: "10px 14px", cursor: "pointer", fontSize: "12px", color: GOLD_MUTED, borderTop: `1px solid ${BORDER}` }}>
                                              + Add &ldquo;{nextOppPartnerSearch.toUpperCase()}&rdquo; manually
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {(() => {
                                  const nextIdx = entry.ties.length;
                                  const autoDate = getRoundDateForComp(entry.tournamentId, nextIdx);
                                  const isAuto = nextDate && nextDate === autoDate;
                                  return (
                                    <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "1px" }}>
                                          Date {isAuto && <span style={{ color: GREEN, textTransform: "none", letterSpacing: 0, display: "inline-flex", alignItems: "center", gap: "3px" }}><Check size={11} strokeWidth={2} /> from draw</span>}
                                        </div>
                                        <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)}
                                          style={{ width: "100%", padding: "8px 10px", border: `1px solid ${isAuto ? GREEN+"55" : BORDER}`, borderRadius: "7px", fontSize: "13px", fontFamily: F_UI, outline: "none" }} />
                                      </div>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "1px" }}>Time</div>
                                        <input type="text" value={nextTime} onChange={e => setNextTime(e.target.value)} placeholder="e.g. 6:30pm"
                                          style={{ width: "100%", padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: "7px", fontSize: "13px", fontFamily: F_UI, outline: "none" }} />
                                      </div>
                                    </div>
                                  );
                                })()}
                                <div style={{ display: "flex", gap: "8px" }}>
                                  <button onClick={() => doAddNextRound(entry.id)} disabled={!nextOppPicked}
                                    style={{ flex: 1, background: nextOppPicked ? MID : BORDER, border: "none", borderRadius: "8px", color: nextOppPicked ? "#fff" : TEXT3, padding: "11px", fontSize: "13px", cursor: nextOppPicked ? "pointer" : "default", fontFamily: F_UI, fontWeight: "700" }}>
                                    Confirm
                                  </button>
                                  <button onClick={() => setNextRoundFor(null)}
                                    style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "11px 16px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>Cancel</button>
                                </div>
                              </div>
                            )}
                          </BottomSheet>
                        );
                      })()}

                      {/* ══ BOTTOM SHEET: Add Tournament ══ */}
                      <BottomSheet open={showEntrySheet} onClose={() => { setShowEntrySheet(false); setEntryJustSaved(false); setEntryRound1Bye(false); setEntryOppPicked(null); setEntryOppSearch(""); setEntryMyPartners([]); setEntryPartnerSearch(""); setAdhocCompName(""); setEntryTournId(""); }} title="Add Tournament">
                        {entryJustSaved ? (
                          <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
                            <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
                              <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: `${GREEN}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Check size={28} strokeWidth={2.5} color={GREEN} />
                              </div>
                            </div>
                            <div style={{ fontFamily: F_SANS, fontSize: "22px", fontWeight: "700", color: GREEN, marginBottom: "6px" }}>Added!</div>
                            <div style={{ fontFamily: F_UI, fontSize: "14px", color: TEXT2, marginBottom: "28px" }}>{lastAddedTournName}</div>
                            <div style={{ display: "flex", gap: "10px" }}>
                              <button onClick={() => setEntryJustSaved(false)}
                                style={{ flex: 1, background: MID, border: "none", borderRadius: "10px", color: "#fff", padding: "13px", fontSize: "14px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>
                                Add another
                              </button>
                              <button onClick={() => { setEntryJustSaved(false); setShowEntrySheet(false); }}
                                style={{ flex: 1, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", color: TEXT, padding: "13px", fontSize: "14px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600" }}>
                                Done
                              </button>
                            </div>
                          </div>
                        ) : <>
                        <div style={{ marginBottom: "16px" }}>
                          <div style={{ fontSize: "10px", color: TEXT3, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "1.5px" }}>Competition</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                            {TOURNAMENTS.map(t => (
                              <button key={t.id} onClick={() => {
                                  setEntryTournId(t.id); setAdhocCompName("");
                                  setEntryDate(getRoundDateForComp(t.id, 0));
                                  if (t.id !== "balloted-pairs" && teamPartners[t.id]?.length > 0) {
                                    setEntryMyPartners(teamPartners[t.id]);
                                  } else {
                                    setEntryMyPartners([]);
                                  }
                                  setEntryPartnerSearch("");
                                }} style={{
                                background: entryTournId === t.id ? MID : SURFACE2,
                                border: `1px solid ${entryTournId === t.id ? MID : BORDER}`,
                                borderRadius: "20px", color: entryTournId === t.id ? "#fff" : TEXT,
                                padding: "7px 14px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI,
                                fontWeight: entryTournId === t.id ? "600" : "400",
                              }}>{t.name}</button>
                            ))}
                            {/* Ad-hoc pill */}
                            <button onClick={() => { setEntryTournId("__adhoc__"); setEntryDate(""); setEntryMyPartners([]); }}
                              style={{ background: entryTournId === "__adhoc__" ? GREEN : SURFACE2, border: `1px solid ${entryTournId === "__adhoc__" ? GREEN : BORDER}`, borderRadius: "20px", color: entryTournId === "__adhoc__" ? "#fff" : TEXT2, padding: "7px 14px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: entryTournId === "__adhoc__" ? "600" : "400" }}>
                              + Other / External
                            </button>
                          </div>
                          {/* Ad-hoc name input */}
                          {entryTournId === "__adhoc__" && (
                            <div style={{ marginTop: "10px" }}>
                              <input
                                autoFocus
                                value={adhocCompName}
                                onChange={e => setAdhocCompName(e.target.value)}
                                placeholder="Competition name…"
                                style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", border: `1px solid ${GREEN}`, borderRadius: "10px", fontSize: "15px", fontFamily: F_UI, color: TEXT, background: SURFACE, outline: "none" }}
                              />
                              <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "5px" }}>This will be saved as your own personal competition</div>
                            </div>
                          )}
                        </div>
                        {(entryTournId && entryTournId !== "__adhoc__") && !(TOURNAMENTS.find(t => t.id === entryTournId)?.rounds?.length > 0) && (
                          <div style={{ marginBottom: "16px" }}>
                            <div style={{ fontSize: "10px", color: TEXT3, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1.5px" }}>Number of Rounds</div>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {[1,2,3,4,5,6].map(n => (
                                <button key={n} onClick={() => setEntryRounds(n)} style={{
                                  background: entryRounds === n ? MID : SURFACE, border: `1px solid ${entryRounds === n ? MID : BORDER}`,
                                  borderRadius: "8px", color: entryRounds === n ? "#fff" : TEXT,
                                  padding: "8px 16px", fontSize: "16px", cursor: "pointer", fontFamily: F_SANS, fontWeight: "600",
                                }}>{n}</button>
                              ))}
                            </div>
                            <div style={{ fontSize: "10px", color: TEXT3, marginTop: "6px" }}>
                              {Array.from({ length: entryRounds }, (_, i) => getRoundLabel(i, entryRounds)).join(" → ")}
                            </div>
                          </div>
                        )}
                        {entryTournId && teamSizeFor(entryTournId) > 0 && (
                          <div style={{ marginBottom: "16px" }}>
                            <div style={{ fontSize: "10px", color: TEXT3, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1.5px" }}>
                              Your Partner{teamSizeFor(entryTournId) > 1 ? "s" : ""} <span style={{ color: TEXT3, fontWeight: "400" }}>({entryMyPartners.length}/{teamSizeFor(entryTournId)}) — optional</span>
                            </div>
                            {entryMyPartners.map((p, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                                <MemberPill name={p.name} phone={p.phone} />
                                <button onClick={() => setEntryMyPartners(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: TEXT2, cursor: "pointer" }}><X size={14} strokeWidth={2} /></button>
                              </div>
                            ))}
                            {entryMyPartners.length < teamSizeFor(entryTournId) && (
                              <div>
                                <input value={entryPartnerSearch} onChange={e => setEntryPartnerSearch(e.target.value)} placeholder="Search partner by surname…"
                                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "14px", outline: "none", fontFamily: F_UI }} />
                                {entryPartnerSearch.length >= 2 && (
                                  <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", marginTop: "4px", overflow: "hidden" }}>
                                    {entryPartnerResults.map(m => (
                                      <div key={m.id} onClick={() => { setEntryMyPartners(prev => [...prev, { name: m.name, phone: m.phone || "" }]); setEntryPartnerSearch(""); }}
                                        style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ fontSize: "14px", fontWeight: "600", color: TEXT, fontFamily: F_SANS }}>{m.name}</span>
                                        {m.phone && <span style={{ fontSize: "12px", color: GOLD }}>{m.phone}</span>}
                                      </div>
                                    ))}
                                    <div onClick={() => { setEntryMyPartners(prev => [...prev, { name: entryPartnerSearch.toUpperCase(), phone: "" }]); setEntryPartnerSearch(""); }}
                                      style={{ padding: "10px 14px", cursor: "pointer", fontSize: "12px", color: GOLD_MUTED, borderTop: `1px solid ${BORDER}` }}>
                                      + Add &ldquo;{entryPartnerSearch.toUpperCase()}&rdquo; manually
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{ marginBottom: "16px" }}>
                          <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1.5px" }}>Round 1 Opponent</div>
                          {entryRound1Bye ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{ flex: 1, background: `${GOLD_MUTED}12`, border: `1px solid ${GOLD_MUTED}44`, borderRadius: "8px", padding: "10px 14px", fontFamily: F_UI, fontSize: "13px", color: GOLD_MUTED, fontWeight: "600" }}>Bye — advanced automatically</div>
                              <button onClick={() => setEntryRound1Bye(false)} style={{ background: "none", border: "none", color: TEXT2, cursor: "pointer" }}><X size={14} strokeWidth={2} /></button>
                            </div>
                          ) : entryOppPicked ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <MemberPill name={entryOppPicked.name} phone={entryOppPicked.phone} />
                              <button onClick={() => { setEntryOppPicked(null); setEntryOppSearch(""); }} style={{ background: "none", border: "none", color: TEXT2, cursor: "pointer" }}><X size={14} strokeWidth={2} /></button>
                            </div>
                          ) : (
                            <>
                              <input value={entryOppSearch} onChange={e => setEntryOppSearch(e.target.value)} placeholder="Type surname to search…"
                                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "14px", outline: "none", fontFamily: F_UI }} />
                              {entryOppSearch.length >= 2 && (
                                <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", marginTop: "4px", overflow: "hidden", boxShadow: "0 2px 8px rgba(74,14,31,0.1)" }}>
                                  {entryOppResults.map(m => (
                                    <div key={m.id} onClick={() => { setEntryOppPicked(m); setEntryOppSearch(""); }}
                                      style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
                                      <span style={{ fontSize: "14px", fontWeight: "600", color: TEXT, fontFamily: F_SANS }}>{m.name}</span>
                                      {m.phone && <a href={`tel:${m.phone.replace(/\s/g,"")}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: GOLD, textDecoration: "none", fontFamily: F_UI, fontWeight: "500" }}><Phone size={12} strokeWidth={1.75} />{m.phone}</a>}
                                    </div>
                                  ))}
                                  <div onClick={() => { setEntryOppPicked({ name: entryOppSearch.toUpperCase(), phone: "" }); setEntryOppSearch(""); }}
                                    style={{ padding: "10px 14px", cursor: "pointer", fontSize: "12px", color: GOLD_MUTED, borderTop: `1px solid ${BORDER}` }}>
                                    + Add &ldquo;{entryOppSearch.toUpperCase()}&rdquo; manually
                                  </div>
                                </div>
                              )}
                              <button onClick={() => { setEntryRound1Bye(true); setEntryOppPicked(null); setEntryOppSearch(""); }}
                                style={{ marginTop: "8px", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "9px 16px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600", width: "100%" }}>
                                Got a bye? Tap here
                              </button>
                            </>
                          )}
                        </div>
                        {!entryRound1Bye && (
                          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "1px" }}>
                                Date {entryDate && entryTournId && entryDate === getRoundDateForComp(entryTournId, 0) && <span style={{ color: GREEN, textTransform: "none", letterSpacing: 0, display: "inline-flex", alignItems: "center", gap: "3px" }}><Check size={11} strokeWidth={2} /> from draw</span>}
                              </div>
                              <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
                                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: "7px", fontSize: "13px", fontFamily: F_UI, outline: "none" }} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "1px" }}>Time</div>
                              <input type="text" value={entryTime} onChange={e => setEntryTime(e.target.value)} placeholder="e.g. 6:30pm"
                                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: "7px", fontSize: "13px", fontFamily: F_UI, outline: "none" }} />
                            </div>
                          </div>
                        )}
                        <div style={{ display: "flex", gap: "8px" }}>
                          {(() => { const canSave = entryTournId && (entryTournId !== "__adhoc__" || adhocCompName.trim()); return (
                          <button onClick={createEntry} disabled={!canSave}
                            style={{ flex: 1, background: canSave ? MID : BORDER, border: "none", borderRadius: "8px", color: canSave ? "#fff" : TEXT3, padding: "12px", fontSize: "13px", cursor: canSave ? "pointer" : "default", fontFamily: F_UI, fontWeight: "700" }}>
                            Save
                          </button>
                          ); })()}
                          <button onClick={() => { setEntryJustSaved(false); setShowEntrySheet(false); }} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "12px 16px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>Cancel</button>
                        </div>
                        </>}
                      </BottomSheet>

                    </>
                  );
                })()}

              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════
            FIND GAMES TAB
        ══════════════════════════════════════════ */}
        {activeTab === "search" && (
          <FindTab search={search} setSearch={setSearch} playerGames={playerGames} tournaments={TOURNAMENTS} publishedDraws={publishedDraws} drawPairings={drawPairings} onH2H={openH2H} />
        )}

        {/* ══════════════════════════════════════════
            LIVE GAMES TAB
        ══════════════════════════════════════════ */}
        {activeTab === "live" && (
          <LiveGamesTab myName={myName} cloudKey={cloudKey} myMemberId={linkedMemberId} isAdmin={isAdmin} setActiveTab={setActiveTab} members={members}
            deepLinkGameId={deepLinkGameId} onDeepLinkHandled={() => setDeepLinkGameId(null)} />
        )}

        {/* ══════════════════════════════════════════
            CLUB TAB — the club itself, then the member's own honours

            Honours used to be a tab of its own. It gave its slot up to What's
            On: the bar has room for what people check weekly, and a personal
            honours list is a look-once-then-occasionally thing however good it
            is. Nothing about it changed except where you get to it.
        ══════════════════════════════════════════ */}
        {activeTab === "club" && (() => {
          const posCol  = p => p === "Winner" ? WIN_GOLD : p === "Runner-Up" ? GOLD_MUTED : p === "Semi-Final" ? TEXT2 : TEXT3;
          const posBg   = p => p === "Winner" ? `${WIN_GOLD}12` : p === "Runner-Up" ? `${GOLD_MUTED}12` : SURFACE2;
          const posBorder = p => p === "Winner" ? `${WIN_GOLD}55` : p === "Runner-Up" ? `${GOLD_MUTED}55` : BORDER;

          const grouped = honoursGrouped;
          const years   = honoursYears;

          return (
            <div>
              <ClubTab members={members} showPhones={signedIn} rollOfHonour={rollOfHonour}
                honoraryMembers={honoraryMembers} rollOfHonourLoad={rollOfHonourLoad} honoraryLoad={honoraryLoad}
                isAdmin={isAdmin} recordWinner={recordWinner}
                addHonoraryMember={addHonoraryMember} removeHonoraryMember={removeHonoraryMember} />

              {/* ── My Honours — the club's roll of honour is above, this is yours ── */}
              <div style={{ maxWidth: "520px", margin: "0 auto", borderTop: `1px solid ${BORDER}`, paddingTop: "22px", marginTop: "8px" }} id="my-honours">
              {/* Hero header */}
              <div style={{ background: GREEN, borderRadius: "14px", padding: "20px", marginBottom: "16px", boxShadow: "0 4px 16px rgba(74,14,31,0.18)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                  <Medal size={26} strokeWidth={1.5} color={GOLD} />
                  <div>
                    <div style={{ fontFamily: F_SANS, fontSize: "22px", fontWeight: "700", color: "#fff", lineHeight: 1 }}>
                      {myName ? `${myName}'s Honours` : "My Honours"}
                    </div>
                    <div style={{ fontFamily: F_UI, fontSize: "12px", color: "rgba(255,255,255,0.7)", marginTop: "3px" }}>
                      {myHonours.length === 0 ? "No honours yet — add your first below" : `${myHonours.length} achievement${myHonours.length !== 1 ? "s" : ""} · ${years.length} season${years.length !== 1 ? "s" : ""}`}
                    </div>
                  </div>
                </div>
                {/* Stats pills */}
                {myHonours.length > 0 && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                    {["Winner","Runner-Up","Semi-Final","Quarter-Final","Finalist"].map(pos => {
                      const count = myHonours.filter(h => h.position === pos).length;
                      if (!count) return null;
                      return (
                        <span key={pos} style={{ background: "rgba(255,255,255,0.15)", borderRadius: "10px", padding: "3px 10px", fontFamily: F_UI, fontSize: "11px", color: "#fff", fontWeight: "600" }}>
                          {pos}: {count}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Add button */}
              <button onClick={() => { if (!myName) { navigateTo("myties"); return; } openAddHonour(); }}
                style={{ width: "100%", background: MID, border: "none", borderRadius: "10px", color: "#fff", padding: "13px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "20px" }}>
                <Plus size={16} strokeWidth={2.5} /> Add Honour
              </button>

              {/* Empty state */}
              {myHonours.length === 0 && (
                <div style={{ background: SURFACE, border: `1px dashed ${BORDER}`, borderRadius: "12px", padding: "40px 24px", textAlign: "center" }}>
                  <Medal size={36} strokeWidth={1} color={BORDER} style={{ marginBottom: "12px" }} />
                  <div style={{ fontFamily: F_SANS, fontSize: "20px", fontWeight: "600", color: TEXT2, marginBottom: "6px" }}>No honours yet</div>
                  <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT3, lineHeight: 1.6 }}>Record competitions you've won, finals you've reached, or any achievement you're proud of.</div>
                </div>
              )}

              {/* Honours by year — collapsible */}
              {years.map(year => {
                const isOpen = openHonourYears.has(year);
                const toggle = () => setOpenHonourYears(prev => {
                  const next = new Set(prev);
                  if (next.has(year)) next.delete(year); else next.add(year);
                  return next;
                });
                return (
                  <div key={year} style={{ marginBottom: "12px" }}>
                    <button onClick={toggle} style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", marginBottom: isOpen ? "8px" : "0" }}>
                      <div style={{ fontFamily: F_SANS, fontSize: "22px", fontWeight: "700", color: GREEN }}>{year}</div>
                      <div style={{ flex: 1, height: "1px", background: BORDER }} />
                      <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>{grouped[year].length} achievement{grouped[year].length !== 1 ? "s" : ""}</div>
                      <ChevronDown size={15} strokeWidth={2} color={TEXT3} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
                    </button>
                    {isOpen && grouped[year].map(h => (
                      <div key={h.id} style={{ background: SURFACE, border: `1px solid ${posBorder(h.position)}`, borderLeft: `4px solid ${posCol(h.position)}`, borderRadius: "12px", padding: "14px 16px", marginBottom: "8px", boxShadow: "0 1px 4px rgba(74,14,31,0.06)" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: F_SANS, fontSize: "19px", fontWeight: "700", color: TEXT, lineHeight: 1.2, marginBottom: "5px" }}>{h.competition}</div>
                            <span style={{ display: "inline-block", fontFamily: F_UI, fontSize: "11px", fontWeight: "700", color: posCol(h.position), background: posBg(h.position), border: `1px solid ${posCol(h.position)}33`, borderRadius: "10px", padding: "2px 9px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              {h.position === "Winner" && "🏆 "}{h.position}
                            </span>
                            {h.notes && (
                              <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, marginTop: "6px", lineHeight: 1.5 }}>{h.notes}</div>
                            )}
                          </div>
                          <button onClick={() => openEditHonour(h)}
                            style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: "6px", color: TEXT3, cursor: "pointer", padding: "10px 12px", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "11px", fontFamily: F_UI, minHeight: "44px" }}>
                            <Pencil size={11} strokeWidth={1.75} /> Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Honours sheet */}
              <BottomSheet open={showHonoursSheet} onClose={() => setShowHonoursSheet(false)} title={editHonourId ? "Edit Honour" : "Add Honour"}>
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div>
                    <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Competition</div>
                    <input value={honourComp} onChange={e => setHonourComp(e.target.value)} placeholder="e.g. Club Championship, Mitchell Handicap…" autoFocus
                      style={{ width: "100%", boxSizing: "border-box", padding: "12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "15px", fontFamily: F_UI, outline: "none", color: TEXT, background: SURFACE }} />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "7px" }}>
                      {TOURNAMENTS.map(t => (
                        <button key={t.id} onClick={() => setHonourComp(t.name)}
                          style={{ background: honourComp === t.name ? MID : SURFACE2, border: `1px solid ${honourComp === t.name ? MID : BORDER}`, borderRadius: "16px", color: honourComp === t.name ? "#fff" : TEXT2, padding: "4px 10px", fontSize: "11px", cursor: "pointer", fontFamily: F_UI, fontWeight: honourComp === t.name ? "600" : "400" }}>
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "7px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Position / Achievement</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                      {["Winner", "Runner-Up", "Semi-Final", "Quarter-Final", "Finalist", "Other"].map(pos => (
                        <button key={pos} onClick={() => setHonourPosition(pos)}
                          style={{ padding: "10px 8px", borderRadius: "8px", cursor: "pointer", fontFamily: F_UI, fontSize: "12px", fontWeight: honourPosition === pos ? "700" : "400", textAlign: "center",
                            background: honourPosition === pos ? (pos === "Winner" ? WIN_GOLD : pos === "Runner-Up" ? `${GOLD_MUTED}22` : SURFACE2) : SURFACE2,
                            border: `2px solid ${honourPosition === pos ? (pos === "Winner" ? WIN_GOLD : pos === "Runner-Up" ? GOLD_MUTED : GREEN) : BORDER}`,
                            color: honourPosition === pos ? (pos === "Winner" ? "#4a0e1f" : GREEN) : TEXT2
                          }}>
                          {pos === "Winner" && "🏆 "}{pos}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Year</div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - i)).map(yr => (
                        <button key={yr} onClick={() => setHonourYear(yr)}
                          style={{ background: honourYear === yr ? MID : SURFACE2, border: `1px solid ${honourYear === yr ? MID : BORDER}`, borderRadius: "6px", color: honourYear === yr ? "#fff" : TEXT, padding: "7px 12px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: honourYear === yr ? "700" : "400" }}>
                          {yr}
                        </button>
                      ))}
                      <input value={honourYear} onChange={e => setHonourYear(e.target.value)} placeholder="Other year"
                        style={{ width: "80px", padding: "7px 10px", border: `1px solid ${BORDER}`, borderRadius: "6px", fontSize: "13px", fontFamily: F_UI, outline: "none", color: TEXT, background: SURFACE }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Notes (optional)</div>
                    <input value={honourNotes} onChange={e => setHonourNotes(e.target.value)} placeholder="e.g. Beat J Smith 21–14 in the final"
                      style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "13px", fontFamily: F_UI, outline: "none", color: TEXT, background: SURFACE }} />
                  </div>

                  <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                    <button onClick={saveHonour} disabled={!honourComp.trim()}
                      style={{ flex: 1, background: honourComp.trim() ? MID : BORDER, border: "none", borderRadius: "8px", color: honourComp.trim() ? "#fff" : TEXT3, padding: "13px", fontSize: "14px", cursor: honourComp.trim() ? "pointer" : "default", fontFamily: F_UI, fontWeight: "700" }}>
                      {editHonourId ? "Save Changes" : "Add to Honours"}
                    </button>
                    {editHonourId && (
                      <button onClick={() => { deleteHonour(editHonourId); setShowHonoursSheet(false); }}
                        style={{ background: SURFACE, border: `1px solid #e8c5c5`, borderRadius: "8px", color: LOSS_RED, padding: "13px 16px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>
                        Delete
                      </button>
                    )}
                    <button onClick={() => setShowHonoursSheet(false)}
                      style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "13px 16px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </BottomSheet>

              {/* ══ HEAD-TO-HEAD SHEET ══ */}
              {(() => {
                const h2h = h2hOpponent ? getHeadToHead(entries, myName, h2hOpponent) : null;
                return (
                  <BottomSheet open={!!h2hOpponent} onClose={() => setH2hOpponent(null)} title={h2hOpponent || ""} titleColor={GOLD}>
                    {h2h && (
                      <div>
                        {/* Record bar */}
                        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                          <div style={{ flex: 1, textAlign: "center", background: WIN_BG, border: `1px solid ${WIN_GOLD}44`, borderRadius: "10px", padding: "12px 8px" }}>
                            <div style={{ fontFamily: F_SANS, fontSize: "32px", fontWeight: "700", color: WIN_GOLD, lineHeight: 1 }}>{h2h.wins}</div>
                            <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: WIN_GOLD, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "4px" }}>Won</div>
                          </div>
                          <div style={{ flex: 1, textAlign: "center", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "12px 8px" }}>
                            <div style={{ fontFamily: F_SANS, fontSize: "32px", fontWeight: "700", color: TEXT2, lineHeight: 1 }}>{h2h.played}</div>
                            <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "4px" }}>Played</div>
                          </div>
                          <div style={{ flex: 1, textAlign: "center", background: LOSS_BG, border: `1px solid ${LOSS_RED}44`, borderRadius: "10px", padding: "12px 8px" }}>
                            <div style={{ fontFamily: F_SANS, fontSize: "32px", fontWeight: "700", color: LOSS_RED, lineHeight: 1 }}>{h2h.losses}</div>
                            <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: LOSS_RED, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "4px" }}>Lost</div>
                          </div>
                        </div>

                        {/* Match list */}
                        {h2h.matches.length === 0 ? (
                          <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "28px", textAlign: "center" }}>
                            <div style={{ fontFamily: F_SANS, fontSize: "17px", fontWeight: "600", color: TEXT2, marginBottom: "4px" }}>No completed games yet</div>
                            <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3 }}>Results will appear here once you've played {h2hOpponent}</div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: GOLD_MUTED, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "8px" }}>Match History</div>
                            {h2h.matches.map((m, i) => (
                              <div key={i} style={{
                                display: "flex", alignItems: "center", gap: "12px",
                                background: m.result === "W" ? WIN_BG : LOSS_BG,
                                border: `1px solid ${m.result === "W" ? WIN_GOLD + "44" : LOSS_RED + "44"}`,
                                borderLeft: `3px solid ${m.result === "W" ? WIN_GOLD : LOSS_RED}`,
                                borderRadius: "8px", padding: "11px 13px", marginBottom: "7px",
                              }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "600", color: TEXT2, marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {m.tournamentName} · {m.roundLabel}
                                  </div>
                                  {m.date && (
                                    <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, display: "flex", alignItems: "center", gap: "4px" }}>
                                      <Clock size={10} strokeWidth={1.75} />{fmtDate(m.date)}
                                    </div>
                                  )}
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                  <div style={{ fontFamily: F_SANS, fontSize: "18px", fontWeight: "700", color: m.result === "W" ? WIN_GOLD : LOSS_RED, lineHeight: 1 }}>
                                    {m.myScore}–{m.oppScore}
                                  </div>
                                  <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: m.result === "W" ? WIN_GOLD : LOSS_RED, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "2px" }}>
                                    {m.result === "W" ? "Won" : "Lost"}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </BottomSheet>
                );
              })()}
              </div>
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════
            DRAWS TAB — personal competition view
        ══════════════════════════════════════════ */}
        {activeTab === "tournaments" && !signedIn && <MembersOnlySignedIn navigateTo={navigateTo} />}

        {activeTab === "tournaments" && signedIn && (
          <DrawsTab
            myEntries={myEntries}
            activeTournament={activeTournament}
            setActiveTournament={setActiveTournament}
            setActiveRound={setActiveRound}
            setActiveTab={setActiveTab}
            members={members}
            tournaments={TOURNAMENTS}
          />
        )}
                {/* ══════════════════════════════════════════
            FIXTURES TAB
        ══════════════════════════════════════════ */}
        {activeTab === "fixtures" && (
          <FixturesTab fixtures={fixtures} fixturesLoad={fixturesLoad} fixturesExpanded={fixturesExpanded} setFixturesExpanded={setFixturesExpanded} seasonYear={settings.seasonYear || new Date().getFullYear()} isAdmin={isAdmin} addFixture={addFixture} editFixture={editFixture} deleteFixture={deleteFixture} />
        )}
                {/* ══════════════════════════════════════════
            MEMBERS TAB
        ══════════════════════════════════════════ */}
        {activeTab === "members" && !signedIn && <MembersOnlySignedIn navigateTo={navigateTo} />}

        {activeTab === "members" && signedIn && (
          <MembersTab
            filteredMembers={filteredMembers}
            groupedMembers={groupedMembers}
            memberSearch={memberSearch} setMemberSearch={setMemberSearch}
            activeSection={activeSection}
            membersLoad={membersLoad}
            fileInputRef={fileInputRef} handleFileChange={handleFileChange}
            downloadCSV={downloadCSV}
            uploadMsg={uploadMsg}
            editingId={editingId} setEditingId={setEditingId}
            editName={editName} setEditName={setEditName}
            editPhone={editPhone} setEditPhone={setEditPhone}
            editSection={editSection} setEditSection={setEditSection}
            editPosition={editPosition} setEditPosition={setEditPosition}
            saveEdit={saveEdit}
            startEdit={startEdit}
            confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete}
            deleteMember={deleteMember}
            showAddMemberSheet={showAddMemberSheet} setShowAddMemberSheet={setShowAddMemberSheet}
            newName={newName} setNewName={setNewName}
            newPhone={newPhone} setNewPhone={setNewPhone}
            newSection={newSection} setNewSection={setNewSection}
            addMember={addMember}
            isAdmin={isAdmin}
            isSuperAdmin={isSuperAdmin}
            myName={myName}
            requestPhoneChange={requestPhoneChange}
            phoneRequests={phoneRequests}
            approvePhoneRequest={approvePhoneRequest}
            declinePhoneRequest={declinePhoneRequest}
            joinRequests={joinRequests}
            approveJoinRequest={approveJoinRequest}
            declineJoinRequest={declineJoinRequest}
            memberProfiles={memberProfiles}
          />
        )}

        {/* ══════════════════════════════════════════
            SETTINGS TAB
        ══════════════════════════════════════════ */}
        {activeTab === "settings" && (
        <ErrorBoundary>
          {(() => {
          return (
            <SettingsTab
              settings={settings}
              updateSetting={updateSetting}
              myName={myName}
              setMyName={setMyName}
              nameInput={nameInput}
              setNameInput={setNameInput}
              setActiveSection={setActiveSection}
              exportBackup={exportBackup}
              backupFileRef={backupFileRef}
              handleBackupImport={handleBackupImport}
              backupMsg={backupMsg}
              tournaments={baseTournaments} tournamentsLoad={tournamentsLoad}
              activeSection={activeSection}
              onAddComp={openAddComp}
              onEditComp={openEditComp}
              onAddPersonalComp={openAddPersonalComp}
              onEditCompDates={openAllRoundDatesEditor}
              isSuperAdmin={isSuperAdmin}
              isAdmin={isAdmin}
              cloudKey={cloudKey}
              superAdminName={superAdminName}
              makeMeSuperAdmin={makeMeSuperAdmin}
              claimSuperAdmin={claimSuperAdmin}
              adminClaimMsg={adminClaimMsg}
              onBack={() => navigateTo(prevTab)}
              linkedMemberName={linkedMemberName}
              onLinkName={() => { setLinkSearch(""); setLinkStatus(null); setShowLinkSheet(true); }}
              onUnlinkName={unlinkMember}
            />
          );
        })()}
        </ErrorBoundary>
        )}

        {/* ══════════════════════════════════════════
            __SETTINGS_PLACEHOLDER_REMOVED__
        ══════════════════════════════════════════ */}
                {/* ══════════════════════════════════════════
            HELP TAB
        ══════════════════════════════════════════ */}
        {activeTab === "help" && (
          <HelpTab
            seasonYear={settings.seasonYear || new Date().getFullYear()}
            onBackup={exportBackup}
            canInstall={!!installPrompt}
            onInstall={triggerInstall}
            isIos={isIosDevice()}
            alreadyInstalled={isInstalled()}
          />
        )}

        {/* ══════════════════════════════════════════
            WHAT'S ON TAB — the band, the karaoke, one-off nights
        ══════════════════════════════════════════ */}
        {activeTab === "whatson" && (
          <WhatsOnTab
            // Read-only. What's On owns club_events; the fixture card is the
            // match secretary's and is still edited on the Fixtures tab.
            fixtures={fixtures}
            myName={myName}
            myPin={myPin}
            isAdmin={canEditEvents}
            openEventId={deepLinkEventId}
            onOpenedEvent={() => setDeepLinkEventId(null)}
          />
        )}

        {/* ══════════════════════════════════════════
            ADMIN TAB
        ══════════════════════════════════════════ */}
        {activeTab === "admin" && hasAdminPanel && (
          <AdminPanel
            myName={myName}
            isSuperAdmin={isSuperAdmin}
            canEditMembers={canEditMembers}
            canResetPins={canResetPins}
            canGrantAdmin={canGrantAdmin}
            canRunDraws={canRunDraws}
            adminRole={role}
            members={members}
            addMember={m => { const id = Date.now().toString(); const nm = { id, name: m.name, phone: m.phone || null, section: m.section, position: m.position || null, sort_order: 999 }; setMembers(p => [...p, nm]); supabase.from("members").insert(nm); }}
            saveEdit={(id, data) => { setMembers(p => p.map(m => m.id === id ? { ...m, ...data } : m)); supabase.from("members").update(data).eq("id", id); }}
            deleteMember={deleteMember}
            fixtures={fixtures}
            addFixture={addFixture}
            editFixture={editFixture}
            deleteFixture={deleteFixture}
            tournaments={baseTournaments} tournamentsLoad={tournamentsLoad}
            onEditCompDates={openAllRoundDatesEditor}
            rollOfHonour={rollOfHonour}
            honoraryMembers={honoraryMembers}
            recordWinner={recordWinner}
            addHonoraryMember={addHonoraryMember}
            removeHonoraryMember={removeHonoraryMember}
            lockouts={lockouts}
            clearLockout={clearLockout}
            adminList={adminListState}
            pendingAdminRequests={pendingAdminRequests}
            approveAdminRequest={approveAdminRequest}
            revokeAdmin={revokeAdmin}
            grantAdmin={grantAdmin}
            accessMsg={accessMsg}
            clearAccessMsg={() => setAccessMsg(null)}
            phoneRequests={phoneRequests}
            approvePhoneRequest={approvePhoneRequest}
            declinePhoneRequest={declinePhoneRequest}
            registeredUsers={registeredUsers}
            lockAppAccount={lockAppAccount}
            unlockAppAccount={unlockAppAccount}
            deleteAppAccount={deleteAppAccount}
            resetMemberPin={resetMemberPin}
            isDrawAdmin={isDrawAdmin}
            activeSection={activeSection}
            seasonYear={settings.seasonYear || new Date().getFullYear()}
            allDraws={allDraws}
            onDrawSaved={(draw, pairings) => {
              setAllDraws(p => [...p.filter(d => d.id !== draw.id), draw]);
              if (pairings) setDrawPairings(p => [...p.filter(x => x.draw_id !== draw.id), ...pairings]);
            }}
            claimRequests={claimRequests}
            resolveClaimRequest={resolveClaimRequest}
          />
        )}
              </div>

      {/* ── MANAGE COMPETITIONS SHEET ── */}
      <BottomSheet open={showManageCompsSheet} onClose={() => setShowManageCompsSheet(false)} title={editCompId ? "Edit Competition" : "Add Competition"}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Competition Name</div>
            <input value={compFormName} onChange={e => setCompFormName(e.target.value)} placeholder="e.g. Ladies Championship"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px", border: `1px solid ${BORDER}`, borderRadius: "8px", fontSize: "15px", fontFamily: F_UI, outline: "none", color: TEXT, background: SURFACE }} />
          </div>
          <div>
            <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "7px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Type</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {COMP_TYPES.map(t => (
                <button key={t} onClick={() => setCompFormType(t)}
                  style={{ background: compFormType === t ? MID : SURFACE2, border: `1px solid ${compFormType === t ? MID : BORDER}`, borderRadius: "16px", color: compFormType === t ? "#fff" : TEXT2, padding: "6px 12px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: compFormType === t ? "700" : "400" }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "7px", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Colour</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {COMP_COLORS.map(c => (
                <button key={c} onClick={() => setCompFormColor(c)}
                  style={{ width: "32px", height: "32px", borderRadius: "50%", background: c, border: compFormColor === c ? `3px solid ${TEXT}` : "3px solid transparent", cursor: "pointer", padding: 0 }} />
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <button onClick={saveComp} disabled={!compFormName.trim()}
              style={{ flex: 1, background: compFormName.trim() ? MID : BORDER, border: "none", borderRadius: "8px", color: compFormName.trim() ? "#fff" : TEXT3, padding: "13px", fontSize: "14px", cursor: compFormName.trim() ? "pointer" : "default", fontFamily: F_UI, fontWeight: "700" }}>
              {editCompId ? "Save Changes" : "Add Competition"}
            </button>
            {editCompId && (
              <button onClick={() => deleteComp(editCompId)}
                style={{ background: SURFACE, border: `1px solid #e8c5c5`, borderRadius: "8px", color: LOSS_RED, padding: "13px 14px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>
                Delete
              </button>
            )}
            <button onClick={() => setShowManageCompsSheet(false)}
              style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "13px 14px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>
              Cancel
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* ── ROUND DATES SHEET (per competition) ── */}
      {(() => {
        const rdt = baseTournaments.find(t => t.id === roundDatesCompId);
        const rdRounds = Array.isArray(rdt?.rounds) ? rdt.rounds : [];
        return (
          <BottomSheet open={showRoundDatesSheet} onClose={() => setShowRoundDatesSheet(false)} title={rdt ? `${rdt.name} — Dates` : "Round Dates"}>
            <div style={{ marginBottom: "14px", fontSize: "12px", color: TEXT2, fontFamily: F_UI, lineHeight: 1.5 }}>
              Set the date for each round. Shown to all members in the Find tab.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              {roundDatesValues.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "76px", fontFamily: F_UI, fontSize: "11px", color: TEXT3, flexShrink: 0 }}>
                    {(rdRounds[i] || "").split("\n")[0] || `Round ${i + 1}`}
                  </div>
                  <input type="date" value={d || ""} onChange={e => setRoundDatesValues(prev => prev.map((v, idx) => idx === i ? e.target.value : v))}
                    style={{ flex: 1, boxSizing: "border-box", padding: "9px 10px", border: `1px solid ${d ? MID : BORDER}`, borderRadius: "7px", fontSize: "13px", fontFamily: F_UI, outline: "none", color: d ? TEXT : TEXT3, background: SURFACE }} />
                  {d && <button onClick={() => setRoundDatesValues(prev => prev.map((v, idx) => idx === i ? "" : v))}
                    style={{ background: "none", border: "none", color: TEXT3, cursor: "pointer", padding: "2px 6px", fontSize: "18px", lineHeight: 1, flexShrink: 0 }}>×</button>}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={saveAllRoundDates}
                style={{ flex: 1, background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "12px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>
                Save
              </button>
              <button onClick={() => setShowRoundDatesSheet(false)}
                style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "12px 14px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI }}>
                Cancel
              </button>
            </div>
          </BottomSheet>
        );
      })()}

      {/* ── LINK MEMBER NAME SHEET ── */}
      <ProfileSheet
        open={showProfileSheet}
        onClose={() => setShowProfileSheet(false)}
        profile={profile}
        setProfile={setProfile}
        myName={myName}
        myEntries={myEntries}
        ties={ties}
        settings={settings}
        wins={wins}
        losses={losses}
        linkedPhone={members.find(m => m.name === linkedMemberName)?.phone || ""}
        onUpdatePhone={async (phone) => {
          const linked = members.find(m => m.name === linkedMemberName);
          if (!linked) return;
          setMembers(p => p.map(m => m.id === linked.id ? { ...m, phone } : m));
          await supabase.from("members").update({ phone }).eq("id", linked.id);
        }}
        onSwitchAccount={async () => {
          const previous = myName;
          setShowProfileSheet(false);
          // endSession owns both halves now: the server first, then the
          // device. Prefilling the name is all that is left to do here.
          await endSession();
          setNameInput(previous);
        }}
      />

      <BottomSheet open={showLinkSheet} onClose={closeLinkSheet} title="Link Your Name">
        {linkStatus === "done" ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>✓</div>
            <div style={{ fontFamily: F_UI, fontSize: "16px", fontWeight: "700", color: GREEN }}>Linked as {linkedMemberName}</div>
            <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, marginTop: "6px" }}>Your draws will now appear automatically.</div>
          </div>
        ) : (linkStatus?.type === "claimed" || linkStatus?.type === "requested") ? (
          <div>
            <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT, marginBottom: "16px", lineHeight: 1.6 }}>
              <strong>{linkStatus.member.name}</strong> is already linked to another account. If this is you, request a reassignment and an admin will review it.
            </div>
            {linkStatus.type === "requested" ? (
              <div style={{ background: `${GREEN}15`, border: `1px solid ${GREEN}44`, borderRadius: "10px", padding: "14px", textAlign: "center", fontFamily: F_UI, fontSize: "13px", color: GREEN }}>
                ✓ Request sent — an admin will review it shortly.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <button onClick={() => submitClaimRequest(linkStatus.member, linkStatus.currentHolder)}
                  style={{ background: MID, border: "none", borderRadius: "9px", color: "#fff", padding: "13px", fontSize: "13px", fontFamily: F_UI, fontWeight: "700", cursor: "pointer" }}>
                  Request Reassignment
                </button>
                <button onClick={() => setLinkStatus(null)}
                  style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "9px", color: TEXT2, padding: "13px", fontSize: "13px", fontFamily: F_UI, cursor: "pointer" }}>
                  Pick a different name
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT2, marginBottom: "14px", lineHeight: 1.6 }}>
              Linking your name lets your competitions appear automatically from the draw. Search by your <strong>last name</strong> to find yourself. You can skip this and use the app manually instead.
            </div>
            {linkedMemberName && (
              <div style={{ background: `${GREEN}15`, border: `1px solid ${GREEN}44`, borderRadius: "10px", padding: "12px 14px", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "700", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em" }}>Currently linked</div>
                  <div style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: "700", color: GREEN, marginTop: "2px" }}>{linkedMemberName}</div>
                </div>
                <button onClick={unlinkMember} style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: "7px", color: TEXT3, padding: "6px 10px", fontSize: "11px", fontFamily: F_UI, cursor: "pointer" }}>Unlink</button>
              </div>
            )}
            <input
              type="text" placeholder="Search by last name…" value={linkSearch}
              onChange={e => setLinkSearch(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", border: `1px solid ${BORDER}`, borderRadius: "9px", fontSize: "14px", fontFamily: F_UI, outline: "none", marginBottom: "10px", background: SURFACE, color: TEXT }}
              autoFocus
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
              {linkResults.map(m => (
                <button key={m.id} onClick={() => claimMemberLink(m)} disabled={linkStatus === "linking"}
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "10px", cursor: "pointer", textAlign: "left", width: "100%" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: F_UI, fontSize: "14px", fontWeight: "600", color: TEXT }}>{m.name}</div>
                    <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3, marginTop: "2px", textTransform: "capitalize" }}>{m.section || "Gents"}</div>
                  </div>
                  {m.linked_cloudkey && m.linked_cloudkey !== cloudKey
                    ? <div style={{ fontFamily: F_UI, fontSize: "10px", color: TEXT3, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "6px", padding: "3px 8px" }}>Claimed</div>
                    : m.linked_cloudkey === cloudKey
                    ? <div style={{ fontFamily: F_UI, fontSize: "10px", color: GREEN, fontWeight: "700" }}>✓ You</div>
                    : null}
                </button>
              ))}
              {linkSearch.length >= 2 && linkResults.length === 0 && (
                <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT3, textAlign: "center", padding: "20px" }}>No members found for "{linkSearch}"</div>
              )}
            </div>
            {linkedMemberName ? (
              <button onClick={closeLinkSheet}
                style={{ width: "100%", background: GREEN, border: "none", borderRadius: "9px", color: "#fff", padding: "13px", fontSize: "14px", fontFamily: F_UI, fontWeight: "700", cursor: "pointer" }}>
                Done
              </button>
            ) : (
              <button onClick={closeLinkSheet}
                style={{ width: "100%", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "9px", color: TEXT2, padding: "12px", fontSize: "13px", fontFamily: F_UI, cursor: "pointer" }}>
                Skip — I'll use the app manually
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {/* ── BOTTOM NAV BAR ── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
        background: SURFACE,
        borderTop: `1px solid ${BORDER}`,
        boxShadow: "0 -2px 16px rgba(74,14,31,0.08)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        <div style={{ display: "flex", maxWidth: "680px", margin: "0 auto" }}>
          {TABS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button key={id} data-nav onClick={() => navigateTo(id)} style={{
                flex: 1, background: "transparent", border: "none",
                borderTop: isActive ? `3px solid ${GREEN}` : "3px solid transparent",
                color: isActive ? GREEN : TEXT3,
                // 2px of side padding and tighter tracking, not 4px/0.05em: the
                // seven labels have to share the narrowest phone still in use.
                // Together they take the bar's minimum from 335px to 295px, so
                // it fits a 320px screen with room to spare rather than laying
                // the last tab out past the edge. See the letterSpacing below.
                padding: "8px 2px 6px", cursor: "pointer",
                fontFamily: F_UI, fontWeight: "600",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: "3px",
                minHeight: "56px",
                transition: "color 0.12s, border-color 0.12s",
                WebkitTapHighlightColor: "transparent",
              }}>
                <Icon size={22} strokeWidth={isActive ? 2.2 : 1.5} />
                <span style={{ fontSize: "10px", letterSpacing: "0.02em", textTransform: "uppercase", lineHeight: 1 }}>{label}</span>
                <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: isActive ? GREEN : "transparent", transition: "background 0.15s" }} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Draw result entry sheet */}
      {activeDrawEntry && (
        <DrawResultSheet
          open={!!activeDrawEntry}
          onClose={() => setActiveDrawEntry(null)}
          draw={activeDrawEntry.de.draw}
          mySlot={activeDrawEntry.de.playerSlot}
          myName={myName}
          currentRound={activeDrawEntry.status?.currentRound || 1}
          opponentName={activeDrawEntry.status?.opponentName ?? activeDrawEntry.de.opponent}
          onSave={row => recordDrawResult(activeDrawEntry.de, row)}
        />
      )}

      {/* After a Final win in a member's own draw entry.
          This used to PATCH roll_of_honour straight from here, on the word of
          whoever ticked the box — the club's permanent record, 1958 onwards,
          written by a self-reported result with nobody confirming it. It wrote
          {year, name} where the whole board reads w.winner, so the line would
          have rendered blank; and it announced "added to the Roll of Honour!"
          unconditionally, so once the table went SELECT-only it congratulated
          people for a write that had just been refused.
          Now: an admin gets the button, and it goes through the RPC and
          reports what came back. Anyone else gets the congratulation and the
          truth about who puts names up.
          The {year, name} half was fixed in place first, on the branch that
          added the year picker. Deleting the write does not undo that fix —
          it settles it, because the shape is now built by
          jsonb_build_object inside bowls_admin_record_winner and no client
          path can choose the key at all. */}
      {rohPrompt && (
        <BottomSheet open={!!rohPrompt} onClose={() => { setRohPrompt(null); setRohPromptMsg(null); }}
          title={isAdmin ? "Add to Roll of Honour?" : "Final won"}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{ fontSize: "48px", marginBottom: "10px" }}>🏆</div>
              <div style={{ fontFamily: F_UI, fontSize: "17px", fontWeight: "700", color: TEXT }}>{rohPrompt.playerName}</div>
              <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, marginTop: "4px" }}>Won the {rohPrompt.tournamentName} — {rohPrompt.seasonYear}</div>
              <div style={{ fontFamily: F_UI, fontSize: "12px", color: TEXT3, marginTop: "8px" }}>
                {isAdmin
                  ? "Add this win to the club's Roll of Honour?"
                  : "The Roll of Honour is the club's permanent record, so a club admin puts the name up. Have a word with the committee if it hasn't appeared."}
              </div>
              {rohPromptMsg && (
                <div style={{ fontFamily: F_UI, fontSize: "12px", marginTop: "10px", color: rohPromptMsg.ok ? GOLD_MUTED : LOSS_RED }}>
                  {rohPromptMsg.text}
                </div>
              )}
            </div>
            {isAdmin ? (
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => { setRohPrompt(null); setRohPromptMsg(null); }}
                  style={{ flex: 1, padding: "12px", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "10px", fontFamily: F_UI, fontSize: "13px", fontWeight: "600", color: TEXT2, cursor: "pointer" }}>
                  Not now
                </button>
                <button onClick={async () => {
                  const rohId = ROH_MAP[rohPrompt.tournamentId];
                  if (!rohId) { setRohPromptMsg({ ok: false, text: "That competition isn't on the Roll of Honour." }); return; }
                  setRohPromptMsg({ ok: true, text: "Saving…" });
                  const res = await recordWinner(rohId, rohPrompt.seasonYear, rohPrompt.playerName);
                  // The status, not the absence of an error.
                  if (res?.status === "ok") { setRohPrompt(null); setRohPromptMsg(null); }
                  else setRohPromptMsg({ ok: false, text: res?.message || "Couldn't save — no response from the server." });
                }}
                  style={{ flex: 2, padding: "12px", background: GOLD, border: `1px solid ${GOLD}`, borderRadius: "10px", fontFamily: F_UI, fontSize: "13px", fontWeight: "700", color: "#fff", cursor: "pointer" }}>
                  Yes — add to Roll of Honour
                </button>
              </div>
            ) : (
              <button onClick={() => { setRohPrompt(null); setRohPromptMsg(null); }}
                style={{ padding: "12px", background: GOLD, border: `1px solid ${GOLD}`, borderRadius: "10px", fontFamily: F_UI, fontSize: "13px", fontWeight: "700", color: "#fff", cursor: "pointer" }}>
                Close
              </button>
            )}
          </div>
        </BottomSheet>
      )}

    </div>
  );
}

