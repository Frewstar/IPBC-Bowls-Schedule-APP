import { useState, useMemo, useEffect, useRef } from "react";

// ── DEFAULT MEMBER DIRECTORY ───────────────────────────────────────────────
const DEFAULT_MEMBERS = [
  { id: "1",   name: "C ADRAIN",          phone: "07881 785136", section: "gents" },
  { id: "2",   name: "C ALLEN",           phone: "07715 953760", section: "gents" },
  { id: "3",   name: "H J ARKISON",       phone: "07743 963610", section: "gents" },
  { id: "4",   name: "N BARR",            phone: "07736 443637", section: "gents" },
  { id: "5",   name: "R BIGGAR",          phone: "07598 878951", section: "gents" },
  { id: "6",   name: "F BIGHAM",          phone: "07931 185442", section: "gents" },
  { id: "7",   name: "G BOYCE",           phone: "07511 384583", section: "gents" },
  { id: "8",   name: "J BOYCE",           phone: "07378 772419", section: "gents" },
  { id: "9",   name: "R BOYD",            phone: "07958 165842", section: "gents" },
  { id: "10",  name: "S BOYD",            phone: "07568 755337", section: "gents" },
  { id: "11",  name: "J BRADFORD",        phone: "07542 138774", section: "gents" },
  { id: "12",  name: "D BROWN",           phone: "07756 082935", section: "gents" },
  { id: "13",  name: "J BROWN",           phone: "07368 175335", section: "gents" },
  { id: "14",  name: "W BROWN",           phone: "07971 405588", section: "gents" },
  { id: "15",  name: "M BURNS",           phone: "07977 553737", section: "gents" },
  { id: "16",  name: "D CASSAP",          phone: "07399 401487", section: "gents" },
  { id: "17",  name: "P CASSAP",          phone: "07378 930630", section: "gents" },
  { id: "18",  name: "I CHAPMAN",         phone: "07720 760060", section: "gents" },
  { id: "19",  name: "T CLARK",           phone: "",             section: "gents" },
  { id: "20",  name: "J COOPER",          phone: "07391 904386", section: "gents" },
  { id: "21",  name: "W COOPER",          phone: "07745 630845", section: "gents" },
  { id: "22",  name: "I COUSAR",          phone: "07476 006413", section: "gents" },
  { id: "23",  name: "T CRANCHER",        phone: "07891 937992", section: "gents" },
  { id: "24",  name: "M DEMPSEY",         phone: "07721 507066", section: "gents" },
  { id: "25",  name: "A DEUTSCH",         phone: "07715 394132", section: "gents" },
  { id: "26",  name: "G DEVOY",           phone: "07974 308268", section: "gents" },
  { id: "27",  name: "M DUNCAN",          phone: "07899 696810", section: "gents" },
  { id: "28",  name: "M DUNLOP",          phone: "07551 282557", section: "gents" },
  { id: "29",  name: "W DUNLOP",          phone: "07821 604385", section: "gents" },
  { id: "30",  name: "A EASDON",          phone: "07724 955344", section: "gents" },
  { id: "31",  name: "B ENGLISH",         phone: "07707 173604", section: "gents" },
  { id: "32",  name: "C FINNIGAN",        phone: "07709 085372", section: "gents" },
  { id: "33",  name: "T FINNIGAN",        phone: "07849 122561", section: "gents" },
  { id: "34",  name: "D FLYNN",           phone: "07879 007060", section: "gents" },
  { id: "35",  name: "A FREW",            phone: "07476 698413", section: "gents" },
  { id: "36",  name: "E FREW",            phone: "07895 182662", section: "gents" },
  { id: "37",  name: "J FREW",            phone: "07846 827705", section: "gents" },
  { id: "38",  name: "T FULLER",          phone: "07514 991816", section: "gents" },
  { id: "39",  name: "S GIBSON",          phone: "07547 878505", section: "gents" },
  { id: "40",  name: "R GILMOUR",         phone: "07881 104946", section: "gents" },
  { id: "41",  name: "G GUNION",          phone: "07891 123206", section: "gents" },
  { id: "42",  name: "D HALL",            phone: "07833 524010", section: "gents" },
  { id: "43",  name: "G HALL",            phone: "07930 278563", section: "gents" },
  { id: "44",  name: "D HARGREAVES",      phone: "07828 909118", section: "gents" },
  { id: "45",  name: "D HAWTHORN",        phone: "07727 233639", section: "gents" },
  { id: "46",  name: "I HARWOOD",         phone: "07902 182752", section: "gents" },
  { id: "47",  name: "L HINDMARSH",       phone: "07740 947592", section: "gents" },
  { id: "48",  name: "D HODALSKI",        phone: "07807 201664", section: "gents" },
  { id: "49",  name: "R HODALSKI",        phone: "07481 236506", section: "gents" },
  { id: "50",  name: "J IRVINE",          phone: "07541 363109", section: "gents" },
  { id: "51",  name: "J KELLY",           phone: "07518 360750", section: "gents" },
  { id: "52",  name: "I KERR",            phone: "07561 683171", section: "gents" },
  { id: "53",  name: "C KINNIBURGH",      phone: "07955 623816", section: "gents" },
  { id: "54",  name: "I KINNIBURGH",      phone: "07564 953076", section: "gents" },
  { id: "55",  name: "T KINNIBURGH",      phone: "07955 623776", section: "gents" },
  { id: "56",  name: "L KIRKLAND",        phone: "07402 348205", section: "gents" },
  { id: "57",  name: "M KIRKLAND",        phone: "07928 912407", section: "gents" },
  { id: "58",  name: "B KIRKPATRICK",     phone: "07376 071097", section: "gents" },
  { id: "59",  name: "T KIRKPATRICK",     phone: "07821 804670", section: "gents" },
  { id: "60",  name: "W KIRKWOOD",        phone: "07861 781837", section: "gents" },
  { id: "61",  name: "W KIRKWOOD JNR",    phone: "07585 903757", section: "gents" },
  { id: "62",  name: "R LAUGHLAN",        phone: "07470 796252", section: "gents" },
  { id: "63",  name: "J LAW",             phone: "",             section: "gents" },
  { id: "64",  name: "J LEITCH",          phone: "07792 162024", section: "gents" },
  { id: "65",  name: "S LEITCH",          phone: "07870 571844", section: "gents" },
  { id: "66",  name: "H LISSETT",         phone: "07530 043905", section: "gents" },
  { id: "67",  name: "A LOGAN",           phone: "07377 540747", section: "gents" },
  { id: "68",  name: "J LYNN",            phone: "07840 257748", section: "gents" },
  { id: "69",  name: "SAM LYNN",          phone: "07526 326498", section: "gents" },
  { id: "70",  name: "STEVIE LYNN",       phone: "07923 443084", section: "gents" },
  { id: "71",  name: "F McCAFFERTY",      phone: "07866 238721", section: "gents" },
  { id: "72",  name: "W McCANN",          phone: "07532 346417", section: "gents" },
  { id: "73",  name: "I McCLYMONT",       phone: "07769 675933", section: "gents" },
  { id: "74",  name: "S McCLYMONT",       phone: "07776 126901", section: "gents" },
  { id: "75",  name: "G McCORMACK",       phone: "07719 329136", section: "gents" },
  { id: "76",  name: "C McINTOSH",        phone: "07881 953270", section: "gents" },
  { id: "77",  name: "I McINTYRE",        phone: "07526 432155", section: "gents" },
  { id: "78",  name: "D McKAY",           phone: "07944 754819", section: "gents" },
  { id: "79",  name: "K McKENNA",         phone: "07999 482545", section: "gents" },
  { id: "80",  name: "N McKINNON",        phone: "07925 298234", section: "gents" },
  { id: "81",  name: "R McLAUGHLAN",      phone: "07850 977436", section: "gents" },
  { id: "82",  name: "A McLEOD",          phone: "07798 725293", section: "gents" },
  { id: "83",  name: "D McMANUS",         phone: "07584 020901", section: "gents" },
  { id: "84",  name: "J McMILLAN",        phone: "07842 958649", section: "gents" },
  { id: "85",  name: "J H McNEIL",        phone: "07596 155750", section: "gents" },
  { id: "86",  name: "W McVEY",           phone: "07718 866503", section: "gents" },
  { id: "87",  name: "I MACFARLANE",      phone: "07745 507894", section: "gents" },
  { id: "88",  name: "E MACKIE",          phone: "07718 091015", section: "gents" },
  { id: "89",  name: "G MATHIESON",       phone: "07715 303749", section: "gents" },
  { id: "90",  name: "A MAXWELL",         phone: "07907 591068", section: "gents" },
  { id: "91",  name: "J MILLAR",          phone: "07968 161136", section: "gents" },
  { id: "92",  name: "S MILLAR",          phone: "07769 277200", section: "gents" },
  { id: "93",  name: "J MORRISON",        phone: "07593 885248", section: "gents" },
  { id: "94",  name: "D MUNRO",           phone: "07738 283415", section: "gents" },
  { id: "95",  name: "A MURRAY",          phone: "07879 664627", section: "gents" },
  { id: "96",  name: "R MURRAY",          phone: "07517 953360", section: "gents" },
  { id: "97",  name: "W MURRAY",          phone: "07867 655112", section: "gents" },
  { id: "98",  name: "B NELSON",          phone: "07519 172804", section: "gents" },
  { id: "99",  name: "R PATERSON",        phone: "07742 559744", section: "gents" },
  { id: "100", name: "W PATTERSON",       phone: "07503 196219", section: "gents" },
  { id: "101", name: "A PRENTICE",        phone: "07462 070225", section: "gents" },
  { id: "102", name: "C PROPHET",         phone: "07971 452549", section: "gents" },
  { id: "103", name: "C R PROPHET",       phone: "07827 444831", section: "gents" },
  { id: "104", name: "G PROPHET",         phone: "07818 700386", section: "gents" },
  { id: "105", name: "A REID",            phone: "07790 613321", section: "gents" },
  { id: "106", name: "I ROBERTSON",       phone: "07768 606284", section: "gents" },
  { id: "107", name: "D ROBSON",          phone: "07842 231627", section: "gents" },
  { id: "108", name: "J SEENAN",          phone: "07592 669163", section: "gents" },
  { id: "109", name: "I SHEPHERD",        phone: "07835 477130", section: "gents" },
  { id: "110", name: "J SINCLAIR",        phone: "07787 687768", section: "gents" },
  { id: "111", name: "S SINCLAIR",        phone: "07833 206031", section: "gents" },
  { id: "112", name: "D SMITH",           phone: "07720 381263", section: "gents" },
  { id: "113", name: "T SMITH",           phone: "07849 045548", section: "gents" },
  { id: "114", name: "C SPROAT",          phone: "07927 012566", section: "gents" },
  { id: "115", name: "J STANNERS",        phone: "07305 482898", section: "gents" },
  { id: "116", name: "D STEVENSON",       phone: "07484 648477", section: "gents" },
  { id: "117", name: "W TODD",            phone: "",             section: "gents" },
  { id: "118", name: "N TURNBULL",        phone: "07455 950224", section: "gents" },
  { id: "119", name: "D TURNER",          phone: "07473 956052", section: "gents" },
  { id: "120", name: "J WADDELL",         phone: "07544 104351", section: "gents" },
  { id: "121", name: "E WAINWRIGHT",      phone: "",             section: "gents" },
  { id: "122", name: "J WALSH",           phone: "07521 666740", section: "gents" },
  { id: "123", name: "S WELLS",           phone: "07919 095976", section: "gents" },
  { id: "124", name: "K WENBAN",          phone: "07763 018226", section: "gents" },
  { id: "125", name: "C WILLIAMS",        phone: "07812 341757", section: "gents" },
  { id: "126", name: "C R WILLIAMS",      phone: "07708 380120", section: "gents" },
  { id: "127", name: "C WILLIAMSON",      phone: "07453 293138", section: "gents" },
  { id: "128", name: "E WILLIAMSON",      phone: "07919 187151", section: "gents" },
  { id: "129", name: "G WILLIAMSON",      phone: "07854 389420", section: "gents" },
  { id: "130", name: "M WILLIAMSON",      phone: "07703 446861", section: "gents" },
  { id: "131", name: "SCOTT WILLIAMSON",  phone: "07498 308270", section: "gents" },
  { id: "132", name: "STUART WILLIAMSON", phone: "07874 157328", section: "gents" },
  { id: "133", name: "DAVID WILSON",      phone: "07584 501462", section: "gents" },
  { id: "134", name: "DEREK WILSON",      phone: "07999 930701", section: "gents" },
  { id: "135", name: "D YOUNG",           phone: "07512 152079", section: "gents" },
  { id: "136", name: "C ZIKMANN",         phone: "07575 111884", section: "gents" },
];

