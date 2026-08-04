"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/* ── Types ── */
interface LampState { id: number; on: boolean; loading: boolean; error: boolean; }
interface Toast { id: number; type: "error" | "success"; message: string; }

/* ── SVG Icons ── */
const FlameIcon = ({ on }: { on: boolean }) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={on ? 1 : 2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);
const AlertIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>);
const CheckIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>);
const WifiIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" /></svg>);
const PencilIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>);
const ChevronIcon = () => (<svg className="reference-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>);
const BoltIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>);

/* ════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════ */

export default function LampControl() {
  const [esp32Ip, setEsp32Ip] = useState("");
  const [ipDraft, setIpDraft] = useState("");
  const [editingIp, setEditingIp] = useState(false);
  
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("duothan_admin_auth") === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordDraft === "tharinduxn") {
      setIsAuthenticated(true);
      sessionStorage.setItem("duothan_admin_auth", "true");
      setAuthError(false);
    } else {
      setAuthError(true);
      setPasswordDraft("");
    }
  };
  
  useEffect(() => {
    const saved = localStorage.getItem("duothan_esp32_ip");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setEsp32Ip(saved);
  }, []);
  const [lamps, setLamps] = useState<LampState[]>(Array.from({ length: 11 }, (_, i) => ({ id: i + 1, on: false, loading: false, error: false })));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "unknown">("unknown");

  const toastIdRef = useRef(0);

  const addToast = useCallback((type: "error" | "success", message: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const sendCommand = useCallback(async (lampId: number | "all", state: "on" | "off") => {
    const baseUrl = esp32Ip.trim();
    if (!baseUrl) { addToast("error", "ESP32 IP not set. Add it in the System panel."); return; }
    const url = baseUrl.startsWith("http") ? baseUrl : `http://${baseUrl}`;

    const updateFn = (l: LampState) => (lampId === "all" || l.id === lampId) ? { ...l, on: state === "on", loading: true, error: false } : l;
    setLamps((prev) => prev.map(updateFn));

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      await fetch(`${url}/lamp?id=${lampId}&state=${state}`, { method: "GET", mode: "no-cors", signal: controller.signal });
      clearTimeout(timeout);
      setLamps((prev) => prev.map((l) => (lampId === "all" || l.id === lampId) ? { ...l, loading: false } : l));
      setConnectionStatus("connected");
      addToast("success", `Lamp ${lampId === "all" ? "ALL" : lampId} → ${state.toUpperCase()}`);

      // Auto-turn off after 5 seconds (fire time) to prevent nichrome wire burnout
      if (state === "on") {
        setTimeout(() => {
          sendCommand(lampId, "off");
        }, 5000);
      }
    } catch {
      setLamps((prev) => prev.map((l) => (lampId === "all" || l.id === lampId) ? { ...l, on: state !== "on", loading: false, error: true } : l));
      setConnectionStatus("disconnected");
      addToast("error", "Failed to reach ESP32. Check connection.");
      setTimeout(() => setLamps((prev) => prev.map((l) => ({ ...l, error: false }))), 600);
    }
  }, [esp32Ip, addToast]);

  // Connection Ping Check
  useEffect(() => {
    if (!esp32Ip) {
      setConnectionStatus("unknown");
      return;
    }
    const checkConnection = async () => {
      const baseUrl = esp32Ip.trim();
      const url = baseUrl.startsWith("http") ? baseUrl : `http://${baseUrl}`;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        await fetch(`${url}/`, { method: "GET", mode: "no-cors", signal: controller.signal });
        clearTimeout(timeout);
        setConnectionStatus("connected");
      } catch {
        setConnectionStatus("disconnected");
      }
    };
    checkConnection();
  }, [esp32Ip]);

  const toggleLamp = useCallback((id: number) => { const lamp = lamps.find((l) => l.id === id); if (lamp) sendCommand(id, lamp.on ? "off" : "on"); }, [lamps, sendCommand]);
  const allOn = useCallback(() => sendCommand("all", "on"), [sendCommand]);
  const allOff = useCallback(() => sendCommand("all", "off"), [sendCommand]);
  const onCount = lamps.filter((l) => l.on).length;

  const openIpEditor = useCallback(() => { setIpDraft(esp32Ip); setEditingIp(true); }, [esp32Ip]);
  const saveIp = useCallback((e: React.FormEvent) => { e.preventDefault(); const val = ipDraft.trim(); setEsp32Ip(val); localStorage.setItem("duothan_esp32_ip", val); setEditingIp(false); }, [ipDraft]);

  /* ════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════ */
  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
        {/* Ambient layers */}
        <img src="/samurai.png" className="samurai-bg" alt="Cyber Samurai" style={{ filter: "blur(6px) brightness(0.25)" }} />
        <div className="bg-ambient" />
        <div className="grid-overlay" />
        <div className="scanline-overlay" />
        
        <form onSubmit={handleLogin} className="anim-fade-up" style={{ zIndex: 10, background: "var(--card-bg)", padding: "2.5rem 2rem", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "1rem", width: "90%", maxWidth: "380px", boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
          <div style={{ textAlign: "center", marginBottom: "0.5rem" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "2px" }}>SYSTEM LOGIN</h2>
            <p style={{ color: "var(--accent-primary)", fontSize: "0.8rem", marginTop: "0.4rem", textTransform: "uppercase", letterSpacing: "1px" }}>Admin authorization required</p>
          </div>
          
          <input 
            type="password" 
            autoFocus
            placeholder="Enter password..." 
            className="config-input" 
            value={passwordDraft} 
            onChange={(e) => { setPasswordDraft(e.target.value); setAuthError(false); }}
            style={{ width: "100%", borderColor: authError ? "var(--accent-red-error)" : "var(--border-color)", padding: "0.8rem 1rem", fontSize: "1rem", textAlign: "center", letterSpacing: "0.2em" }}
          />
          {authError && <span className="anim-shake" style={{ color: "var(--accent-red-error)", fontSize: "0.8rem", textAlign: "center", fontWeight: 600 }}>⚠ ACCESS DENIED</span>}
          
          <button type="submit" className="btn-action btn-all-on" style={{ marginTop: "1rem", padding: "0.8rem", fontSize: "1rem" }}>
            AUTHORIZE
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {/* Ambient layers */}
      <img src="/samurai.png" className="samurai-bg" alt="Cyber Samurai" />
      <div className="bg-ambient" />
      <div className="grid-overlay" />
      <div className="scanline-overlay" />
      <div className="floating-dot floating-dot-1" />
      <div className="floating-dot floating-dot-2" />
      <div className="floating-dot floating-dot-3" />

      {/* ── HEADER ── */}
      <header className="header-bar" style={{ position: "sticky", top: 0, zIndex: 50, padding: "0.75rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span className="header-subtitle">DUOTHAN 6.0</span>
          <h1 className="header-title">PAHAN Control</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div className={`connection-dot ${connectionStatus}`} />
          <span style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--text-muted)" }}>
            {connectionStatus === "connected" ? "Online" : connectionStatus === "disconnected" ? "Offline" : "—"}
          </span>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="main-content">

        {/* Toasts */}
        <div style={{ position: "fixed", top: "5rem", right: "1rem", zIndex: 100, display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "360px" }}>
          {toasts.map((t) => (
            <div key={t.id} className={t.type === "error" ? "error-banner" : "success-banner"}>
              {t.type === "error" ? <AlertIcon /> : <CheckIcon />} {t.message}
            </div>
          ))}
        </div>

        <div className="command-layout">
          {/* ═══ MAIN COLUMN — what you DO ═══ */}
          <div className="command-main">



            {/* Lamp Array */}
            <div className="anim-fade-up" style={{ display: "flex", flexDirection: "column", gap: "0.85rem", animationDelay: "0.2s" }}>
              <div className="lamp-section-header">
                <span className="section-label">PAHAN Array</span>
                <div className="neon-divider" style={{ width: "30px" }} />
                <span className="duothan-badge">{onCount}/11 Active</span>
              </div>

              <div style={{ position: "relative", width: "100%", maxWidth: "450px", margin: "2rem auto" }}>
                <div style={{ width: "100%", paddingBottom: "100%" }} />
                <div style={{ position: "absolute", inset: 0 }}>
                  {/* Decorative Rings in Center */}
                  <div style={{ position: "absolute", inset: "25%", border: "1px dashed rgba(228, 16, 82, 0.25)", borderRadius: "50%", animation: "spin-slow 25s linear infinite", pointerEvents: "none" }} />
                  <div style={{ position: "absolute", inset: "35%", border: "1px solid rgba(228, 16, 82, 0.1)", borderTopColor: "rgba(228, 16, 82, 0.5)", borderRadius: "50%", animation: "spin-slow-reverse 15s linear infinite", pointerEvents: "none" }} />
                  
                  {lamps.map((lamp, i) => {
                    const angle = (i / lamps.length) * 2 * Math.PI - Math.PI / 2;
                    const radiusPercent = 42; // percentage of container size
                    const x = Math.cos(angle) * radiusPercent;
                    const y = Math.sin(angle) * radiusPercent;

                    return (
                      <div 
                        key={lamp.id}
                        style={{ 
                          position: "absolute", 
                          left: `calc(50% + ${x}%)`, 
                          top: `calc(50% + ${y}%)`, 
                          transform: "translate(-50%, -50%)",
                          zIndex: lamp.on ? 10 : 5
                        }}
                      >
                        <button 
                          id={`lamp-card-${lamp.id}`} 
                          className={`clean-lamp-btn anim-scale-in delay-${lamp.id} ${lamp.on ? "is-on" : ""} ${lamp.error ? "is-error" : ""}`} 
                          onClick={() => toggleLamp(lamp.id)} 
                          aria-label={`Lamp ${lamp.id} — ${lamp.on ? "ON" : "OFF"}`}
                        >
                          <div className="lamp-bulb-wrap">
                            {lamp.loading && <div className="lamp-loading" style={{ borderRadius: "50%", zIndex: 10 }}><div className="spinner" style={{ width: "18px", height: "18px" }} /></div>}
                            <div className="lamp-rays" />
                            <div className="lamp-glow-ring" />
                            <div className={`lamp-bulb ${lamp.on ? "on" : "off"}`}><FlameIcon on={lamp.on} /></div>
                          </div>
                          <span className="lamp-id">{lamp.id}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ═══ SIDEBAR — what you CHECK ═══ */}
          <aside className="command-sidebar anim-slide-left" style={{ animationDelay: "0.15s" }}>

            {/* System card: IP config + connection detail */}
            <div className="sidebar-card">
              <div className="sidebar-card-title"><WifiIcon /> System</div>

              {!editingIp ? (
                <button className="ip-chip" onClick={openIpEditor}>
                  <span className={`ip-chip-value ${esp32Ip ? "" : "empty"}`}>{esp32Ip || "Set ESP32 IP address"}</span>
                  <span className="ip-chip-icon"><PencilIcon /></span>
                </button>
              ) : (
                <form className="ip-edit-row" onSubmit={saveIp}>
                  <input autoFocus type="text" className="config-input" placeholder="192.168.1.100" value={ipDraft} onChange={(e) => setIpDraft(e.target.value)} onBlur={saveIp} />
                  <button type="submit" className="btn-action btn-all-on btn-sm" style={{ flexShrink: 0, padding: "0.55rem 0.6rem" }}>Enter ↵</button>
                </form>
              )}

              <div className="status-row">
                <span>Connection</span>
                <span className="status-row-value" style={{ color: connectionStatus === "connected" ? "var(--accent-green)" : connectionStatus === "disconnected" ? "var(--accent-red-error)" : "var(--text-muted)" }}>
                  <span className={`connection-dot ${connectionStatus}`} />
                  {connectionStatus === "connected" ? "Online" : connectionStatus === "disconnected" ? "Offline" : "Unknown"}
                </span>
              </div>
              <div className="status-row">
                <span>Active pahans</span>
                <span className="status-row-value" style={{ color: "var(--text-primary)" }}>{onCount} / 11</span>
              </div>
              <div className="stat-bar-track">
                <div className="stat-bar-fill" style={{ width: `${(onCount / 11) * 100}%` }} />
              </div>

              <div className="sidebar-btn-row">
                <button id="all-on-btn" className="btn-action btn-all-on btn-sm" onClick={allOn}><BoltIcon /> All ON</button>
                <button id="all-off-btn" className="btn-action btn-all-off btn-sm" onClick={allOff}>All OFF</button>
              </div>
            </div>

            {/* Command reference — collapsible */}
            <details className="sidebar-card reference-details">
              <summary>
                <span className="sidebar-card-title" style={{ marginBottom: 0 }}>🎤 Voice Commands</span>
                <ChevronIcon />
              </summary>
              <div className="reference-list">
                <span>&quot;Light pahan three&quot; → <b>ON #3</b></span>
                <span>&quot;Turn on pahan 7&quot; → <b>ON #7</b></span>
                <span>&quot;Turn off pahan five&quot; → <b>OFF #5</b></span>
                <span>&quot;Light all pahans&quot; → <b>ON ALL</b></span>
                <span>&quot;Turn off all&quot; → <b>OFF ALL</b></span>
                <span>&quot;Switch off eleven&quot; → <b>OFF #11</b></span>
              </div>
            </details>
          </aside>
        </div>
      </main>
    </div>
  );
}