import { X } from "lucide-react";
import { SURFACE, SURFACE2, BORDER, TEXT2, GREEN, F_DISPLAY } from "../lib/theme.js";

export default function BottomSheet({ open, onClose, title, children, titleColor = GREEN }) {
  if (!open) return null;
  return (
    <>
      {/* Backdrop: use onMouseDown so it fires on press not on release, and doesn't intercept typing */}
      <div
        onMouseDown={onClose}
        onTouchEnd={e => { e.preventDefault(); onClose(); }}
        style={{ position: "fixed", inset: 0, background: "rgba(26,10,14,0.45)", zIndex: 200, animation: "fadeIn 0.2s ease" }}
      />
      {/* Sheet: stop all events from bubbling to the backdrop */}
      <div
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 201,
          background: SURFACE, borderRadius: "20px 20px 0 0",
          maxHeight: "88vh", overflowY: "auto",
          boxShadow: "0 -8px 32px rgba(74,14,31,0.18)",
          animation: "slideUp 0.25s cubic-bezier(0.32,0.72,0,1)",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        }}>
        <div style={{ display: "flex", justifyContent: "center", paddingTop: "10px", paddingBottom: "4px" }}>
          <div style={{ width: "36px", height: "4px", background: BORDER, borderRadius: "2px" }} />
        </div>
        <div style={{ padding: "12px 20px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontFamily: F_DISPLAY, fontSize: "22px", fontWeight: "700", color: titleColor, letterSpacing: "0.02em" }}>{title}</div>
          <button onClick={onClose} style={{ background: SURFACE2, border: "none", borderRadius: "50%", width: "32px", height: "32px", cursor: "pointer", color: TEXT2, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <div style={{ padding: "16px 20px" }}>{children}</div>
      </div>
    </>
  );
}