// ── TOURNAMENT DATA ────────────────────────────────────────────────────────
const TOURNAMENTS = [
  {
    id: "championship", name: "Championship", type: "Singles", color: "#ef4444",
    rounds: ["1st Round\n9th June","2nd Round\n30th June","3rd Round\n13th July","4th Round\n11th Aug","Semi Final\n21st Aug","Final"],
  },
  {
    id: "presidents", name: "Presidents", type: "Singles", color: "#f59e0b",
    rounds: ["1st Round\n1st June","2nd Round\n29th June","3rd Round\n29th July","4th Round\n10th Aug","Semi Final\n21st Aug","Final"],
  },
  {
    id: "morton", name: "Morton", type: "Singles", color: "#06b6d4",
    rounds: ["1st Round\n25th May","2nd Round\n19th June","3rd Round\n9th July","4th Round\n30th July","Semi Final\n21st Aug","Final"],
  },
  {
    id: "donaldson", name: "Donaldson", type: "Singles", color: "#ec4899",
    rounds: ["1st Round\n25th May","2nd Round\n17th June","3rd Round\n11th July","4th Round\n3rd Aug","Semi Final\n21st Aug","Final"],
  },
  {
    id: "mitchell", name: "Mitchell Handicap", type: "Handicap", color: "#84cc16",
    rounds: ["1st Round\n18th May","2nd Round\n8th June","3rd Round\n9th July","4th Round\n30th July","Semi Final\n21st Aug","Final"],
  },
  {
    id: "pairs", name: "Pairs", type: "Pairs", color: "#f97316",
    rounds: ["1st Round\n19th June","2nd Round\n9th July","3rd Round\n27th July","Semi Final\n21st Dec","Final"],
  },
  {
    id: "triples", name: "Triples", type: "Triples", color: "#10b981",
    rounds: ["1st Round\n9th June","2nd Round\n29th July","3rd Round\n27th July","Semi Final\n31st Aug","Final"],
  },
  {
    id: "rinks", name: "Rinks", type: "Rinks", color: "#8b5cf6",
    rounds: ["1st Round\n26th June","2nd Round\n28th July","Semi Final\n11th Aug","Final"],
  },
  {
    id: "mixed-pairs", name: "Mixed Pairs", type: "Mixed Pairs", color: "#a78bfa",
    rounds: ["1st Round\n1st June","2nd Round\n29th June","3rd Round\n15th July","4th Round\n27th July"],
  },
];

