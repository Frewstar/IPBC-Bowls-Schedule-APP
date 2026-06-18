import { Phone } from "lucide-react";
import { SURFACE, BORDER, GOLD, TEXT, F_SANS, F_UI } from "../lib/theme.js";

export default function MemberPill({ name, phone }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: SURFACE, border: `1px solid ${GOLD}44`, borderRadius: "4px", padding: "5px 12px" }}>
      <span style={{ fontFamily: F_SANS, fontSize: "14px", fontWeight: "600", color: TEXT }}>{name}</span>
      {phone && (
        <a href={`tel:${phone.replace(/\s/g,"")}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: GOLD, textDecoration: "none", fontFamily: F_UI, fontWeight: "500", padding: "2px 0" }}>
          <Phone size={12} strokeWidth={1.75} />{phone}
        </a>
      )}
    </div>
  );
}
