import { useState, useMemo, useEffect, useRef } from "react";
import {
  Target, Search, Trophy, Calendar, Users,
  Phone, Check, X, Pencil, Plus, User,
  ChevronLeft, ChevronRight, ChevronDown, Download, Upload,
  Clock, MapPin, Settings, HelpCircle, Type,
  Shield, Info, RefreshCw, BookOpen, Crosshair,
  Star, Medal, Bell, AlertTriangle,
} from "lucide-react";

// ── lib imports ──────────────────────────────────────────────────────────────
import { GREEN, MID, GOLD, GOLD_LIGHT, LIGHT, BG, LADIES, LADIES_MID, SURFACE, SURFACE2, BORDER, BRAND_HI, GOLD_MUTED, TEXT, TEXT2, TEXT3, WIN_GOLD, LOSS_RED, WIN_BG, LOSS_BG, F_DISPLAY, F_UI } from "./lib/theme.js";
import { MEMBERS_KEY, TIES_KEY, SETTINGS_KEY, ENTRIES_KEY, NAME_KEY, load, save, membersToCSV, parseCSV } from "./lib/storage.js";
import { DAY_NAMES, MONTH_ABBR, getSurname, getRoundLabel, fmtDate, parseTournRoundDate, getTournRoundDate, fixtureStatus, findUrgentTie, countdownLabel, countdownDays, getHeadToHead } from "./lib/utils.js";
import { DEFAULT_TOURNAMENTS, FIXTURES, DRAW_ENTRIES, DEFAULT_MEMBERS } from "./lib/constants.js";

// ── component imports ─────────────────────────────────────────────────────────
import BottomSheet from "./components/BottomSheet.jsx";
import SettingsTab from "./components/tabs/Settings.jsx";
import HelpTab from "./components/tabs/Help.jsx";
import FixturesTab from "./components/tabs/Fixtures.jsx";
import FindTab from "./components/tabs/Find.jsx";
import DrawsTab from "./components/tabs/Draws.jsx";
import MembersTab from "./components/tabs/Members.jsx";









