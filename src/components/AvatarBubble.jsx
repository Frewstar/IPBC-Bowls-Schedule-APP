const PALETTE = ["#5C7E3A","#6b1d2e","#2563EB","#7C3AED","#0891B2","#B45309","#BE185D","#047857"];

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = (str || "").charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function initials(name) {
  if (!name?.trim()) return "?";
  const w = name.trim().split(/\s+/);
  return w.length >= 2 ? (w[0][0] + w[w.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

export default function AvatarBubble({ displayName, avatar, size = 36, style = {} }) {
  const fs = Math.round(size * 0.38);
  if (avatar) {
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0, ...style }}>
        <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }
  const name = displayName || "?";
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: hashColor(name), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: fs, fontWeight: "700", fontFamily: "system-ui, sans-serif", letterSpacing: "0.01em", flexShrink: 0, userSelect: "none", ...style }}>
      {initials(name)}
    </div>
  );
}