// ── STORAGE ────────────────────────────────────────────────────────────────
const MEMBERS_KEY = "bowls_members_v1";
const TIES_KEY    = "bowls_ties_v2";

function load(key, fallback) {
  try { const r = localStorage.getItem(key); if (r) return JSON.parse(r); } catch {}
  return fallback;
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── CSV helpers ────────────────────────────────────────────────────────────
function membersToCSV(members) {
  const rows = [["Name", "Phone", "Section"]];
  members
    .slice()
    .sort((a, b) => getSurname(a.name).localeCompare(getSurname(b.name)))
    .forEach(m => rows.push([m.name, m.phone || "", m.section || "gents"]));
  return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const header = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim().toLowerCase());
  const nameIdx    = header.indexOf("name");
  const phoneIdx   = header.indexOf("phone");
  const sectionIdx = header.indexOf("section");
  if (nameIdx === -1) return null;

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].match(/("(?:[^"]|"")*"|[^,]*)/g).map(c => c.replace(/^"|"$/g, "").replace(/""/g, '"').trim());
    const name = cols[nameIdx]?.toUpperCase().trim();
    if (!name) continue;
    const phone   = phoneIdx   !== -1 ? (cols[phoneIdx]   || "").trim() : "";
    const section = sectionIdx !== -1 ? (cols[sectionIdx] || "gents").toLowerCase().trim() : "gents";
    results.push({ id: Date.now().toString() + i, name, phone, section: section === "ladies" ? "ladies" : "gents" });
  }
  return results.length ? results : null;
}

// ── HELPERS ────────────────────────────────────────────────────────────────
const GREEN      = "#1a1f2e";   // IPBC dark charcoal/navy
const MID        = "#2c3350";   // mid navy
const GOLD       = "#c9a84c";   // IPBC gold
const GOLD_LIGHT = "#e8c96a";   // lighter gold for hover/accents
const LIGHT      = "#c9a84c";   // alias — used throughout as accent
const BG         = "#f5f4f0";   // warm off-white
const LADIES     = "#7b1d2e";   // burgundy for ladies section
const LADIES_MID = "#a0293e";

function getSurname(name) { return name.trim().split(/\s+/).slice(-1)[0].toUpperCase(); }