function MemberPill({ name, phone, color = GOLD }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: `${SURFACE}`, border: `1px solid ${GOLD}44`, borderRadius: "4px", padding: "5px 12px" }}>
      <span style={{ fontFamily: F_DISPLAY, fontSize: "14px", fontWeight: "600", color: TEXT }}>{name}</span>
      {phone && <a href={`tel:${phone.replace(/\s/g,"")}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: GOLD, textDecoration: "none", fontFamily: F_UI, fontWeight: "500", padding: "2px 0" }}><Phone size={12} strokeWidth={1.75} />{phone}</a>}
    </div>
  );
}



// ── MAIN APP ───────────────────────────────────────────────────────────────
export default function BowlsTracker() {
  const [members, setMembers] = useState(() =>
    load(MEMBERS_KEY, DEFAULT_MEMBERS).map(m => ({ ...m, section: m.section || "gents" }))
  );
  const [ties, setTies]       = useState(() => load(TIES_KEY, {}));
  const [activeTab, setActiveTab] = useState("myties");
  const [prevTab, setPrevTab] = useState("myties");
  function navigateTo(tab) { setPrevTab(t => activeTab !== tab ? activeTab : t); setActiveTab(tab); }

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

  // ── iOS install banner ──
  const [showIosBanner, setShowIosBanner] = useState(() => {
    if (load("ipbc_ios_banner_dismissed", false)) return false;
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isStandalone = navigator.standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
    return isIos && !isStandalone;
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
    if (!swWaiting) return;
    swWaiting.messageSkipWaiting();
    swWaiting.addEventListener("controlling", () => window.location.reload());
  }

  // ── Android install prompt ──
  const [installPrompt, setInstallPrompt] = useState(null);
  useEffect(() => {
    const isStandalone = navigator.standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
    if (isStandalone) return; // already installed
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
  const [activeSection, setActiveSection] = useState(
    () => load(SETTINGS_KEY, { defaultSection: "gents" }).defaultSection || "gents"
  );
  const accentColor = activeSection === "ladies" ? LADIES_MID : GOLD;
  const accentDark  = activeSection === "ladies" ? LADIES     : GREEN;

  // ── My Ties state ──
  const [myName, setMyName]       = useState(() => load("bowls_myname", "") || "");
  const [settingName, setSettingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const SUPER_ADMIN_KEY = "bowls_super_admin_name_v1";
  const [superAdminName, setSuperAdminName] = useState(() => load(SUPER_ADMIN_KEY, ""));
  const isSuperAdmin = !!myName && myName.toUpperCase() === (superAdminName || "");
  useEffect(() => { save(SUPER_ADMIN_KEY, superAdminName); }, [superAdminName]);
  // Bootstrap: first named user becomes super admin
  useEffect(() => {
    if (myName && !superAdminName) setSuperAdminName(myName.toUpperCase());
  }, [myName, superAdminName]);
  function makeMeSuperAdmin() {
    if (!myName) return;
    setSuperAdminName(myName.toUpperCase());
  }
  const [addingTie, setAddingTie] = useState(false);
  const [tieComp, setTieComp]     = useState("");
  const [tieRound, setTieRound]   = useState(0);
  const [oppSearch, setOppSearch] = useState("");
  const [oppPicked, setOppPicked] = useState(null);
  const [scoringId, setScoringId] = useState(null);
  const [myScore, setMyScore]     = useState("");
  const [oppScore, setOppScore]   = useState("");
  const [delTie, setDelTie]       = useState(null);

  // ── My Entries (tournament tracker) state ──
  const [entries, setEntries]           = useState(() => load("bowls_entries_v1", []));
  const [addingEntry, setAddingEntry]   = useState(false);
  const [entryTournId, setEntryTournId] = useState("");
  const [entryRounds, setEntryRounds]   = useState(4);
  const [entryOppSearch, setEntryOppSearch] = useState("");
  const [entryOppPicked, setEntryOppPicked] = useState(null);
  const [entryRound1Bye, setEntryRound1Bye] = useState(false);
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
      .filter(m => (m.section || "gents") === activeSection)
      .filter(m => m.name.toUpperCase().includes(q))
      .slice(0, 6);
  }, [editOppSearch, members, activeSection]);

  const entryPartnerResults = useMemo(() => {
    if (!entryPartnerSearch || entryPartnerSearch.length < 2) return [];
    const q = entryPartnerSearch.toUpperCase();
    return members.filter(m => (m.section || "gents") === activeSection).filter(m => m.name.toUpperCase().includes(q)).slice(0, 6);
  }, [entryPartnerSearch, members, activeSection]);

  const nextOppPartnerResults = useMemo(() => {
    if (!nextOppPartnerSearch || nextOppPartnerSearch.length < 2) return [];
    const q = nextOppPartnerSearch.toUpperCase();
    return members.filter(m => (m.section || "gents") === activeSection).filter(m => m.name.toUpperCase().includes(q)).slice(0, 6);
  }, [nextOppPartnerSearch, members, activeSection]);

  const editOppPartnerResults = useMemo(() => {
    if (!editOppPartnerSearch || editOppPartnerSearch.length < 2) return [];
    const q = editOppPartnerSearch.toUpperCase();
    return members.filter(m => (m.section || "gents") === activeSection).filter(m => m.name.toUpperCase().includes(q)).slice(0, 6);
  }, [editOppPartnerSearch, members, activeSection]);

  const editMyPartnerResults = useMemo(() => {
    if (!editMyPartnerSearch || editMyPartnerSearch.length < 2) return [];
    const q = editMyPartnerSearch.toUpperCase();
    return members.filter(m => (m.section || "gents") === activeSection).filter(m => m.name.toUpperCase().includes(q)).slice(0, 6);
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
    if (!name) return;
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

  // ── Season Setup Builder state ──
  const [showSetup, setShowSetup]           = useState(false);
  const [setupTournIds, setSetupTournIds]   = useState([]);
  const [setupConfig, setSetupConfig]       = useState({});
  const [setupSearchFor, setSetupSearchFor] = useState(null);
  const [setupSearchVal, setSetupSearchVal] = useState("");

  // ── Find Games state ──
  const [search, setSearch] = useState("");

  // ── Members tab state ──
  const [memberSearch, setMemberSearch] = useState("");
  const [editingId, setEditingId]       = useState(null);
  const [editName, setEditName]         = useState("");
  const [editPhone, setEditPhone]       = useState("");
  const [editSection, setEditSection]   = useState("gents");
  const [addMode, setAddMode]           = useState(false);
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

  // ── Custom competitions ──
  const CUSTOM_COMPS_KEY = "bowls_custom_comps_v1";
  const [customComps, setCustomComps] = useState(() => load(CUSTOM_COMPS_KEY, []));
  useEffect(() => { save(CUSTOM_COMPS_KEY, customComps); }, [customComps]);
  const PERSONAL_COMPS_KEY = "bowls_personal_comps_v1";
  const [personalComps, setPersonalComps] = useState(() => load(PERSONAL_COMPS_KEY, []));
  useEffect(() => { save(PERSONAL_COMPS_KEY, personalComps); }, [personalComps]);

  // Merged: default hardcoded + user-added. User can also store overrides to default names/colors.
  const COMP_OVERRIDES_KEY = "bowls_comp_overrides_v1";
  const [compOverrides, setCompOverrides] = useState(() => load(COMP_OVERRIDES_KEY, {}));
  useEffect(() => { save(COMP_OVERRIDES_KEY, compOverrides); }, [compOverrides]);

  const TOURNAMENTS = useMemo(() => {
    const defaults = DEFAULT_TOURNAMENTS.map(t => ({
      ...t,
      ...(compOverrides[t.id] || {}),
      source: "ipbc",
      sourceLabel: "IPBC",
    }));
    const shared = customComps.map(c => ({ ...c, source: "ipbc", sourceLabel: "IPBC" }));
    const personal = personalComps
      .filter(c => c.owner === myName && ((c.section || "gents") === activeSection))
      .map(c => ({ ...c, source: "personal", sourceLabel: "Personal" }));
    return [...defaults, ...shared, ...personal];
  }, [customComps, personalComps, compOverrides, myName, activeSection]);

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
  function saveComp() {
    if (!compFormName.trim()) return;
    const isDefault = DEFAULT_TOURNAMENTS.some(t => t.id === editCompId);
    if (editCompSource === "ipbc" && !isSuperAdmin) return;
    if (editCompId && isDefault && editCompSource === "ipbc") {
      // Store as override for a default tournament
      setCompOverrides(prev => ({ ...prev, [editCompId]: { name: compFormName.trim(), type: compFormType, color: compFormColor } }));
    } else if (editCompId && editCompSource === "ipbc") {
      // Edit a custom competition
      setCustomComps(prev => prev.map(c => c.id === editCompId ? { ...c, name: compFormName.trim(), type: compFormType, color: compFormColor } : c));
    } else if (editCompId && editCompSource === "personal") {
      setPersonalComps(prev => prev.map(c => c.id === editCompId && c.owner === myName ? { ...c, name: compFormName.trim(), type: compFormType, color: compFormColor } : c));
    } else if (editCompSource === "personal") {
      setPersonalComps(prev => [...prev, { id: `personal-${Date.now()}`, owner: myName, section: activeSection, name: compFormName.trim(), type: compFormType, color: compFormColor, rounds: [], custom: true, source: "personal" }]);
    } else {
      // New custom competition
      setCustomComps(prev => [...prev, { id: `custom-${Date.now()}`, name: compFormName.trim(), type: compFormType, color: compFormColor, rounds: [], custom: true }]);
    }
    setShowManageCompsSheet(false);
  }
  function deleteComp(id) {
    const isDefault = DEFAULT_TOURNAMENTS.some(t => t.id === id);
    if (editCompSource === "ipbc" && !isSuperAdmin) return;
    if (editCompSource === "ipbc" && isDefault) {
      // Reset override instead of delete
      setCompOverrides(prev => { const n = { ...prev }; delete n[id]; return n; });
    } else if (editCompSource === "ipbc") {
      setCustomComps(prev => prev.filter(c => c.id !== id));
    } else {
      setPersonalComps(prev => prev.filter(c => !(c.id === id && c.owner === myName)));
    }
    setShowManageCompsSheet(false);
  }

  // Master round dates (shared for all members)
  const MASTER_DATES_KEY = "bowls_master_round_dates_v1";
  const [masterRoundDates, setMasterRoundDates] = useState(() => load(MASTER_DATES_KEY, {}));
  useEffect(() => { save(MASTER_DATES_KEY, masterRoundDates); }, [masterRoundDates]);

  const [showRoundDatesSheet, setShowRoundDatesSheet] = useState(false);
  const [roundDatesCompId, setRoundDatesCompId] = useState("");
  const [roundDatesValues, setRoundDatesValues] = useState([]);

  function getRoundDateForComp(tournamentId, roundIdx) {
    const manual = masterRoundDates?.[tournamentId]?.[roundIdx];
    if (manual) return manual;
    return getTournRoundDate(tournamentId, roundIdx, settings.seasonYear || new Date().getFullYear());
  }

  function openRoundDatesEditor(t) {
    if (!isSuperAdmin) return;
    const existing = masterRoundDates[t.id] || [];
    const base = (t.rounds || []).map(r => parseTournRoundDate(r, settings.seasonYear || new Date().getFullYear())).filter(Boolean);
    const len = Math.max(existing.length, base.length, 1);
    const merged = Array.from({ length: len }, (_, i) => existing[i] || base[i] || "");
    setRoundDatesCompId(t.id);
    setRoundDatesValues(merged);
    setShowRoundDatesSheet(true);
  }

  function saveRoundDatesEditor() {
    if (!isSuperAdmin) return;
    if (!roundDatesCompId) return;
    setMasterRoundDates(prev => ({ ...prev, [roundDatesCompId]: [...roundDatesValues] }));
    setShowRoundDatesSheet(false);
  }

  function resetRoundDatesEditor() {
    if (!isSuperAdmin) return;
    if (!roundDatesCompId) return;
    setMasterRoundDates(prev => { const n = { ...prev }; delete n[roundDatesCompId]; return n; });
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

  useEffect(() => { save(MEMBERS_KEY, members); }, [members]);
  useEffect(() => { save(TIES_KEY, ties); },       [ties]);
  useEffect(() => { save("bowls_myname", myName); }, [myName]);
  useEffect(() => { save("bowls_entries_v1", entries); }, [entries]);
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
  const sectionMembers = useMemo(() => members.filter(m => (m.section || "gents") === activeSection), [members, activeSection]);

  const myTiesList = useMemo(() =>
    Object.values(ties)
      .filter(t => t.myName === myName && ((t.section || "gents") === activeSection))
      .sort((a, b) => a.tournamentId.localeCompare(b.tournamentId) || a.roundIdx - b.roundIdx),
    [ties, myName, activeSection]
  );
  const wins   = myTiesList.filter(t => t.result === "W").length;
  const losses = myTiesList.filter(t => t.result === "L").length;

  const myEntries = useMemo(
    () => entries.filter(e => e && e.myName?.replace(/\s+/g,"").toUpperCase() === myName?.replace(/\s+/g,"").toUpperCase() && ((e.section || "gents") === activeSection)),
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
  }, [myEntries, settings.showReminders, settings.seasonYear, masterRoundDates]);

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

  // ── Find games ──
  const DRAW_ENTRIES = {
    championship: ["T IRVINE","T SMITH","R BIGGAR","C PROPHET","D PROPHET","R GILMOUR","S McLELLAN","C PROBERT","A REID","I COUSAR","E WILLIAMSON","S LEITCH","I McCLYMONT","M DEMPSEY","A FREW","G HALL","T FINNIGAN","J WALSH","D MUNRO","C WILLIAMS","W BROWN","R McLAUGHLAN","C SHINKFIELD","S BOYD","A McLEOD","A PRENTICE","A EASDON","T CRANCHER","G DEVOY","M SDERMARK","S McCLYMONT","W PATTERSON","D WILLIAMSON","D KIRKPATRICK","J FREW","D McKAY","T CLARK","K WENBAN","J LYNN","L KIRKLAND","C KINNIBURGH","D KIRKWOOD SNR","D HODALSKI","D SMITH","C SUNION","G MILLAR","D WILSON","D WELLS","D SINCLAIR","C SPROAT","L HINDMARSH","B KIRKLAND","C WILLIAMSON","I CHAPMAN","SCOTT WILLIAMSON","W McCANN"],
    presidents: ["D MACKINNON","J McCOMBIE","B KIRKWOOD SNR","D KIRKPATRICK","B KIRKLAND","C PROPHET","D WILSON","R BIGGAR","I McCLYMONT","T CLARK","S SHINKFELD","J CHAPMAN","C WILLIAMS","S WILLIAMSON","I HARWOOD","D HARGREAVES","S BOYD","G PROPHET","C SUNION","E FREW","S SINCLAIR","W KIRKWOOD SNR","E WILLIAMSON","D MUNRO","D HODALSKI","S BROWN","S DEVOY","S WELLS","A FREW","T LAW","J LYNN","G WILLIAMSON","D NELSON","M DEMPSEY","D McKAY","STUART WILLIAMSON","K WENBAN","J WADDELL","A McLEOD","T SMITH","M BURNS","A REID","T CRANCHER","S MILLAR","A EASDON","C KINNIBURGH","C SPROAT","S McCLYMONT","M WILLIAMSON","C ADRAIN","D SMITH","W BROWN","D TURNER","G HALL","A DEUTSCH","W PATTERSON","S LEITCH","D McMANUS","W McCANN"],
    morton: ["D WILSON","I COUSAR","S BOYD","D SMITH","M DEMPSEY","D TURNER","J CHAPMAN","S LEITCH","S MILLAR","K WENBAN","S BROWN","A EASDON","A FREW","J LYNN","D KIRKLAND","C KINNIBURGH","C WILLIAMS","G DEVOY","D HARGREAVES","G WILLIAMSON","C SPROAT","J FREW","A McLEOD","W KIRKWOOD SNR","D KIRKPATRICK","R GILMOUR","T CRANCHER","D MUNRO","N McKINNON","L HINDMARSH","A REID","J WADDELL","D HODALSKI","A PRENTICE","S McCLYMONT","W McCANN","D McMANUS","E WILLIAMSON","J IRVINE","C WILLIAMSON","R McLAUGHLAN"],
    donaldson: ["S BOYD","A McLEOD","I COUSAR","W PATTERSON","J SINCLAIR","A EASDON","S LEITCH","J FREW","L KIRKLAND","D McMANUS","W KIRKWOOD SNR","S MILLAR","C McINTOSH","E WILLIAMSON","G DEVOY","S BROWN","B KIRKLAND","S SINCLAIR","D KIRKPATRICK","J LYNN","R McLAUGHLAN","A FREW","A REID","D NELSON","C SPROAT","T FINNIGAN","D TURNER","D McKAY","T SMITH","D MUNRO","D WILSON","W McCANN","J CHAPMAN"],
    mitchell: ["D KIRKLAND","A PRENTICE","T CRANCHER","N McKINNON","C WILLIAMSON","J IRVINE","S SINCLAIR","D McKAY","C KINNIBURGH","W KIRKWOOD SNR","C McINTOSH","A DEUTSCH","S BOYD","G DEVOY","E FREW","S MILLAR","I CHAPMAN","S WILLIAMSON","T SMITH","S McCLYMONT","D WILSON","D NELSON","J WADDELL","W KIRKWOOD JNR","A REID","S MATHIESON","S LEITCH","J LAW","D HODALSKI","D KIRKPATRICK","A McLEOD","K WENBAN","S HALL","J LYNN","D TURNER","J FREW","A EASDON"],
    pairs: ["S McCLYMONT / J IRVINE","W BROWN / G WILLIAMSON","M WILLIAMSON / B KIRKWOOD SNR","T FINNIGAN / T WADDELL","A FREW / T SMITH","J FREW / D WILSON","D HARGREAVES / S BOYD","H DEMPSEY / W STRAIN","A DEUTSCH / R GILMOUR","D McHARG / A REID","D SMITH / A PRENTICE","T CLARK / H ELANG","K WENBAN / R McLACHLAN","C KINNIBURGH / C WILLIAMS","M WILLIAMSON / W KIRKWOOD SNR"],
    triples: ["S McCLYMONT","D MUNRO","B KIRKWOOD SNR","C ADRAIN","S MATHIESON","R BIGGAR","S MILLAR","A McLEOD","W BROWN","S WADDELL","M DEMPSEY","J LAW","I CHAPMAN","H WILLIAMSON","BT WILLIAMSON","I ROBERTSON","R McLAUGHLAN","S BOYD","B GILMOUR","T SMITH","C KINNIBURGH","A DEUTSCH"],
    rinks: ["W BROWN","D MUNRO","SCOTT WILLIAMSON","T SMITH","A DEUTSCH","H WILLIAMSON","S MILLAR","A McLEOD","STUART WILLIAMSON","C WILLIAMSON","B KIRKWOOD SNR","A EASDON","S McCLYMONT","B BIGGAR"],
    "mixed-pairs": ["WILLIAMSON / E FREW","J WLEAN / J WILLIAMSON","L KIRKLAND","M WILLIAMSON","J LYON / S CONNER","S SINCLAIR / S MILLAR","A EASDON / B HODALSKI","S DEVOY","D WILSON","A McLEOD / A DEUTSCH","S BROWN / S MATHIESON","J McMILLAN / T FINNIGAN","S BOYD / B KIRKPATRICK","J LAW / D MILLAR","W BROWN / J WADDELL","P KIRKLAND / D HARGREAVES","I McCLYMONT / A REID","STUART WILLIAMSON","W KIRKWOOD SNR"],
  };

  const playerGames = useMemo(() => {
    if (!search || search.length < 2) return [];
    return TOURNAMENTS.flatMap(t => {
      const entries = DRAW_ENTRIES[t.id] || [];
      return entries.flatMap((entry, idx) => {
        if (!entry.toUpperCase().includes(search.toUpperCase())) return [];
        const isEven = idx % 2 === 0;
        const opponent = entries[isEven ? idx + 1 : idx - 1];
        const oppSurname = opponent ? opponent.trim().split(/\s+/).slice(-1)[0].toUpperCase() : "";
        const phone = oppSurname ? members.find(m => getSurname(m.name) === oppSurname)?.phone : null;
        return [{ tournament: t.name, color: t.color, date: t.rounds[0], opponent: opponent || "Bye", oppPhone: phone, entry }];
      });
    });
  }, [search, members]);

  // ── Handlers ──
  function saveName() {
    if (!nameInput.trim()) return;
    setMyName(nameInput.toUpperCase().trim());
    setSettingName(false);
  }

  function addTie() {
    if (!tieComp || !oppPicked) return;
    const t = TOURNAMENTS.find(t => t.id === tieComp);
    const id = `${myName}-${tieComp}-${tieRound}-${oppPicked.id}-${Date.now()}`;
    setTies(prev => ({
      ...prev,
      [id]: {
        id, myName, tournament: t.name, tournamentId: tieComp,
        section: activeSection,
        round: t.rounds[tieRound], roundIdx: tieRound,
        opponent: oppPicked.name, oppPhone: oppPicked.phone,
        myScore: null, oppScore: null, result: null,
      }
    }));
    setAddingTie(false); setTieComp(""); setTieRound(0); setOppSearch(""); setOppPicked(null);
  }

  // ── Tournament entry handlers ──
  function createEntry() {
    if (!entryTournId || !myName) return;
    const t = TOURNAMENTS.find(t2 => t2.id === entryTournId);
    const rounds = t?.rounds?.length > 0 ? t.rounds.length : Math.max(1, entryRounds);
    const firstTie = entryRound1Bye
      ? { roundIdx: 0, roundLabel: getRoundLabel(0, rounds), opponent: "", oppPhone: "", date: "", time: "", myScore: null, oppScore: null, result: "BYE" }
      : entryOppPicked
      ? { roundIdx: 0, roundLabel: getRoundLabel(0, rounds), opponent: entryOppPicked.name, oppPhone: entryOppPicked.phone || "", date: entryDate, time: entryTime, myScore: null, oppScore: null, result: null }
      : null;
    const tournName = t?.name || entryTournId;
    setEntries(prev => [...prev, {
      id: `entry-${Date.now()}`,
      myName,
      section: activeSection,
      tournamentId: entryTournId,
      tournamentName: tournName,
      tournamentColor: t?.color || GOLD,
      totalRounds: rounds,
      status: "active",
      myPartners: [...entryMyPartners],
      ties: firstTie ? [firstTie] : [],
    }]);
    if (entryMyPartners.length > 0 && entryTournId !== "balloted-pairs") {
      const updated = { ...teamPartners, [entryTournId]: entryMyPartners };
      setTeamPartners(updated);
      save("ipbc_team_partners_v1", updated);
    }
    setEntryTournId(""); setEntryRounds(4);
    setEntryOppSearch(""); setEntryOppPicked(null); setEntryRound1Bye(false);
    setEntryDate(""); setEntryTime("");
    setEntryMyPartners([]); setEntryPartnerSearch("");
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

  function buildSeason() {
    if (setupTournIds.length === 0) return;
    const newEntries = setupTournIds.map((tid, i) => {
      const t    = TOURNAMENTS.find(t2 => t2.id === tid);
      const cfg  = setupConfig[tid] || {};
      const rounds = Math.max(1, cfg.rounds || 4);
      return {
        id: `entry-${Date.now()}-${i}`,
        myName,
        section: activeSection,
        tournamentId: tid,
        tournamentName: t?.name || tid,
        tournamentColor: t?.color || GOLD,
        totalRounds: rounds,
        status: "active",
        ties: cfg.opp ? [{
          roundIdx: 0,
          roundLabel: getRoundLabel(0, rounds),
          opponent: cfg.opp.name,
          oppPhone: cfg.opp.phone || "",
          date: getRoundDateForComp(tid, 0), time: "",
          myScore: null, oppScore: null, result: null,
        }] : [],
      };
    });
    setEntries(prev => [...prev, ...newEntries]);
    setShowSetup(false);
    setSetupTournIds([]); setSetupConfig({});
    setSetupSearchFor(null); setSetupSearchVal("");
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

  function exportBackup() {
    const data = JSON.stringify({ entries, myName, exportedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `ipbc-bowls-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupMsg("Backup downloaded");
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

  function submitScore(id) {
    const me = parseInt(myScore, 10);
    const opp = parseInt(oppScore, 10);
    if (isNaN(me) || isNaN(opp)) return;
    const result = me >= 21 ? "W" : opp >= 21 ? "L" : null;
    setTies(prev => ({ ...prev, [id]: { ...prev[id], myScore: me, oppScore: opp, result } }));
    setScoringId(null); setMyScore(""); setOppScore("");
  }

  function startEdit(m) { setEditingId(m.id); setEditName(m.name); setEditPhone(m.phone); setEditSection(m.section || "gents"); setAddMode(false); }
  function saveEdit()  {
    setMembers(prev => prev.map(m => m.id === editingId ? { ...m, name: editName.toUpperCase(), phone: editPhone, section: editSection } : m));
    setEditingId(null);
  }
  function deleteMember(id) { setMembers(prev => prev.filter(m => m.id !== id)); setConfirmDelete(null); }
  function addMember() {
    if (!newName.trim()) return;
    setMembers(prev => [...prev, { id: Date.now().toString(), name: newName.toUpperCase(), phone: newPhone, section: newSection }]);
    setNewName(""); setNewPhone(""); setAddMode(false);
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
      setUploadMsg(`Loaded ${parsed.length} members from file.`);
      setTimeout(() => setUploadMsg(null), 4000);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const TABS = [
    { id: "myties",      label: "My Ties",   Icon: Target   },
    { id: "search",      label: "Find",      Icon: Search   },
    { id: "honours",     label: "Honours",   Icon: Medal    },
    { id: "fixtures",    label: "Fixtures",  Icon: Calendar },
    { id: "members",     label: "Members",   Icon: Users    },
  ];

  const selectedT = activeTournament ? TOURNAMENTS.find(t => t.id === activeTournament) : null;

  // BottomSheet is imported from ./components/BottomSheet.jsx

  // ── Find the most urgent pending tie ──
  function findUrgentTie(allEntries) {
    const pending = allEntries
      .filter(e => e.status === "active")
      .flatMap(e => e.ties.filter(t => !t.result).map(t => ({ ...t, entry: e })));
    if (!pending.length) return null;
    pending.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date) - new Date(b.date);
    });
    return pending[0];
  }

  // ── Section toggle ──
  function SectionToggle({ style = {} }) {
    return (
      <div style={{ display: "inline-flex", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "6px", padding: "2px", ...style }}>
        {["gents","ladies"].map(s => (
          <button key={s} onClick={() => setActiveSection(s)} style={{
            background: activeSection === s ? MID : "transparent",
            border: "none", borderRadius: "4px",
            color: activeSection === s ? "#ffffff" : TEXT2,
            padding: "5px 14px", fontSize: "11px", cursor: "pointer",
            fontFamily: F_UI, fontWeight: activeSection === s ? "600" : "400",
            letterSpacing: "0.08em", textTransform: "uppercase",
            transition: "all 0.15s",
          }}>{s === "gents" ? "Gents" : "Ladies"}</button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: F_UI, color: TEXT, zoom: fontScale }}>

      {/* ── iOS INSTALL BANNER ── */}
      {showIosBanner && (
        <div style={{ position: "fixed", bottom: "70px", left: "12px", right: "12px", zIndex: 200, background: GREEN, borderRadius: "14px", padding: "14px 16px", boxShadow: "0 4px 20px rgba(74,14,31,0.3)", display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: F_DISPLAY, fontSize: "15px", fontWeight: "700", color: "#fff", marginBottom: "3px" }}>Install this app</div>
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
        <div style={{ position: "fixed", bottom: "70px", left: "12px", right: "12px", zIndex: 200, background: GREEN, borderRadius: "14px", padding: "14px 16px", boxShadow: "0 4px 20px rgba(74,14,31,0.3)", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: F_DISPLAY, fontSize: "15px", fontWeight: "700", color: "#fff", marginBottom: "2px" }}>Install this app</div>
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
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 300, background: MID, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", boxShadow: "0 2px 8px rgba(74,14,31,0.2)" }}>
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

      {/* ── HEADER ── */}
      <div style={{ background: SURFACE, borderBottom: `3px solid ${GREEN}`, boxShadow: "0 1px 4px rgba(74,14,31,0.08)" }}>
        <div style={{ padding: "0 16px", maxWidth: "680px", margin: "0 auto" }}>

          {/* Main header row */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingTop: "12px", paddingBottom: "12px" }}>

            {/* Club crest */}
            <img
              src="/ipbc-badge.png"
              alt="Irvine Park Bowling Club"
              style={{ height: "52px", width: "auto", flexShrink: 0, objectFit: "contain" }}
              onError={e => {
                e.target.style.display = "none";
                e.target.nextSibling.style.display = "flex";
              }}
            />
            {/* Fallback monogram */}
            <div style={{ display: "none", width: "44px", height: "44px", borderRadius: "50%", background: GREEN, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: F_DISPLAY, fontSize: "16px", fontWeight: "700", color: GOLD, letterSpacing: "1px" }}>IP</span>
            </div>

            {/* Title — centred between crest and pill */}
            <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
              <div style={{ fontFamily: F_DISPLAY, fontSize: "18px", fontWeight: "700", color: GREEN, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1.1 }}>
                Irvine Park Bowling Club
              </div>
              <div style={{ fontFamily: F_UI, fontSize: "11px", fontWeight: "500", color: GOLD_MUTED, letterSpacing: "0.15em", textTransform: "uppercase", marginTop: "3px" }}>
                {activeSection === "ladies" ? "Ladies Section" : "Gents Section"} · {settings.seasonYear || new Date().getFullYear()}
              </div>
            </div>

            {/* Logged-in user pill */}
            {myName ? (
              <button onClick={() => { setSettingName(true); setNameInput(myName); }}
                style={{ background: "transparent", border: `1px solid ${GREEN}`, borderRadius: "20px", color: GREEN, padding: "5px 12px", fontSize: "11px", cursor: "pointer", fontFamily: F_DISPLAY, fontWeight: "600", flexShrink: 0, letterSpacing: "0.02em" }}>
                {myName}
              </button>
            ) : (
              <div style={{ width: "44px" }} />
            )}
          </div>

          {/* Section toggle + settings/help row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "10px" }}>
            <SectionToggle />
            <div style={{ display: "flex", gap: "2px" }}>
              <button onClick={() => navigateTo("help")} title="Help"
                style={{ background: activeTab === "help" ? `${GREEN}12` : "none", border: "none", cursor: "pointer", padding: "7px 10px", color: activeTab === "help" ? GREEN : TEXT3, borderRadius: "8px", display: "flex", alignItems: "center" }}>
                <HelpCircle size={20} strokeWidth={activeTab === "help" ? 2 : 1.5} />
              </button>
              <button onClick={() => navigateTo("settings")} title="Settings"
                style={{ background: activeTab === "settings" ? `${GREEN}12` : "none", border: "none", cursor: "pointer", padding: "7px 10px", color: activeTab === "settings" ? GREEN : TEXT3, borderRadius: "8px", display: "flex", alignItems: "center" }}>
                <Settings size={20} strokeWidth={activeTab === "settings" ? 2 : 1.5} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── SCROLLABLE CONTENT ── */}
      <div style={{ padding: "20px 16px 100px", maxWidth: "680px", margin: "0 auto" }}>

        {/* ══════════════════════════════════════════
            MY TIES TAB
        ══════════════════════════════════════════ */}
        {activeTab === "myties" && (
          <div>
            {(!myName || settingName) ? (
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "32px 24px", boxShadow: "0 2px 12px rgba(74,14,31,0.08)", textAlign: "center" }}>
                <div style={{ fontFamily: F_DISPLAY, fontSize: "28px", fontWeight: "600", color: GREEN, marginBottom: "6px" }}>Welcome</div>
                <div style={{ fontFamily: F_UI, fontSize: "13px", color: TEXT2, marginBottom: "24px" }}>Enter your name to track your tournament ties</div>
                <input value={nameInput} onChange={e => setNameInput(e.target.value.toUpperCase())}
                  placeholder="e.g. J FREW" autoFocus
                  style={{ width: "100%", boxSizing: "border-box", padding: "13px", fontSize: "16px", border: `1px solid ${BORDER}`, borderRadius: "8px", outline: "none", fontFamily: F_UI, color: TEXT, background: SURFACE, textAlign: "center", letterSpacing: "2px", marginBottom: "12px" }} />
                <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                  <button onClick={saveName} style={{ background: MID, border: "none", borderRadius: "8px", color: "#ffffff", padding: "11px 28px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600", letterSpacing: "0.05em" }}>Confirm</button>
                  {settingName && <button onClick={() => setSettingName(false)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "11px 18px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>Cancel</button>}
                </div>
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

                      {/* ── Share toast ── */}
                      {shareToast && (
                        <div style={{ position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)", zIndex: 200, background: GREEN, color: "#fff", borderRadius: "10px", padding: "10px 18px", fontSize: "13px", fontFamily: F_UI, fontWeight: "600", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", whiteSpace: "nowrap", maxWidth: "90vw", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {shareToast}
                        </div>
                      )}

                      {/* ─── HERO CARD ─── */}
                      {urgent ? (
                        <div style={{ background: GREEN, borderRadius: "16px", padding: "20px", marginBottom: "14px", position: "relative", overflow: "hidden" }}>
                          <div style={{ position: "absolute", top: -30, right: -30, width: "120px", height: "120px", background: "rgba(201,168,76,0.12)", borderRadius: "50%", pointerEvents: "none" }} />
                          <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: GOLD, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "6px" }}>Next Up</div>
                          <div style={{ fontFamily: F_DISPLAY, fontSize: "24px", fontWeight: "700", color: "#ffffff", letterSpacing: "0.02em", lineHeight: 1.1, marginBottom: "4px" }}>
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
                            <div style={{ fontFamily: F_DISPLAY, fontSize: "16px", fontWeight: "600", color: GREEN }}>All caught up!</div>
                            <div style={{ fontSize: "12px", color: TEXT2, marginTop: "2px" }}>No pending ties — well played so far</div>
                          </div>
                        </div>
                      ) : null}

                      {/* ─── EMPTY STATE (no entries yet) ─── */}
                      {myEntries.length === 0 && (
                        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "32px 24px", textAlign: "center", marginBottom: "14px" }}>
                          <div style={{ marginBottom: "12px", display: "flex", justifyContent: "center" }}><Target size={32} strokeWidth={1.25} color={GREEN} /></div>
                          <div style={{ fontFamily: F_DISPLAY, fontSize: "22px", color: GREEN, marginBottom: "8px" }}>No tournaments yet</div>
                          <div style={{ fontSize: "12px", color: TEXT2, marginBottom: "20px" }}>Pick each competition and add your round 1 opponent</div>
                          <button onClick={() => { setShowEntrySheet(true); setEntryJustSaved(false); setEntryTournId(""); setEntryRounds(4); setEntryOppSearch(""); setEntryOppPicked(null); setEntryDate(""); setEntryTime(""); }}
                            style={{ background: MID, border: "none", borderRadius: "10px", color: "#ffffff", padding: "13px 32px", fontSize: "14px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                            <Plus size={16} strokeWidth={2.5} /> Add Tournament
                          </button>
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
                              <div style={{ fontFamily: F_DISPLAY, fontSize: "28px", fontWeight: "700", color: s.col, lineHeight: 1 }}>{s.val}</div>
                              <div style={{ fontSize: "10px", color: TEXT3, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "3px", fontWeight: "500" }}>{s.label}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Reminder banner ── */}
                      {reminderItems.length > 0 && (
                        <div style={{ marginBottom: "14px", background: "#fffbeb", border: "1px solid #f59e0b44", borderRadius: "10px", overflow: "hidden" }}>
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
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
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
                        </div>

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
                                  <div style={{ fontFamily: F_DISPLAY, fontSize: "16px", fontWeight: "600", color: GREEN, letterSpacing: "0.02em" }}>{entry.tournamentName}</div>
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

                        {/* Honours teaser — tap to go to Honours tab */}
                        {myHonours.length > 0 && (
                          <button onClick={() => setActiveTab("honours")}
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
                                <div style={{ fontFamily: F_DISPLAY, fontSize: "20px", fontWeight: "600", color: GREEN, marginBottom: "4px" }}>No history yet</div>
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
                                      <span style={{ fontFamily: F_DISPLAY, fontSize: "16px", fontWeight: "700", color: WIN_GOLD }}>{wins}</span>
                                      <span style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: WIN_GOLD, textTransform: "uppercase", letterSpacing: "0.08em" }}>Won</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "5px", background: `${LOSS_RED}10`, border: `1px solid ${LOSS_RED}44`, borderRadius: "8px", padding: "5px 10px" }}>
                                      <span style={{ fontFamily: F_DISPLAY, fontSize: "16px", fontWeight: "700", color: LOSS_RED }}>{losses}</span>
                                      <span style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: LOSS_RED, textTransform: "uppercase", letterSpacing: "0.08em" }}>Lost</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "5px", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "8px", padding: "5px 10px" }}>
                                      <span style={{ fontFamily: F_DISPLAY, fontSize: "16px", fontWeight: "700", color: TEXT2 }}>{entry.totalRounds}</span>
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
                                        <span style={{ fontFamily: F_DISPLAY, fontSize: "11px", fontWeight: "700", color: isFuture ? TEXT3 : "#fff" }}>{rIdx + 1}</span>
                                      </div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: textCol === TEXT ? TEXT3 : textCol, textTransform: "uppercase", letterSpacing: "0.08em" }}>{roundLabel}</div>
                                        <div style={{ fontFamily: F_DISPLAY, fontSize: "14px", fontWeight: "600", color: textCol, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {tie ? `vs ${tie.opponent}` : isNext ? "Set opponent" : "Upcoming"}
                                        </div>
                                      </div>
                                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                                        {resultLabel && <div style={{ fontFamily: F_UI, fontSize: "12px", fontWeight: "700", color: accentCol }}>{resultLabel}</div>}
                                        {tie && !tie.result && tie.date && <div style={{ fontFamily: F_UI, fontSize: "11px", color: GREEN }}>{fmtDate(tie.date)}</div>}
                                        {tie && !tie.result && !tie.date && sched && <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>by {fmtDate(sched)}</div>}
                                        {isNext && !tie && <div style={{ fontFamily: F_UI, fontSize: "11px", color: entry.tournamentColor || GREEN, fontWeight: "600" }}>▶ Next</div>}
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
                                                  <button onClick={() => openH2H(tie.opponent)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: F_DISPLAY, fontSize: "18px", fontWeight: "700", color: GREEN, textAlign: "left" }}>vs {tie.opponent}</button>
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
                                                  <span style={{ fontFamily: F_DISPLAY, fontSize: "16px", fontWeight: "700", color: schedDays < 0 ? LOSS_RED : TEXT }}>{fmtDate(sched)}</span>
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
                                                      <span style={{ fontFamily: F_DISPLAY, fontSize: "16px", fontWeight: "700", color: GREEN }}>{fmtDate(tie.date)}</span>
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
                                                  style={{ width: "100%", boxSizing: "border-box", padding: "6px 4px", fontSize: "48px", fontFamily: F_DISPLAY, fontWeight: "700", border: `2px solid ${GOLD}66`, borderRadius: "8px", textAlign: "center", outline: "none", color: GOLD }} />
                                              </div>
                                              <div style={{ fontSize: "20px", color: TEXT3, paddingBottom: "12px" }}>–</div>
                                              <div style={{ flex: 1, textAlign: "center" }}>
                                                <div style={{ fontSize: "11px", color: TEXT2, marginBottom: "4px", fontWeight: "500" }}>{tie.opponent}</div>
                                                <input type="number" min="0" value={scoreOppV} onChange={e => setScoreOppV(e.target.value)}
                                                  style={{ width: "100%", boxSizing: "border-box", padding: "6px 4px", fontSize: "48px", fontFamily: F_DISPLAY, fontWeight: "700", border: `1px solid ${BORDER}`, borderRadius: "8px", textAlign: "center", outline: "none", color: TEXT }} />
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
                                <div style={{ fontFamily: F_DISPLAY, fontSize: "18px", fontWeight: "600", color: GREEN, marginBottom: "14px" }}>
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
                                            <span style={{ fontSize: "14px", fontWeight: "600", color: TEXT, fontFamily: F_DISPLAY }}>{m.name}</span>
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
                                                <span style={{ fontSize: "14px", fontWeight: "600", color: TEXT, fontFamily: F_DISPLAY }}>{m.name}</span>
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
                      <BottomSheet open={showEntrySheet} onClose={() => { setShowEntrySheet(false); setEntryJustSaved(false); setEntryRound1Bye(false); setEntryOppPicked(null); setEntryOppSearch(""); setEntryMyPartners([]); setEntryPartnerSearch(""); }} title="Add Tournament">
                        {entryJustSaved ? (
                          <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
                            <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
                              <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: `${GREEN}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Check size={28} strokeWidth={2.5} color={GREEN} />
                              </div>
                            </div>
                            <div style={{ fontFamily: F_DISPLAY, fontSize: "22px", fontWeight: "700", color: GREEN, marginBottom: "6px" }}>Added!</div>
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
                                  setEntryTournId(t.id);
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
                          </div>
                        </div>
                        {entryTournId && !(TOURNAMENTS.find(t => t.id === entryTournId)?.rounds?.length > 0) && (
                          <div style={{ marginBottom: "16px" }}>
                            <div style={{ fontSize: "10px", color: TEXT3, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1.5px" }}>Number of Rounds</div>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {[1,2,3,4,5,6].map(n => (
                                <button key={n} onClick={() => setEntryRounds(n)} style={{
                                  background: entryRounds === n ? MID : SURFACE, border: `1px solid ${entryRounds === n ? MID : BORDER}`,
                                  borderRadius: "8px", color: entryRounds === n ? "#fff" : TEXT,
                                  padding: "8px 16px", fontSize: "16px", cursor: "pointer", fontFamily: F_DISPLAY, fontWeight: "600",
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
                                        <span style={{ fontSize: "14px", fontWeight: "600", color: TEXT, fontFamily: F_DISPLAY }}>{m.name}</span>
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
                                      <span style={{ fontSize: "14px", fontWeight: "600", color: TEXT, fontFamily: F_DISPLAY }}>{m.name}</span>
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
                          <button onClick={createEntry} disabled={!entryTournId}
                            style={{ flex: 1, background: entryTournId ? MID : BORDER, border: "none", borderRadius: "8px", color: entryTournId ? "#fff" : TEXT3, padding: "12px", fontSize: "13px", cursor: entryTournId ? "pointer" : "default", fontFamily: F_UI, fontWeight: "700" }}>
                            Save
                          </button>
                          <button onClick={() => { setEntryJustSaved(false); setShowEntrySheet(false); }} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "12px 16px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>Cancel</button>
                        </div>
                        </>}
                      </BottomSheet>

                      {/* ══ BOTTOM SHEET: Setup Season ══ */}
                      {(() => {
                        const setupSearchResults = setupSearchFor && setupSearchVal.length >= 2
                          ? sectionMembers.filter(m => m.name.toUpperCase().includes(setupSearchVal.toUpperCase())).slice(0, 6)
                          : [];
                        return (
                          <BottomSheet open={showSetupSheet} onClose={() => setShowSetupSheet(false)} title="Setup Season">
                            <div style={{ fontSize: "13px", color: TEXT2, marginBottom: "16px" }}>
                              Tick every competition you&apos;re entered in. Add Round 1 opponents now or later — it&apos;s optional.
                            </div>
                            <div style={{ marginBottom: "14px" }}>
                              <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>I am entered in:</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                                {TOURNAMENTS.map(t => {
                                  const sel = setupTournIds.includes(t.id);
                                  return (
                                    <button key={t.id} onClick={() => {
                                      setSetupTournIds(prev => sel ? prev.filter(id => id !== t.id) : [...prev, t.id]);
                                      if (!sel) setSetupConfig(prev => ({ ...prev, [t.id]: { rounds: prev[t.id]?.rounds || 4, opp: prev[t.id]?.opp || null } }));
                                    }} style={{ background: sel ? MID : SURFACE2, border: `1px solid ${sel ? MID : BORDER}`, borderRadius: "20px", color: sel ? "#fff" : TEXT, padding: "8px 14px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: sel ? "700" : "400" }}>
                                      {t.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            {setupTournIds.length > 0 && (
                              <div style={{ marginBottom: "14px" }}>
                                {setupTournIds.map(tid => {
                                  const t   = TOURNAMENTS.find(t2 => t2.id === tid);
                                  const cfg = setupConfig[tid] || { rounds: 4, opp: null };
                                  const isSearchHere = setupSearchFor === tid;
                                  return (
                                    <div key={tid} style={{ background: `${t.color}0d`, border: `1px solid ${t.color}33`, borderRadius: "10px", padding: "12px", marginBottom: "8px" }}>
                                      <div style={{ fontSize: "12px", fontWeight: "700", color: t.color, marginBottom: "10px" }}>{t.name}</div>
                                      <div style={{ marginBottom: "10px" }}>
                                        <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px" }}>Rounds</div>
                                        <div style={{ display: "flex", gap: "5px" }}>
                                          {[1,2,3,4,5,6].map(n => (
                                            <button key={n} onClick={() => setSetupConfig(prev => ({ ...prev, [tid]: { ...prev[tid], rounds: n } }))} style={{
                                              background: cfg.rounds === n ? MID : SURFACE, border: `1px solid ${cfg.rounds === n ? MID : BORDER}`,
                                              borderRadius: "6px", color: cfg.rounds === n ? "#fff" : TEXT,
                                              padding: "5px 10px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, fontWeight: "600",
                                            }}>{n}</button>
                                          ))}
                                        </div>
                                      </div>
                                      <div>
                                        <div style={{ fontSize: "10px", color: TEXT2, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px" }}>Round 1 Opponent <span style={{ fontStyle: "italic", textTransform: "none", letterSpacing: 0 }}>(optional)</span></div>
                                        {cfg.opp ? (
                                          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                                            <MemberPill name={cfg.opp.name} phone={cfg.opp.phone} color={t.color} />
                                            <button onClick={() => setSetupConfig(prev => ({ ...prev, [tid]: { ...prev[tid], opp: null } }))} style={{ background: "none", border: "none", color: TEXT2, cursor: "pointer" }}><X size={14} strokeWidth={2} /></button>
                                          </div>
                                        ) : (
                                          <>
                                            <input
                                              value={isSearchHere ? setupSearchVal : ""}
                                              onFocus={() => { setSetupSearchFor(tid); setSetupSearchVal(""); }}
                                              onChange={e => setSetupSearchVal(e.target.value)}
                                              placeholder="Search or type name…"
                                              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${t.color}55`, borderRadius: "7px", fontSize: "13px", outline: "none", fontFamily: F_UI }}
                                            />
                                            {isSearchHere && setupSearchVal.length >= 2 && (
                                              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "7px", marginTop: "4px", overflow: "hidden", boxShadow: "0 2px 8px rgba(74,14,31,0.1)" }}>
                                                {setupSearchResults.map(m => (
                                                  <div key={m.id} onClick={() => { setSetupConfig(prev => ({ ...prev, [tid]: { ...prev[tid], opp: m } })); setSetupSearchFor(null); setSetupSearchVal(""); }}
                                                    style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}`, cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ fontSize: "13px", fontWeight: "600", color: TEXT, fontFamily: F_DISPLAY }}>{m.name}</span>
                                                    {m.phone && <a href={`tel:${m.phone.replace(/\s/g,"")}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: GOLD, textDecoration: "none", fontFamily: F_UI, fontWeight: "500" }}><Phone size={12} strokeWidth={1.75} />{m.phone}</a>}
                                                  </div>
                                                ))}
                                                <div onClick={() => { setSetupConfig(prev => ({ ...prev, [tid]: { ...prev[tid], opp: { name: setupSearchVal.toUpperCase(), phone: "" } } })); setSetupSearchFor(null); setSetupSearchVal(""); }}
                                                  style={{ padding: "10px 12px", cursor: "pointer", fontSize: "12px", color: GOLD_MUTED, borderTop: `1px solid ${BORDER}` }}>
                                                  + Add &ldquo;{setupSearchVal.toUpperCase()}&rdquo; manually
                                                </div>
                                              </div>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button onClick={() => { buildSeason(); setShowSetupSheet(false); }} disabled={setupTournIds.length === 0}
                                style={{ flex: 1, background: setupTournIds.length > 0 ? MID : BORDER, border: "none", borderRadius: "8px", color: setupTournIds.length > 0 ? "#fff" : TEXT3, padding: "12px", fontSize: "13px", cursor: setupTournIds.length > 0 ? "pointer" : "default", fontFamily: F_UI, fontWeight: "700" }}>
                                {setupTournIds.length > 0 ? `Build Season (${setupTournIds.length})` : "Select competitions above"}
                              </button>
                              <button onClick={() => setShowSetupSheet(false)} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "12px 16px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>Skip</button>
                            </div>
                          </BottomSheet>
                        );
                      })()}

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
          <FindTab search={search} setSearch={setSearch} playerGames={playerGames} tournaments={TOURNAMENTS} onH2H={openH2H} />
        )}

        {/* ══════════════════════════════════════════
            HONOURS TAB
        ══════════════════════════════════════════ */}
        {activeTab === "honours" && (() => {
          const posCol  = p => p === "Winner" ? WIN_GOLD : p === "Runner-Up" ? GOLD_MUTED : p === "Semi-Final" ? TEXT2 : TEXT3;
          const posBg   = p => p === "Winner" ? `${WIN_GOLD}12` : p === "Runner-Up" ? `${GOLD_MUTED}12` : SURFACE2;
          const posBorder = p => p === "Winner" ? `${WIN_GOLD}55` : p === "Runner-Up" ? `${GOLD_MUTED}55` : BORDER;

          const grouped = honoursGrouped;
          const years   = honoursYears;

          return (
            <div>
              {/* Hero header */}
              <div style={{ background: GREEN, borderRadius: "14px", padding: "20px", marginBottom: "16px", boxShadow: "0 4px 16px rgba(74,14,31,0.18)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                  <Medal size={26} strokeWidth={1.5} color={GOLD} />
                  <div>
                    <div style={{ fontFamily: F_DISPLAY, fontSize: "22px", fontWeight: "700", color: "#fff", lineHeight: 1 }}>
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
                  <div style={{ fontFamily: F_DISPLAY, fontSize: "20px", fontWeight: "600", color: TEXT2, marginBottom: "6px" }}>No honours yet</div>
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
                      <div style={{ fontFamily: F_DISPLAY, fontSize: "22px", fontWeight: "700", color: GREEN }}>{year}</div>
                      <div style={{ flex: 1, height: "1px", background: BORDER }} />
                      <div style={{ fontFamily: F_UI, fontSize: "11px", color: TEXT3 }}>{grouped[year].length} achievement{grouped[year].length !== 1 ? "s" : ""}</div>
                      <ChevronDown size={15} strokeWidth={2} color={TEXT3} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
                    </button>
                    {isOpen && grouped[year].map(h => (
                      <div key={h.id} style={{ background: SURFACE, border: `1px solid ${posBorder(h.position)}`, borderLeft: `4px solid ${posCol(h.position)}`, borderRadius: "12px", padding: "14px 16px", marginBottom: "8px", boxShadow: "0 1px 4px rgba(74,14,31,0.06)" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: F_DISPLAY, fontSize: "19px", fontWeight: "700", color: TEXT, lineHeight: 1.2, marginBottom: "5px" }}>{h.competition}</div>
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
                            <div style={{ fontFamily: F_DISPLAY, fontSize: "32px", fontWeight: "700", color: WIN_GOLD, lineHeight: 1 }}>{h2h.wins}</div>
                            <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: WIN_GOLD, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "4px" }}>Won</div>
                          </div>
                          <div style={{ flex: 1, textAlign: "center", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "12px 8px" }}>
                            <div style={{ fontFamily: F_DISPLAY, fontSize: "32px", fontWeight: "700", color: TEXT2, lineHeight: 1 }}>{h2h.played}</div>
                            <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: TEXT3, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "4px" }}>Played</div>
                          </div>
                          <div style={{ flex: 1, textAlign: "center", background: LOSS_BG, border: `1px solid ${LOSS_RED}44`, borderRadius: "10px", padding: "12px 8px" }}>
                            <div style={{ fontFamily: F_DISPLAY, fontSize: "32px", fontWeight: "700", color: LOSS_RED, lineHeight: 1 }}>{h2h.losses}</div>
                            <div style={{ fontFamily: F_UI, fontSize: "10px", fontWeight: "600", color: LOSS_RED, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "4px" }}>Lost</div>
                          </div>
                        </div>

                        {/* Match list */}
                        {h2h.matches.length === 0 ? (
                          <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "28px", textAlign: "center" }}>
                            <div style={{ fontFamily: F_DISPLAY, fontSize: "17px", fontWeight: "600", color: TEXT2, marginBottom: "4px" }}>No completed games yet</div>
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
                                  <div style={{ fontFamily: F_DISPLAY, fontSize: "18px", fontWeight: "700", color: m.result === "W" ? WIN_GOLD : LOSS_RED, lineHeight: 1 }}>
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
          );
        })()}

        {/* ══════════════════════════════════════════
            DRAWS TAB — personal competition view
        ══════════════════════════════════════════ */}
        {activeTab === "tournaments" && (
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
          <FixturesTab fixturesExpanded={fixturesExpanded} setFixturesExpanded={setFixturesExpanded} seasonYear={settings.seasonYear || new Date().getFullYear()} />
        )}
                {/* ══════════════════════════════════════════
            MEMBERS TAB
        ══════════════════════════════════════════ */}
        {activeTab === "members" && (
          <MembersTab
            filteredMembers={filteredMembers}
            groupedMembers={groupedMembers}
            memberSearch={memberSearch} setMemberSearch={setMemberSearch}
            activeSection={activeSection}
            fileInputRef={fileInputRef} handleFileChange={handleFileChange}
            downloadCSV={downloadCSV}
            uploadMsg={uploadMsg}
            editingId={editingId} setEditingId={setEditingId}
            editName={editName} setEditName={setEditName}
            editPhone={editPhone} setEditPhone={setEditPhone}
            editSection={editSection} setEditSection={setEditSection}
            saveEdit={saveEdit}
            startEdit={startEdit}
            confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete}
            deleteMember={deleteMember}
            showAddMemberSheet={showAddMemberSheet} setShowAddMemberSheet={setShowAddMemberSheet}
            newName={newName} setNewName={setNewName}
            newPhone={newPhone} setNewPhone={setNewPhone}
            newSection={newSection} setNewSection={setNewSection}
            addMember={addMember}
          />
        )}

        {/* ══════════════════════════════════════════
            SETTINGS TAB
        ══════════════════════════════════════════ */}
        {activeTab === "settings" && (() => {
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
              tournaments={TOURNAMENTS}
              defaultTournamentIds={DEFAULT_TOURNAMENTS.map(t => t.id)}
              compOverrides={compOverrides}
              onAddComp={openAddComp}
              onEditComp={openEditComp}
              onAddPersonalComp={openAddPersonalComp}
              onEditCompDates={openRoundDatesEditor}
              masterRoundDates={masterRoundDates}
              isSuperAdmin={isSuperAdmin}
              superAdminName={superAdminName}
              makeMeSuperAdmin={makeMeSuperAdmin}
              onBack={() => navigateTo(prevTab)}
            />
          );
        })()}

        {/* ══════════════════════════════════════════
            __SETTINGS_PLACEHOLDER_REMOVED__
        ══════════════════════════════════════════ */}
                {/* ══════════════════════════════════════════
            HELP TAB
        ══════════════════════════════════════════ */}
        {activeTab === "help" && <HelpTab seasonYear={settings.seasonYear || new Date().getFullYear()} />}
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
                {DEFAULT_TOURNAMENTS.some(t => t.id === editCompId) ? "Reset" : "Delete"}
              </button>
            )}
            <button onClick={() => setShowManageCompsSheet(false)}
              style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "13px 14px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI }}>
              Cancel
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* ── MASTER ROUND DATES SHEET ── */}
      <BottomSheet open={showRoundDatesSheet} onClose={() => setShowRoundDatesSheet(false)} title="Master Round Dates">
        <div style={{ marginBottom: "10px", fontSize: "12px", color: TEXT2, fontFamily: F_UI }}>
          Set once for this competition. Every member will see these dates by default.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
          {roundDatesValues.map((d, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "74px", fontSize: "11px", color: TEXT2, fontFamily: F_UI, fontWeight: "600" }}>Round {i + 1}</div>
              <input type="date" value={d || ""} onChange={e => setRoundDatesValues(prev => prev.map((v, idx) => idx === i ? e.target.value : v))}
                style={{ flex: 1, boxSizing: "border-box", padding: "9px 10px", border: `1px solid ${BORDER}`, borderRadius: "7px", fontSize: "13px", fontFamily: F_UI, outline: "none", color: TEXT, background: SURFACE }} />
            </div>
          ))}
        </div>
        <button onClick={() => setRoundDatesValues(prev => [...prev, ""])}
          style={{ width: "100%", background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "10px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI, marginBottom: "12px" }}>
          + Add Round
        </button>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={saveRoundDatesEditor}
            style={{ flex: 1, background: MID, border: "none", borderRadius: "8px", color: "#fff", padding: "12px", fontSize: "13px", cursor: "pointer", fontFamily: F_UI, fontWeight: "700" }}>
            Save Dates
          </button>
          <button onClick={resetRoundDatesEditor}
            style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "12px 14px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI }}>
            Reset
          </button>
          <button onClick={() => setShowRoundDatesSheet(false)}
            style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: "8px", color: TEXT2, padding: "12px 14px", fontSize: "12px", cursor: "pointer", fontFamily: F_UI }}>
            Cancel
          </button>
        </div>
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
              <button key={id} onClick={() => navigateTo(id)} style={{
                flex: 1, background: "transparent", border: "none",
                borderTop: isActive ? `3px solid ${GREEN}` : "3px solid transparent",
                color: isActive ? GREEN : TEXT3,
                padding: "8px 4px 6px", cursor: "pointer",
                fontFamily: F_UI, fontWeight: "600",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: "3px",
                minHeight: "56px",
                transition: "color 0.12s, border-color 0.12s",
                WebkitTapHighlightColor: "transparent",
              }}>
                <Icon size={22} strokeWidth={isActive ? 2.2 : 1.5} />
                <span style={{ fontSize: "10px", letterSpacing: "0.05em", textTransform: "uppercase", lineHeight: 1 }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}

