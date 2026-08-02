"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/* ── Web Speech API type declarations ── */
interface SpeechRecognitionAlternative { transcript: string; confidence: number; }
interface SpeechRecognitionResult { readonly length: number; isFinal: boolean; item(index: number): SpeechRecognitionAlternative; [index: number]: SpeechRecognitionAlternative; }
interface SpeechRecognitionResultList { readonly length: number; item(index: number): SpeechRecognitionResult; [index: number]: SpeechRecognitionResult; }
interface SpeechRecognitionEvent extends Event { resultIndex: number; results: SpeechRecognitionResultList; }
interface SpeechRecognitionErrorEvent extends Event { error: string; message: string; }
interface SpeechRecognition extends EventTarget {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  start(): void; stop(): void; abort(): void;
}
interface SpeechRecognitionConstructor { new (): SpeechRecognition; }

/* ── Types ── */
interface LampState { id: number; on: boolean; loading: boolean; error: boolean; }
interface ParsedCommand { action: "on" | "off"; id: number | "all"; }
interface Toast { id: number; type: "error" | "success"; message: string; }

/* ── Number word map ── */
const WORD_TO_NUM: Record<string, number> = {
  one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, tree: 3,
  four: 4, for: 4, fore: 4, five: 5, six: 6, sex: 6, seven: 7,
  eight: 8, ate: 8, nine: 9, ten: 10, eleven: 11,
};

/* ── Command parser ── */
function parseCommand(text: string): ParsedCommand | null {
  const t = text.toLowerCase().trim();
  let action: "on" | "off" | null = null;
  if (/\b(turn\s*off|switch\s*off|shut\s*off|off|dim|kill|disable|deactivate|close|dark|darken|unlight|extinguish)\b/.test(t)) action = "off";
  else if (/\b(turn\s*on|switch\s*on|light|lights|on|enable|activate|open|bright|brighten|illuminate|fire|ignite)\b/.test(t)) action = "on";
  if (!action) return null;
  if (/\b(all|every|everything|each)\b/.test(t)) return { action, id: "all" };
  const digitMatch = t.match(/\b(1[01]|[1-9])\b/);
  if (digitMatch) { const num = parseInt(digitMatch[1], 10); if (num >= 1 && num <= 11) return { action, id: num }; }
  for (const word of t.split(/\s+/)) { if (WORD_TO_NUM[word] !== undefined) return { action, id: WORD_TO_NUM[word] }; }
  return null;
}

