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
interface ParsedCommand { action: "on"; id: number | "all"; }
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
  const normalizedText = t.replace(/[.,!?]/g, "");
  
  if (!/\b(turn\s*on|switch\s*on|light|lights|on|enable|activate|open|bright|brighten|illuminate|fire|ignite)\b/.test(t)) return null;
  
  const action = "on";
  if (/\b(all|every|everything|each)\b/.test(t)) return { action, id: "all" };
  const digitMatch = t.match(/\b(1[01]|[1-9])\b/);
  if (digitMatch) { const num = parseInt(digitMatch[1], 10); if (num >= 1 && num <= 11) return { action, id: num }; }
  for (const word of normalizedText.split(/\s+/)) { if (WORD_TO_NUM[word] !== undefined) return { action, id: WORD_TO_NUM[word] }; }
  return null;
}

/* ── SVG Icons ── */
const MicIcon = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="19" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);

const FlameIcon = ({ on }: { on: boolean }) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={on ? 1 : 2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

/* ════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════ */

export default function GuestControl() {
  const [esp32Ip, setEsp32Ip] = useState("");
  
  useEffect(() => {
    const handleStorage = () => {
      const saved = localStorage.getItem("duothan_esp32_ip");
      if (saved) setEsp32Ip(saved);
    };
    handleStorage();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);
  const [lamps, setLamps] = useState<LampState[]>(Array.from({ length: 11 }, (_, i) => ({ id: i + 1, on: false, loading: false, error: false })));
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [, setLastCommand] = useState<ParsedCommand | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [micPermission, setMicPermission] = useState<"granted" | "denied" | "unknown">("unknown");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "unknown">("unknown");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const toastIdRef = useRef(0);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandBufferRef = useRef("");

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
    if (text) {
      commandBufferRef.current = (commandBufferRef.current + " " + text).trim();
      const words = commandBufferRef.current.split(/\s+/);
      if (words.length > 10) commandBufferRef.current = words.slice(-10).join(" ");
    }
    const cmd = parseCommand(commandBufferRef.current);
    if (cmd) { 
      setLastCommand(cmd); 
      sendCommand(cmd.id, cmd.action); 
      commandBufferRef.current = ""; 
    }
  }, [sendCommand]);

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
      else if (event.error !== "no-speech") { setIsListening(false); addToast("error", `Speech error: ${event.error}`); }
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
    else { setTranscript(""); setLastCommand(null); commandBufferRef.current = ""; try { rec.start(); setIsListening(true); setMicPermission("granted"); } catch { addToast("error", "Could not start speech recognition."); } }
  }, [isListening, addToast]);

  /* ════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Ambient layers */}
      <img src="/samurai.png" className="samurai-bg" alt="Cyber Samurai" />
      <div className="bg-ambient" />
      <div className="grid-overlay" />
      <div className="scanline-overlay" />
      
      {/* ── GUEST LAYOUT ── */}
      <main className="guest-layout">
        
        {/* Toasts */}
        <div style={{ position: "fixed", top: "5rem", right: "1rem", zIndex: 100, display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "360px" }}>
          {toasts.map((t) => (
            <div key={t.id} className={t.type === "error" ? "error-banner" : "success-banner"}>
              {t.type === "error" ? "⚠" : "✓"} {t.message}
            </div>
          ))}
        </div>

        {/* ── BRANDING ── */}
        <div className="guest-branding">
          <div className="guest-branding-text">
            <span className="guest-subtitle">
              <div className="guest-subtitle-dot" />
              DUOTHAN 6.0
            </span>
            <h1 className="guest-title">
              PAHAN<br/>
              <span className="guest-title-highlight">VOICE</span><br/>
              CONTROL
            </h1>
          </div>
          
          <div className="neon-divider guest-divider" />
          
          <div className="guest-status-pill">
            <div className={`connection-dot ${connectionStatus}`} style={{ width: "14px", height: "14px" }} />
            <span className={`guest-status-text ${connectionStatus}`}>
              {connectionStatus === "connected" ? "System Online" : connectionStatus === "disconnected" ? "System Offline" : "System Standby"}
            </span>
          </div>
        </div>

        {/* ── CIRCLE UI ── */}
        <div className="guest-circle-wrapper">
          
          {/* PAHAN Array */}
          {lamps.map((lamp, i) => {
            // Calculate position in circle
            const angle = (i / lamps.length) * 2 * Math.PI - Math.PI / 2;
            const radiusPercent = 42; // percentage of container size
            const x = Math.cos(angle) * radiusPercent;
            const y = Math.sin(angle) * radiusPercent;
            
            return (
              <div key={lamp.id} style={{ 
                position: "absolute", 
                left: `calc(50% + ${x}%)`, 
                top: `calc(50% + ${y}%)`, 
                transform: "translate(-50%, -50%)",
                zIndex: lamp.on ? 10 : 5
              }}>
                <div className={`guest-pahan anim-scale-in delay-${lamp.id} ${lamp.on ? "is-on" : ""}`} style={{ pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem" }}>
                  <div className="lamp-bulb-wrap">
                    <div className="lamp-rays" />
                    <div className="lamp-glow-ring" />
                    <div className={`lamp-bulb ${lamp.on ? "on" : "off"} guest-pahan-icon`}><FlameIcon on={lamp.on} /></div>
                  </div>
                  <span className="lamp-id guest-pahan-id">{lamp.id}</span>
                </div>
              </div>
            );
          })}
          
          {/* Center Mic Button & Radar Rings */}
          <div className="guest-mic-wrapper">
            {/* Radar Rings */}
            <div style={{ position: "absolute", inset: 0, border: "2px dashed rgba(228, 16, 82, 0.25)", borderRadius: "50%", animation: "spin-slow 25s linear infinite", pointerEvents: "none" }} />
            <div style={{ position: "absolute", inset: "-30px", border: "1px solid rgba(228, 16, 82, 0.1)", borderTopColor: "rgba(228, 16, 82, 0.6)", borderRadius: "50%", animation: "spin-slow-reverse 15s linear infinite", pointerEvents: "none" }} />
            <div style={{ position: "absolute", inset: "30px", border: "1px dotted rgba(228, 16, 82, 0.4)", borderRadius: "50%", animation: "spin-slow 35s linear infinite", pointerEvents: "none" }} />
            
            {/* Core Mic */}
            <div className="guest-mic-core">
              <button id="mic-toggle-btn" className={`mic-button guest-mic ${isListening ? "listening" : ""}`} onClick={toggleListening} aria-label={isListening ? "Stop listening" : "Start listening"}>
                {isListening ? (
                  <div className="wave-bars" style={{ height: "40px", gap: "6px" }}>
                    {[1, 2, 3, 4, 5].map(i => <div key={i} className="wave-bar" style={{ width: "6px" }} />)}
                  </div>
                ) : (
                  <MicIcon size={56} />
                )}
              </button>
              
              {/* Minimal Transcript Display */}
              <div className="guest-transcript">
                {transcript ? (
                  <span className="guest-transcript-text">{transcript}</span>
                ) : isListening ? (
                  <span className="guest-transcript-listening">Listening...</span>
                ) : (
                  <span className="guest-transcript-idle">Tap to speak</span>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}