function MemberPill({ name, phone, color = MID }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: `${color}15`, border: `1px solid ${color}44`, borderRadius: "20px", padding: "4px 10px" }}>
      <span style={{ fontSize: "13px", fontWeight: "bold", color: GREEN }}>{name}</span>
      {phone && <a href={`tel:${phone.replace(/\s/g,"")}`} style={{ fontSize: "11px", color: MID, textDecoration: "none" }}>📞 {phone}</a>}
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

  // ── Section toggle (used across tabs) ──
  const [activeSection, setActiveSection] = useState("gents");
  const accentColor = activeSection === "ladies" ? LADIES_MID : GOLD;
  const accentDark  = activeSection === "ladies" ? LADIES     : GREEN;

  // ── My Ties state ──
  const [myName, setMyName]       = useState(() => load("bowls_myname", "") || "");
  const [settingName, setSettingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [addingTie, setAddingTie] = useState(false);
  const [tieComp, setTieComp]     = useState("");
  const [tieRound, setTieRound]   = useState(0);
  const [oppSearch, setOppSearch] = useState("");
  const [oppPicked, setOppPicked] = useState(null);
  const [scoringId, setScoringId] = useState(null);
  const [myScore, setMyScore]     = useState("");
  const [oppScore, setOppScore]   = useState("");
  const [delTie, setDelTie]       = useState(null);

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
  const fileInputRef = useRef(null);

  // ── Draws tab state ──
  const [activeTournament, setActiveTournament] = useState(null);
  const [activeRound, setActiveRound]           = useState(0);

  useEffect(() => { save(MEMBERS_KEY, members); }, [members]);
  useEffect(() => { save(TIES_KEY, ties); },       [ties]);
  useEffect(() => { save("bowls_myname", myName); }, [myName]);

  // ── Derived ──
  const sectionMembers = useMemo(() => members.filter(m => (m.section || "gents") === activeSection), [members, activeSection]);

  const myTiesList = useMemo(() =>
    Object.values(ties)
      .filter(t => t.myName === myName)
      .sort((a, b) => a.tournamentId.localeCompare(b.tournamentId) || a.roundIdx - b.roundIdx),
    [ties, myName]
  );
  const wins   = myTiesList.filter(t => t.result === "W").length;
  const losses = myTiesList.filter(t => t.result === "L").length;

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
        round: t.rounds[tieRound], roundIdx: tieRound,
        opponent: oppPicked.name, oppPhone: oppPicked.phone,
        myScore: null, oppScore: null, result: null,
      }
    }));
    setAddingTie(false); setTieComp(""); setTieRound(0); setOppSearch(""); setOppPicked(null);
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
      if (!parsed) { setUploadMsg("⚠️ Could not read file — check it has Name, Phone, Section columns."); return; }
      setMembers(parsed);
      setUploadMsg(`✅ Loaded ${parsed.length} members from file.`);
      setTimeout(() => setUploadMsg(null), 4000);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const TABS = [
    { id: "myties",      label: "🎯 My Ties"   },
    { id: "search",      label: "🔍 Find"       },
    { id: "tournaments", label: "🏆 Draws"      },
    { id: "members",     label: "📋 Members"    },
  ];

  const selectedT = activeTournament ? TOURNAMENTS.find(t => t.id === activeTournament) : null;

  // ── Section toggle pill ──
  function SectionToggle({ style = {} }) {
    return (
      <div style={{ display: "inline-flex", background: "rgba(0,0,0,0.25)", border: `1px solid ${GOLD}33`, borderRadius: "20px", padding: "3px", ...style }}>
        {["gents","ladies"].map(s => (
          <button key={s} onClick={() => setActiveSection(s)} style={{
            background: activeSection === s ? GOLD : "transparent",
            border: "none", borderRadius: "18px",
            color: activeSection === s ? GREEN : "rgba(255,255,255,0.65)",
            padding: "5px 16px", fontSize: "12px", cursor: "pointer",
            fontFamily: "inherit", fontWeight: activeSection === s ? "bold" : "normal",
            transition: "all 0.15s",
            boxShadow: activeSection === s ? `0 1px 6px rgba(0,0,0,0.3)` : "none",
          }}>{s === "gents" ? "⛳ Gents" : "🌸 Ladies"}</button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Palatino Linotype','Book Antiqua',Palatino,serif" }}>

      {/* ── HEADER ── */}
      <div style={{ background: `linear-gradient(160deg, ${activeSection === "ladies" ? "#2a0a12" : "#12172b"} 0%, ${activeSection === "ladies" ? LADIES : MID} 100%)`, padding: "0", boxShadow: "0 4px 24px rgba(0,0,0,0.45)" }}>

        {/* Powered-by bar */}
        <div style={{ background: "rgba(0,0,0,0.3)", padding: "4px 16px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "5px" }}>
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)", letterSpacing: "1px", textTransform: "uppercase" }}>Powered by</span>
          <span style={{ fontSize: "10px" }}>⭐</span>
          <span style={{ fontSize: "10px", fontWeight: "900", color: "rgba(255,255,255,0.55)", letterSpacing: "2px", textTransform: "uppercase" }}>Frewstar</span>
        </div>

        <div style={{ padding: "14px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" }}>

            {/* Club logo */}
            <img
              src="ipbc-logo.png"
              alt="Irvine Park Bowling Club"
              style={{ height: "56px", width: "auto", flexShrink: 0, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" }}
              onError={e => {
                e.target.style.display = "none";
                e.target.nextSibling.style.display = "flex";
              }}
            />
            {/* Fallback if image not found yet */}
            <div style={{ display: "none", width: "52px", height: "52px", borderRadius: "8px", background: GOLD, alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "22px", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
              🎯
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "9px", letterSpacing: "3px", color: GOLD, textTransform: "uppercase", marginBottom: "3px", opacity: 0.8 }}>Bowls Manager</div>
              <h1 style={{ margin: 0, fontSize: "17px", color: "#fff", fontWeight: "bold", letterSpacing: "0.2px", lineHeight: 1.15 }}>Irvine Park</h1>
              <h1 style={{ margin: 0, fontSize: "17px", color: GOLD, fontWeight: "bold", letterSpacing: "0.2px", lineHeight: 1.15 }}>Bowling Club</h1>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginTop: "3px" }}>
                {activeSection === "ladies" ? "🌸 Ladies Section" : "⛳ Gents Section"} · 2025
              </div>
            </div>

            {myName && (
              <button onClick={() => { setSettingName(true); setNameInput(myName); }}
                style={{ background: "rgba(255,255,255,0.1)", border: `1px solid ${GOLD}55`, borderRadius: "20px", color: GOLD, padding: "5px 12px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                👤 {myName}
              </button>
            )}
          </div>

          {/* Gold divider */}
          <div style={{ height: "1px", background: `linear-gradient(to right, ${GOLD}44, ${GOLD}88, ${GOLD}44)`, marginBottom: "12px" }} />

          <div style={{ marginBottom: "10px" }}>
            <SectionToggle />
          </div>

          <div style={{ display: "flex", gap: "2px", overflowX: "auto" }}>
            {TABS.map(({ id, label }) => (
              <button key={id} onClick={() => setActiveTab(id)} style={{
                background: activeTab === id ? "#fff" : "transparent", border: "none",
                borderRadius: "8px 8px 0 0",
                color: activeTab === id ? (activeSection === "ladies" ? LADIES : GREEN) : "rgba(255,255,255,0.65)",
                padding: "8px 14px", fontSize: "12px", cursor: "pointer",
                fontWeight: activeTab === id ? "700" : "400", fontFamily: "inherit", whiteSpace: "nowrap",
                borderBottom: activeTab === id ? "none" : `2px solid transparent`,
              }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "14px", maxWidth: "680px", margin: "0 auto" }}>

        {/* ══════════════════════════════════════════
            MY TIES TAB
        ══════════════════════════════════════════ */}
        {activeTab === "myties" && (
          <div>
            {(!myName || settingName) ? (
              <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", textAlign: "center" }}>
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>👤</div>
                <div style={{ fontSize: "15px", fontWeight: "bold", color: GREEN, marginBottom: "4px" }}>Who are you?</div>
                <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "16px" }}>Enter your name to track your ties</div>
                <input value={nameInput} onChange={e => setNameInput(e.target.value.toUpperCase())}
                  placeholder="e.g. J FREW" autoFocus
                  style={{ width: "100%", boxSizing: "border-box", padding: "11px", fontSize: "16px", border: `2px solid ${accentColor}`, borderRadius: "8px", outline: "none", fontFamily: "inherit", color: GREEN, background: "#fdf0f2", textAlign: "center", marginBottom: "10px" }} />
                <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                  <button onClick={saveName} style={{ background: accentColor, border: "none", borderRadius: "8px", color: "#fff", padding: "10px 24px", fontSize: "14px", cursor: "pointer", fontFamily: "inherit", fontWeight: "bold" }}>Confirm</button>
                  {settingName && <button onClick={() => setSettingName(false)} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", color: "#6b7280", padding: "10px 16px", fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>}
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                  {[
                    { label: "Played", val: myTiesList.length, bg: GREEN,     col: "#fff"     },
                    { label: "Won",    val: wins,              bg: "#1a4731", col: "#6ee7a0"  },
                    { label: "Lost",   val: losses,            bg: "#7f1d1d", col: "#fca5a5"  },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: "10px", padding: "10px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: "24px", fontWeight: "bold", color: s.col, lineHeight: 1 }}>{s.val}</div>
                      <div style={{ fontSize: "10px", color: "#94a3b8", letterSpacing: "1px", textTransform: "uppercase", marginTop: "2px" }}>{s.label}</div>
                    </div>
                  ))}
                  <button onClick={() => { setAddingTie(true); setTieComp(""); setTieRound(0); setOppSearch(""); setOppPicked(null); }}
                    style={{ flex: 1, background: accentColor, border: "none", borderRadius: "10px", color: "#fff", fontSize: "11px", cursor: "pointer", fontFamily: "inherit", fontWeight: "bold", padding: "8px", lineHeight: 1.3 }}>
                    ＋ Add<br/>Tie
                  </button>
                </div>

                {addingTie && (
                  <div style={{ background: "#fdf0f2", border: `1px solid ${LIGHT}88`, borderRadius: "12px", padding: "16px", marginBottom: "14px" }}>
                    <div style={{ fontSize: "13px", fontWeight: "bold", color: accentColor, marginBottom: "12px", letterSpacing: "1px", textTransform: "uppercase" }}>New Tie</div>
                    <div style={{ marginBottom: "10px" }}>
                      <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px" }}>Competition</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {TOURNAMENTS.map(t => (
                          <button key={t.id} onClick={() => { setTieComp(t.id); setTieRound(0); }} style={{
                            background: tieComp === t.id ? t.color : "#fff",
                            border: `1px solid ${tieComp === t.id ? t.color : "#e5e7eb"}`,
                            borderRadius: "7px", color: tieComp === t.id ? "#fff" : "#374151",
                            padding: "6px 11px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: tieComp === t.id ? "bold" : "normal",
                          }}>{t.name}</button>
                        ))}
                      </div>
                    </div>

                    {tieComp && (
                      <div style={{ marginBottom: "10px" }}>
                        <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px" }}>Round</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {TOURNAMENTS.find(t => t.id === tieComp)?.rounds.map((r, i) => (
                            <button key={i} onClick={() => setTieRound(i)} style={{
                              background: tieRound === i ? accentColor : "#fff",
                              border: `1px solid ${tieRound === i ? accentColor : "#e5e7eb"}`,
                              borderRadius: "7px", color: tieRound === i ? "#fff" : "#374151",
                              padding: "5px 10px", fontSize: "11px", cursor: "pointer", fontFamily: "inherit",
                              whiteSpace: "pre-line", textAlign: "center", lineHeight: "1.3",
                            }}>{r}</button>
                          ))}
                        </div>
                      </div>
                    )}

                    {tieComp && (
                      <div style={{ marginBottom: "10px" }}>
                        <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "1px" }}>Opponent</div>
                        {oppPicked ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <MemberPill name={oppPicked.name} phone={oppPicked.phone} />
                            <button onClick={() => { setOppPicked(null); setOppSearch(""); }} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: "16px" }}>✕</button>
                          </div>
                        ) : (
                          <>
                            <input value={oppSearch} onChange={e => setOppSearch(e.target.value)} placeholder="Type surname to search members…" autoFocus
                              style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", border: `2px solid ${accentColor}`, borderRadius: "8px", fontSize: "14px", outline: "none", fontFamily: "inherit", background: "#fff" }} />
                            {oppResults.length > 0 && (
                              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", marginTop: "4px", overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                                {oppResults.map(m => (
                                  <div key={m.id} onClick={() => { setOppPicked(m); setOppSearch(""); }}
                                    style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#f0faf4"}
                                    onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                                    <span style={{ fontSize: "13px", fontWeight: "bold", color: GREEN }}>{m.name}</span>
                                    {m.phone && <span style={{ fontSize: "11px", color: accentColor }}>📞 {m.phone}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                            {oppSearch.length >= 2 && oppResults.length === 0 && (
                              <div style={{ fontSize: "12px", color: "#9ca3af", padding: "8px 0" }}>No members found — they may not be in the directory yet</div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                      <button onClick={addTie} disabled={!tieComp || !oppPicked} style={{
                        background: tieComp && oppPicked ? accentColor : "#d1d5db", border: "none", borderRadius: "8px",
                        color: "#fff", padding: "10px 20px", fontSize: "13px", cursor: tieComp && oppPicked ? "pointer" : "default",
                        fontFamily: "inherit", fontWeight: "bold",
                      }}>Add Tie</button>
                      <button onClick={() => setAddingTie(false)} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", color: "#6b7280", padding: "10px 14px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                    </div>
                  </div>
                )}

                {myTiesList.length === 0 && !addingTie && (
                  <div style={{ background: "#fff", borderRadius: "12px", padding: "32px", textAlign: "center", color: "#9ca3af", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
                    <div style={{ fontSize: "32px", marginBottom: "8px" }}>🎯</div>
                    <div style={{ fontWeight: "bold", color: "#374151", marginBottom: "4px" }}>No ties added yet</div>
                    <div style={{ fontSize: "12px" }}>Tap "+ Add Tie" to record your first game</div>
                  </div>
                )}

                {myTiesList.map(tie => {
                  const isScoring = scoringId === tie.id;
                  const t = TOURNAMENTS.find(t => t.id === tie.tournamentId);
                  const color = t?.color || accentColor;
                  let cardBg = "#fff", resultLabel = "Not played yet", resultCol = "#9ca3af";
                  if (tie.result === "W") { cardBg = "#f0fdf4"; resultLabel = `✅ WON  ${tie.myScore}–${tie.oppScore}`; resultCol = "#16a34a"; }
                  if (tie.result === "L") { cardBg = "#fef2f2"; resultLabel = `❌ LOST  ${tie.myScore}–${tie.oppScore}`; resultCol = "#dc2626"; }
                  if (tie.myScore !== null && tie.result === null) { cardBg = "#fefce8"; resultLabel = `⏳ ${tie.myScore}–${tie.oppScore} (in progress)`; resultCol = "#ca8a04"; }

                  return (
                    <div key={tie.id} style={{ background: cardBg, borderRadius: "12px", padding: "13px", marginBottom: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", borderLeft: `4px solid ${color}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <span style={{ fontSize: "11px", background: `${color}22`, color, padding: "2px 8px", borderRadius: "10px", fontWeight: "bold" }}>{tie.tournament}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "11px", color: "#64748b" }}>{tie.round}</span>
                          <button onClick={() => setDelTie(tie.id)} style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer", fontSize: "14px", padding: "0 2px" }}>✕</button>
                        </div>
                      </div>

                      {delTie === tie.id ? (
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", padding: "6px 0" }}>
                          <span style={{ fontSize: "13px", color: "#991b1b", flex: 1 }}>Remove this tie?</span>
                          <button onClick={() => { setTies(prev => { const n = {...prev}; delete n[tie.id]; return n; }); setDelTie(null); }} style={{ background: "#dc2626", border: "none", borderRadius: "6px", color: "#fff", padding: "5px 12px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
                          <button onClick={() => setDelTie(null)} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "6px", color: "#6b7280", padding: "5px 10px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>Keep</button>
                        </div>
                      ) : isScoring ? (
                        <div>
                          <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "8px" }}>First to 21 wins</div>
                          <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", marginBottom: "10px" }}>
                            <div style={{ flex: 1, textAlign: "center" }}>
                              <div style={{ fontSize: "10px", color: "#9ca3af", marginBottom: "4px" }}>{myName}</div>
                              <input type="number" min="0" max="21" value={myScore} onChange={e => setMyScore(e.target.value)} autoFocus
                                style={{ width: "100%", boxSizing: "border-box", padding: "8px 4px", fontSize: "26px", fontWeight: "bold", border: `2px solid ${accentColor}`, borderRadius: "8px", textAlign: "center", outline: "none", fontFamily: "inherit", color: accentDark }} />
                            </div>
                            <div style={{ fontSize: "16px", color: "#d1d5db", paddingBottom: "10px" }}>v</div>
                            <div style={{ flex: 1, textAlign: "center" }}>
                              <div style={{ fontSize: "10px", color: "#9ca3af", marginBottom: "4px" }}>{tie.opponent}</div>
                              <input type="number" min="0" max="21" value={oppScore} onChange={e => setOppScore(e.target.value)}
                                style={{ width: "100%", boxSizing: "border-box", padding: "8px 4px", fontSize: "26px", fontWeight: "bold", border: "2px solid #d1d5db", borderRadius: "8px", textAlign: "center", outline: "none", fontFamily: "inherit" }} />
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button onClick={() => submitScore(tie.id)} style={{ flex: 1, background: accentColor, border: "none", borderRadius: "8px", color: "#fff", padding: "9px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", fontWeight: "bold" }}>Save</button>
                            <button onClick={() => { setScoringId(null); setMyScore(""); setOppScore(""); }} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", color: "#6b7280", padding: "9px 14px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "10px", color: "#9ca3af" }}>VS</div>
                            <div style={{ fontSize: "14px", fontWeight: "bold", color: "#374151" }}>{tie.opponent}</div>
                            {tie.oppPhone && <a href={`tel:${tie.oppPhone.replace(/\s/g,"")}`} style={{ fontSize: "11px", color: accentColor, textDecoration: "none" }}>📞 {tie.oppPhone}</a>}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "12px", fontWeight: "bold", color: resultCol, marginBottom: "4px" }}>{resultLabel}</div>
                            <button onClick={() => { setScoringId(tie.id); setMyScore(tie.myScore?.toString() || ""); setOppScore(tie.oppScore?.toString() || ""); }}
                              style={{ background: tie.result ? "#f1f5f9" : accentColor, border: "none", borderRadius: "7px", color: tie.result ? "#374151" : "#fff", padding: "6px 14px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: "bold" }}>
                              {tie.result ? "Edit" : "Score"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════
            FIND GAMES TAB
        ══════════════════════════════════════════ */}
        {activeTab === "search" && (
          <div>
            <div style={{ background: "#fff", borderRadius: "12px", padding: "16px", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", marginBottom: "12px" }}>
              <div style={{ fontSize: "12px", color: accentColor, fontWeight: "bold", marginBottom: "7px" }}>Enter a surname to find all games</div>
              <input type="text" placeholder="e.g. FREW, SMITH, BOYD…" value={search} onChange={e => setSearch(e.target.value)} autoFocus
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", fontSize: "16px", border: `2px solid ${accentColor}`, borderRadius: "8px", outline: "none", fontFamily: "inherit", color: GREEN, background: "#fdf0f2" }} />
            </div>
            {search.length >= 2 && playerGames.length === 0 && (
              <div style={{ background: "#fff", borderRadius: "12px", padding: "28px", textAlign: "center", color: "#9ca3af", boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>
                <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔍</div>
                No games found for <strong>"{search}"</strong>
              </div>
            )}
            {playerGames.map((g, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: "12px", padding: "13px", marginBottom: "9px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", borderLeft: `4px solid ${g.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "5px" }}>
                  <span style={{ fontSize: "11px", background: `${g.color}22`, color: g.color, padding: "2px 8px", borderRadius: "10px", fontWeight: "bold" }}>{g.tournament}</span>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>{g.date}</span>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <div style={{ flex: 1, background: `${g.color}11`, borderRadius: "8px", padding: "8px 10px" }}>
                    <div style={{ fontSize: "10px", color: "#9ca3af" }}>YOU</div>
                    <div style={{ fontSize: "13px", fontWeight: "bold", color: GREEN }}>{g.entry}</div>
                  </div>
                  <div style={{ fontSize: "12px", color: "#d1d5db" }}>VS</div>
                  <div style={{ flex: 1, background: "#f9fafb", borderRadius: "8px", padding: "8px 10px" }}>
                    <div style={{ fontSize: "10px", color: "#9ca3af" }}>OPPONENT</div>
                    <div style={{ fontSize: "13px", fontWeight: "bold", color: "#374151" }}>{g.opponent}</div>
                    {g.oppPhone && <a href={`tel:${g.oppPhone.replace(/\s/g,"")}`} style={{ fontSize: "11px", color: accentColor, textDecoration: "none" }}>📞 {g.oppPhone}</a>}
                  </div>
                </div>
              </div>
            ))}
            {!search && (
              <div style={{ background: "#fff", borderRadius: "12px", padding: "16px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "10px", fontWeight: "bold", letterSpacing: "1px", textTransform: "uppercase" }}>Competitions</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                  {TOURNAMENTS.map(t => (
                    <div key={t.id} style={{ background: `${t.color}15`, border: `1px solid ${t.color}44`, borderRadius: "7px", padding: "6px 11px", fontSize: "12px", color: t.color, fontWeight: "bold" }}>{t.name}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════
            DRAWS TAB
        ══════════════════════════════════════════ */}
        {activeTab === "tournaments" && (
          <div>
            {!activeTournament ? (
              <>
                <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "10px", letterSpacing: "1px", textTransform: "uppercase" }}>Select a competition</div>
                {TOURNAMENTS.map(t => (
                  <button key={t.id} onClick={() => { setActiveTournament(t.id); setActiveRound(0); }} style={{
                    width: "100%", background: "#fff", border: "1px solid #e5e7eb", borderLeft: `5px solid ${t.color}`,
                    borderRadius: "10px", padding: "12px 14px", marginBottom: "7px", cursor: "pointer",
                    textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center",
                    boxShadow: "0 1px 5px rgba(0,0,0,0.05)", fontFamily: "inherit",
                  }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: "bold", color: GREEN }}>{t.name}</div>
                      <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "1px" }}>{t.type} · 1st Round: {t.rounds[0]}</div>
                    </div>
                    <div style={{ fontSize: "18px", color: "#d1d5db" }}>›</div>
                  </button>
                ))}
              </>
            ) : (
              <div>
                <button onClick={() => setActiveTournament(null)} style={{ background: "none", border: "none", color: accentColor, cursor: "pointer", fontSize: "13px", padding: "0 0 10px", fontFamily: "inherit" }}>← Back</button>
                <div style={{ background: "#fff", borderRadius: "12px", padding: "13px", marginBottom: "11px", boxShadow: "0 2px 10px rgba(0,0,0,0.07)", borderTop: `4px solid ${selectedT.color}` }}>
                  <h2 style={{ margin: "0 0 3px", fontSize: "16px", color: GREEN }}>{selectedT.name}</h2>
                  <div style={{ fontSize: "11px", color: "#9ca3af" }}>{selectedT.type} · {(DRAW_ENTRIES[selectedT.id] || []).length} entries</div>
                </div>
                <div style={{ display: "flex", gap: "5px", marginBottom: "11px", overflowX: "auto", paddingBottom: "4px" }}>
                  {selectedT.rounds.map((r, i) => (
                    <button key={i} onClick={() => setActiveRound(i)} style={{
                      background: activeRound === i ? selectedT.color : "#fff",
                      border: `1px solid ${activeRound === i ? selectedT.color : "#e5e7eb"}`,
                      borderRadius: "7px", color: activeRound === i ? "#fff" : "#6b7280",
                      padding: "5px 10px", fontSize: "10px", cursor: "pointer", whiteSpace: "pre-line",
                      fontFamily: "inherit", fontWeight: activeRound === i ? "bold" : "normal", textAlign: "center", lineHeight: "1.4",
                    }}>{r}</button>
                  ))}
                </div>
                {activeRound === 0 ? (
                  (DRAW_ENTRIES[selectedT.id] || []).reduce((acc, entry, idx) => {
                    if (idx % 2 === 0) {
                      const p1 = entry, p2 = (DRAW_ENTRIES[selectedT.id] || [])[idx + 1];
                      const p1Phone = members.find(m => m.name.toUpperCase().includes(p1.split(" ").slice(-1)[0]))?.phone;
                      const p2Phone = p2 ? members.find(m => m.name.toUpperCase().includes(p2.split(" ").slice(-1)[0]))?.phone : null;
                      acc.push(
                        <div key={idx} style={{ background: "#fff", borderRadius: "9px", padding: "10px 12px", marginBottom: "6px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: "9px" }}>
                          <span style={{ fontSize: "10px", color: "#d1d5db", width: "18px", textAlign: "right", flexShrink: 0 }}>{Math.floor(idx/2)+1}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "12px", fontWeight: "bold", color: GREEN }}>{p1}</div>
                            {p1Phone && <a href={`tel:${p1Phone.replace(/\s/g,"")}`} style={{ fontSize: "10px", color: accentColor, textDecoration: "none" }}>📞 {p1Phone}</a>}
                          </div>
                          <div style={{ fontSize: "10px", color: "#d1d5db" }}>vs</div>
                          <div style={{ flex: 1, textAlign: "right" }}>
                            <div style={{ fontSize: "12px", fontWeight: "bold", color: "#374151" }}>{p2 || "Bye"}</div>
                            {p2Phone && <a href={`tel:${p2Phone.replace(/\s/g,"")}`} style={{ fontSize: "10px", color: accentColor, textDecoration: "none" }}>📞 {p2Phone}</a>}
                          </div>
                        </div>
                      );
                    }
                    return acc;
                  }, [])
                ) : (
                  <div style={{ background: "#fff", borderRadius: "12px", padding: "28px", textAlign: "center", color: "#9ca3af", boxShadow: "0 2px 10px rgba(0,0,0,0.07)" }}>
                    <div style={{ fontSize: "30px", marginBottom: "8px" }}>🏆</div>
                    <div style={{ fontWeight: "bold", color: "#374151", marginBottom: "4px" }}>{selectedT.rounds[activeRound]}</div>
                    <div style={{ fontSize: "12px" }}>Draw to be made after previous round</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════
            MEMBERS TAB
        ══════════════════════════════════════════ */}
        {activeTab === "members" && (
          <div>
            {/* Toolbar: search + add + download + upload */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <input type="text" placeholder="Search members…" value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                style={{ flex: 1, minWidth: "120px", padding: "9px 13px", fontSize: "14px", border: `2px solid ${accentColor}`, borderRadius: "8px", outline: "none", fontFamily: "inherit", color: GREEN, background: "#fdf0f2" }} />
              <button onClick={() => { setAddMode(true); setEditingId(null); setNewName(""); setNewPhone(""); setNewSection(activeSection); }}
                style={{ background: accentColor, border: "none", borderRadius: "8px", color: "#fff", padding: "9px 14px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", fontWeight: "bold", whiteSpace: "nowrap" }}>+ Add</button>
              <button onClick={downloadCSV}
                style={{ background: "#fff", border: `1px solid ${accentColor}`, borderRadius: "8px", color: accentColor, padding: "9px 12px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: "bold", whiteSpace: "nowrap" }}>⬇ CSV</button>
              <button onClick={() => fileInputRef.current?.click()}
                style={{ background: "#fff", border: `1px solid ${accentColor}`, borderRadius: "8px", color: accentColor, padding: "9px 12px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: "bold", whiteSpace: "nowrap" }}>⬆ Upload</button>
              <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFileChange} />
            </div>

            {uploadMsg && (
              <div style={{ background: uploadMsg.startsWith("✅") ? "#f0fdf4" : "#fef2f2", border: `1px solid ${uploadMsg.startsWith("✅") ? "#86efac" : "#fca5a5"}`, borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: uploadMsg.startsWith("✅") ? "#166534" : "#991b1b", marginBottom: "10px" }}>
                {uploadMsg}
              </div>
            )}

            <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "8px" }}>
              {filteredMembers.length} {activeSection} members · sorted by surname · CSV columns: Name, Phone, Section
            </div>

            {/* A–Z quick filter */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginBottom: "10px" }}>
              {["All","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"].map(l => (
                <button key={l} onClick={() => setMemberSearch(l === "All" ? "" : l)} style={{
                  background: (memberSearch.toUpperCase() === l || (l === "All" && !memberSearch)) ? accentColor : "#fff",
                  border: `1px solid ${(memberSearch.toUpperCase() === l || (l === "All" && !memberSearch)) ? accentColor : "#d1fae5"}`,
                  borderRadius: "5px", color: (memberSearch.toUpperCase() === l || (l === "All" && !memberSearch)) ? "#fff" : "#374151",
                  padding: "4px 6px", fontSize: "11px", cursor: "pointer", fontFamily: "inherit", fontWeight: "bold", minWidth: "26px", textAlign: "center",
                }}>{l}</button>
              ))}
            </div>

            {addMode && (
              <div style={{ background: "#fdf0f2", border: `1px solid ${LIGHT}88`, borderRadius: "12px", padding: "13px", marginBottom: "10px" }}>
                <div style={{ fontSize: "11px", fontWeight: "bold", color: accentColor, marginBottom: "8px", letterSpacing: "1px", textTransform: "uppercase" }}>New Member</div>
                <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
                  <input placeholder="Full name (e.g. J SMITH)" value={newName} onChange={e => setNewName(e.target.value.toUpperCase())}
                    style={{ flex: 2, minWidth: "130px", padding: "8px 10px", border: `1px solid ${LIGHT}88`, borderRadius: "7px", fontSize: "13px", fontFamily: "inherit", outline: "none" }} />
                  <input placeholder="Phone number" value={newPhone} onChange={e => setNewPhone(e.target.value)} type="tel"
                    style={{ flex: 2, minWidth: "120px", padding: "8px 10px", border: `1px solid ${LIGHT}88`, borderRadius: "7px", fontSize: "13px", fontFamily: "inherit", outline: "none" }} />
                  <select value={newSection} onChange={e => setNewSection(e.target.value)}
                    style={{ padding: "8px 10px", border: `1px solid ${LIGHT}88`, borderRadius: "7px", fontSize: "13px", fontFamily: "inherit", outline: "none", background: "#fff" }}>
                    <option value="gents">Gents</option>
                    <option value="ladies">Ladies</option>
                  </select>
                  <button onClick={addMember} style={{ background: accentColor, border: "none", borderRadius: "7px", color: "#fff", padding: "8px 14px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", fontWeight: "bold" }}>Save</button>
                  <button onClick={() => setAddMode(false)} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "7px", color: "#6b7280", padding: "8px 10px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                </div>
              </div>
            )}

            {Object.keys(groupedMembers).sort().map(letter => (
              <div key={letter} style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "11px", fontWeight: "bold", color: "#fff", background: accentColor, borderRadius: "5px", padding: "3px 10px", marginBottom: "4px", display: "inline-block", letterSpacing: "2px" }}>{letter}</div>
                <div style={{ background: "#fff", borderRadius: "9px", boxShadow: "0 1px 5px rgba(0,0,0,0.05)", overflow: "hidden" }}>
                  {groupedMembers[letter].map((m, i) => (
                    <div key={m.id}>
                      {editingId === m.id ? (
                        <div style={{ padding: "10px 12px", background: "#fdf0f2", borderBottom: "1px solid #f0d0d6" }}>
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            <input value={editName} onChange={e => setEditName(e.target.value.toUpperCase())}
                              style={{ flex: 2, minWidth: "120px", padding: "6px 9px", border: `1px solid ${LIGHT}88`, borderRadius: "6px", fontSize: "13px", fontFamily: "inherit", outline: "none" }} />
                            <input value={editPhone} onChange={e => setEditPhone(e.target.value)} type="tel"
                              style={{ flex: 2, minWidth: "110px", padding: "6px 9px", border: `1px solid ${LIGHT}88`, borderRadius: "6px", fontSize: "13px", fontFamily: "inherit", outline: "none" }} />
                            <select value={editSection} onChange={e => setEditSection(e.target.value)}
                              style={{ padding: "6px 9px", border: `1px solid ${LIGHT}88`, borderRadius: "6px", fontSize: "13px", fontFamily: "inherit", outline: "none", background: "#fff" }}>
                              <option value="gents">Gents</option>
                              <option value="ladies">Ladies</option>
                            </select>
                            <button onClick={saveEdit} style={{ background: accentColor, border: "none", borderRadius: "6px", color: "#fff", padding: "6px 12px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: "bold" }}>✓</button>
                            <button onClick={() => setEditingId(null)} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "6px", color: "#6b7280", padding: "6px 9px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                          </div>
                        </div>
                      ) : confirmDelete === m.id ? (
                        <div style={{ padding: "10px 12px", background: "#fef2f2", borderBottom: "1px solid #fecaca", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                          <span style={{ fontSize: "12px", color: "#991b1b" }}>Delete <strong>{m.name}</strong>?</span>
                          <div style={{ display: "flex", gap: "5px" }}>
                            <button onClick={() => deleteMember(m.id)} style={{ background: "#dc2626", border: "none", borderRadius: "5px", color: "#fff", padding: "5px 10px", fontSize: "11px", cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
                            <button onClick={() => setConfirmDelete(null)} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "5px", color: "#6b7280", padding: "5px 8px", fontSize: "11px", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: "10px 12px", borderBottom: i < groupedMembers[letter].length - 1 ? "1px solid #f3f4f6" : "none", display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: `${accentDark}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "bold", color: accentColor, flexShrink: 0 }}>
                            {getSurname(m.name)[0]}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "13px", fontWeight: "bold", color: GREEN }}>
                              {getSurname(m.name)}
                              <span style={{ fontSize: "11px", fontWeight: "normal", color: "#6b7280", marginLeft: "5px" }}>{m.name.replace(getSurname(m.name), "").trim()}</span>
                            </div>
                            {m.phone ? <a href={`tel:${m.phone.replace(/\s/g,"")}`} style={{ fontSize: "11px", color: accentColor, textDecoration: "none" }}>📞 {m.phone}</a>
                              : <span style={{ fontSize: "10px", color: "#d1d5db" }}>No number</span>}
                          </div>
                          <div style={{ display: "flex", gap: "5px" }}>
                            <button onClick={() => startEdit(m)} style={{ background: "#fdf0f2", border: `1px solid ${LIGHT}88`, borderRadius: "5px", color: accentColor, padding: "4px 9px", fontSize: "10px", cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                            <button onClick={() => setConfirmDelete(m.id)} style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: "5px", color: "#dc2626", padding: "4px 7px", fontSize: "10px", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div style={{ textAlign: "center", padding: "24px 16px 32px", borderTop: `1px solid ${GOLD}22`, marginTop: "8px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "10px", color: "#aaa" }}>Bowls Manager by</span>
          <span style={{ fontSize: "13px" }}>⭐</span>
          <span style={{ fontSize: "12px", fontWeight: "900", color: GREEN, letterSpacing: "3px", textTransform: "uppercase" }}>Frewstar</span>
        </div>
      </div>
    </div>
  );
}