/* ── SVG Icons ── */
const MicIcon = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="19" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);
const MicOffIcon = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
    <path d="M17 16.95A7 7 0 0 1 5 12" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);
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
  
  useEffect(() => {
    const saved = localStorage.getItem("duothan_esp32_ip");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setEsp32Ip(saved);
  }, []);
  const [lamps, setLamps] = useState<LampState[]>(Array.from({ length: 11 }, (_, i) => ({ id: i + 1, on: false, loading: false, error: false })));
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastCommand, setLastCommand] = useState<ParsedCommand | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [micPermission, setMicPermission] = useState<"granted" | "denied" | "unknown">("unknown");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [textCommand, setTextCommand] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "unknown">("unknown");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const toastIdRef = useRef(0);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    } catch {
      setLamps((prev) => prev.map((l) => (lampId === "all" || l.id === lampId) ? { ...l, on: state !== "on", loading: false, error: true } : l));
      setConnectionStatus("disconnected");
      addToast("error", "Failed to reach ESP32. Check connection.");
      setTimeout(() => setLamps((prev) => prev.map((l) => ({ ...l, error: false }))), 600);
    }
  }, [esp32Ip, addToast]);

  const processTranscript = useCallback((text: string) => {
    const cmd = parseCommand(text);
    if (cmd) { setLastCommand(cmd); sendCommand(cmd.id, cmd.action); }
  }, [sendCommand]);

  // Speech Recognition setup
  useEffect(() => {
    const Ctor: SpeechRecognitionConstructor | undefined =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!Ctor) { setSpeechSupported(false); return; }

    const recognition = new Ctor();
    recognition.continuous = true; recognition.interimResults = true; recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let final = "", interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t; else interim += t;
      }
      if (final) { setTranscript(final); processTranscript(final); } else if (interim) setTranscript(interim);
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") { setMicPermission("denied"); setIsListening(false); addToast("error", "Microphone access denied."); }
      else if (event.error !== "no-speech") addToast("error", `Speech error: ${event.error}`);
    };
    recognition.onend = () => {
      setIsListening((current) => {
        if (current) restartTimeoutRef.current = setTimeout(() => { try { recognition.start(); } catch { /* already started */ } }, 200);
        return current;
      });
    };
    recognitionRef.current = recognition;
    return () => { recognition.abort(); if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current); };
  }, [processTranscript, addToast]);

  const toggleListening = useCallback(() => {
    const rec = recognitionRef.current; if (!rec) return;
    if (isListening) { rec.stop(); setIsListening(false); if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current); }
    else { setTranscript(""); setLastCommand(null); try { rec.start(); setIsListening(true); setMicPermission("granted"); } catch { addToast("error", "Could not start speech recognition."); } }
  }, [isListening, addToast]);

  const handleTextSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (textCommand.trim()) { setTranscript(textCommand.trim()); processTranscript(textCommand.trim()); setTextCommand(""); }
  }, [textCommand, processTranscript]);

  const toggleLamp = useCallback((id: number) => { const lamp = lamps.find((l) => l.id === id); if (lamp) sendCommand(id, lamp.on ? "off" : "on"); }, [lamps, sendCommand]);
  const allOn = useCallback(() => sendCommand("all", "on"), [sendCommand]);
  const allOff = useCallback(() => sendCommand("all", "off"), [sendCommand]);
  const onCount = lamps.filter((l) => l.on).length;
  const showTextInput = !speechSupported || micPermission === "denied";

  const openIpEditor = useCallback(() => { setIpDraft(esp32Ip); setEditingIp(true); }, [esp32Ip]);
  const saveIp = useCallback((e: React.FormEvent) => { e.preventDefault(); const val = ipDraft.trim(); setEsp32Ip(val); localStorage.setItem("duothan_esp32_ip", val); setEditingIp(false); }, [ipDraft]);

  /* ════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════ */
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

            {/* Voice Command hero */}
            <div className="voice-panel anim-fade-up" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", animationDelay: "0.1s" }}>
              <div className="voice-inner">
                {!showTextInput ? (
                  <button id="mic-toggle-btn" className={`mic-button ${isListening ? "listening" : ""}`} onClick={toggleListening} aria-label={isListening ? "Stop listening" : "Start listening"}>
                    <MicIcon size={42} />
                  </button>
                ) : (
                  <button className="mic-button" style={{ borderColor: "var(--text-muted)", color: "var(--text-muted)", cursor: "not-allowed", opacity: 0.3 }} disabled aria-label="Microphone unavailable">
                    <MicOffIcon size={42} />
                  </button>
                )}

                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {isListening && (<>
                      <div className="wave-bars">{[1, 2, 3, 4, 5].map(i => <div key={i} className="wave-bar" />)}</div>
                      <span style={{ fontSize: "0.8rem", color: "var(--accent-primary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Listening...</span>
                    </>)}
                    {!isListening && !showTextInput && <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Tap mic to activate voice control</span>}
                    {micPermission === "denied" && <span style={{ fontSize: "0.8rem", color: "var(--accent-red-error)" }}>⚠ Mic denied — use text input</span>}
                    {!speechSupported && <span style={{ fontSize: "0.8rem", color: "var(--accent-orange)" }}>⚠ Speech unsupported — use text input</span>}
                  </div>

                  <div className={`transcript-area ${transcript ? "has-text" : ""}`}>
                    {transcript || (isListening ? '"Light pahan three" or "turn off all pahans"...' : "Voice transcript appears here")}
                  </div>

                  {lastCommand && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span className="section-label">Command:</span>
                      <span className={`command-badge ${lastCommand.action}`}>
                        {lastCommand.action.toUpperCase()} → {lastCommand.id === "all" ? "ALL" : `#${lastCommand.id}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {showTextInput && (
                <form onSubmit={handleTextSubmit} style={{ display: "flex", gap: "0.5rem" }}>
                  <input id="text-command-input" type="text" className="text-command-input" placeholder='"light pahan 5" or "turn off all"' value={textCommand} onChange={(e) => setTextCommand(e.target.value)} />
                  <button type="submit" className="btn-action btn-all-on" style={{ flexShrink: 0 }}>Send</button>
                </form>
              )}
            </div>

            {/* Lamp Array */}
            <div className="anim-fade-up" style={{ display: "flex", flexDirection: "column", gap: "0.85rem", animationDelay: "0.2s" }}>
              <div className="lamp-section-header">
                <span className="section-label">PAHAN Array</span>
                <div className="neon-divider" style={{ width: "30px" }} />
                <span className="duothan-badge">{onCount}/11 Active</span>
              </div>

              <div className="lamp-grid">
                {lamps.map((lamp) => (
                  <button key={lamp.id} id={`lamp-card-${lamp.id}`} className={`lamp-card anim-scale-in delay-${lamp.id} ${lamp.on ? "is-on" : ""} ${lamp.error ? "is-error" : ""}`} onClick={() => toggleLamp(lamp.id)} aria-label={`Lamp ${lamp.id} — ${lamp.on ? "ON" : "OFF"}`}>
                    {lamp.loading && <div className="lamp-loading"><div className="spinner" /></div>}
                    <div className="lamp-bulb-wrap">
                      <div className="lamp-rays" />
                      <div className="lamp-glow-ring" />
                      <div className={`lamp-bulb ${lamp.on ? "on" : "off"}`}><FlameIcon on={lamp.on} /></div>
                    </div>
                    <span className="lamp-id">{lamp.id}</span>
                    <span className="lamp-label">PAHAN</span>
                    <span className={`lamp-status ${lamp.on ? "on" : "off"}`}>{lamp.on ? "ON" : "OFF"}</span>
                  </button>
                ))}
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
                  <button type="submit" className="btn-action btn-all-on btn-sm" style={{ flexShrink: 0 }}>Save</button>
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