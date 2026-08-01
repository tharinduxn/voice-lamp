"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/* ──────────────────────────────────────────────
   Web Speech API type declarations
   TypeScript's default DOM lib does NOT include these
   (the spec is still experimental), so referencing
   SpeechRecognition / SpeechRecognitionEvent / etc.
   without declaring them causes "Cannot find name" errors.
   ────────────────────────────────────────────── */

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  readonly length: number;
  isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */

interface LampState {
  id: number;
  on: boolean;
  loading: boolean;
  error: boolean;
}

interface ParsedCommand {
  action: "on" | "off";
  id: number | "all";
}

interface Toast {
  id: number;
  type: "error" | "success";
  message: string;
}

/* ──────────────────────────────────────────────
   Number word map
   ────────────────────────────────────────────── */

const WORD_TO_NUM: Record<string, number> = {
  one: 1, won: 1,
  two: 2, to: 2, too: 2,
  three: 3, tree: 3,
  four: 4, for: 4, fore: 4,
  five: 5,
  six: 6, sex: 6,
  seven: 7,
  eight: 8, ate: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
};

/* ──────────────────────────────────────────────
   Command parser
   ────────────────────────────────────────────── */

function parseCommand(text: string): ParsedCommand | null {
  const t = text.toLowerCase().trim();

  // Determine action
  let action: "on" | "off" | null = null;

  // "off" patterns — check first since "turn off" contains "off"
  if (
    /\b(turn\s*off|switch\s*off|shut\s*off|off|dim|kill|disable|deactivate|close|dark|darken|unlight)\b/.test(t)
  ) {
    action = "off";
  }
  // "on" patterns
  else if (
    /\b(turn\s*on|switch\s*on|light|lights|on|enable|activate|open|bright|brighten|illuminate)\b/.test(t)
  ) {
    action = "on";
  }

  if (!action) return null;

  // Check for "all"
  if (/\b(all|every|everything|each)\b/.test(t)) {
    return { action, id: "all" };
  }

  // Try to extract a lamp number — first try digits
  const digitMatch = t.match(/\b(1[01]|[1-9])\b/);
  if (digitMatch) {
    const num = parseInt(digitMatch[1], 10);
    if (num >= 1 && num <= 11) {
      return { action, id: num };
    }
  }

  // Try word numbers
  const words = t.split(/\s+/);
  for (const word of words) {
    if (WORD_TO_NUM[word] !== undefined) {
      return { action, id: WORD_TO_NUM[word] };
    }
  }

  return null;
}

/* ──────────────────────────────────────────────
   SVG Icons (inline to avoid deps)
   ────────────────────────────────────────────── */

function MicIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function MicOffIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function BulbIcon({ on }: { on: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={on ? 1 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" />
    </svg>
  );
}

/* ──────────────────────────────────────────────
   Main Component
   ────────────────────────────────────────────── */

export default function LampControl() {
  // ── State ──
  const [esp32Ip, setEsp32Ip] = useState("");
  const [lamps, setLamps] = useState<LampState[]>(
    Array.from({ length: 11 }, (_, i) => ({
      id: i + 1,
      on: false,
      loading: false,
      error: false,
    }))
  );
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

  // ── Toast helpers ──
  const addToast = useCallback((type: "error" | "success", message: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // ── ESP32 command sender ──
  const sendCommand = useCallback(
    async (lampId: number | "all", state: "on" | "off") => {
      const baseUrl = esp32Ip.trim();
      if (!baseUrl) {
        addToast("error", "ESP32 IP not set. Enter the IP address above.");
        return;
      }

      const url = baseUrl.startsWith("http") ? baseUrl : `http://${baseUrl}`;

      // Optimistic update
      if (lampId === "all") {
        setLamps((prev) =>
          prev.map((l) => ({ ...l, on: state === "on", loading: true, error: false }))
        );
      } else {
        setLamps((prev) =>
          prev.map((l) =>
            l.id === lampId ? { ...l, on: state === "on", loading: true, error: false } : l
          )
        );
      }

      try {
        const endpoint = `${url}/lamp?id=${lampId}&state=${state}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        await fetch(endpoint, {
          method: "GET",
          mode: "no-cors",
          signal: controller.signal,
        });

        clearTimeout(timeout);

        // Success
        if (lampId === "all") {
          setLamps((prev) => prev.map((l) => ({ ...l, loading: false })));
        } else {
          setLamps((prev) =>
            prev.map((l) => (l.id === lampId ? { ...l, loading: false } : l))
          );
        }
        setConnectionStatus("connected");
        addToast("success", `Lamp ${lampId === "all" ? "ALL" : lampId} → ${state.toUpperCase()}`);
      } catch {
        // Revert on error
        if (lampId === "all") {
          setLamps((prev) =>
            prev.map((l) => ({ ...l, on: state !== "on", loading: false, error: true }))
          );
        } else {
          setLamps((prev) =>
            prev.map((l) =>
              l.id === lampId
                ? { ...l, on: state !== "on", loading: false, error: true }
                : l
            )
          );
        }
        setConnectionStatus("disconnected");
        addToast("error", `Failed to reach ESP32. Check connection.`);

        // Clear error state after animation
        setTimeout(() => {
          setLamps((prev) => prev.map((l) => ({ ...l, error: false })));
        }, 600);
      }
    },
    [esp32Ip, addToast]
  );

  // ── Process transcript ──
  const processTranscript = useCallback(
    (text: string) => {
      const cmd = parseCommand(text);
      if (cmd) {
        setLastCommand(cmd);
        sendCommand(cmd.id, cmd.action);
      }
    },
    [sendCommand]
  );

  // ── Speech Recognition setup ──
  useEffect(() => {
    const SpeechRecognitionCtor: SpeechRecognitionConstructor | undefined =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let final = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += t;
        } else {
          interim += t;
        }
      }

      if (final) {
        setTranscript(final);
        processTranscript(final);
      } else if (interim) {
        setTranscript(interim);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") {
        setMicPermission("denied");
        setIsListening(false);
        addToast("error", "Microphone access denied. Please allow mic permission.");
      } else if (event.error === "no-speech") {
        // Ignore — just silence
      } else {
        addToast("error", `Speech error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still supposed to be listening
      setIsListening((current) => {
        if (current) {
          restartTimeoutRef.current = setTimeout(() => {
            try {
              recognition.start();
            } catch {
              // Already started
            }
          }, 200);
        }
        return current;
      });
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
    };
  }, [processTranscript, addToast]);

  // ── Toggle listening ──
  const toggleListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;

    if (isListening) {
      rec.stop();
      setIsListening(false);
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
    } else {
      setTranscript("");
      setLastCommand(null);
      try {
        rec.start();
        setIsListening(true);
        setMicPermission("granted");
      } catch {
        addToast("error", "Could not start speech recognition.");
      }
    }
  }, [isListening, addToast]);

  // ── Text command submit ──
  const handleTextSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (textCommand.trim()) {
        setTranscript(textCommand.trim());
        processTranscript(textCommand.trim());
        setTextCommand("");
      }
    },
    [textCommand, processTranscript]
  );

  // ── Lamp toggle (manual) ──
  const toggleLamp = useCallback(
    (id: number) => {
      const lamp = lamps.find((l) => l.id === id);
      if (lamp) {
        sendCommand(id, lamp.on ? "off" : "on");
      }
    },
    [lamps, sendCommand]
  );

  // ── All on / all off ──
  const allOn = useCallback(() => sendCommand("all", "on"), [sendCommand]);
  const allOff = useCallback(() => sendCommand("all", "off"), [sendCommand]);

  // ── Count on lamps ──
  const onCount = lamps.filter((l) => l.on).length;

  /* ──────────────────────────────────────────────
     Render
     ────────────────────────────────────────────── */

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      {/* Background ambient glow */}
      <div className="bg-ambient" />

      {/* ── Header ── */}
      <header className="header-bar" style={{
        position: "sticky", top: 0, zIndex: 50,
        padding: "0.75rem 1.25rem",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "1rem", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "1.5rem" }}>💡</span>
          <h1 style={{
            fontSize: "1.25rem", fontWeight: 800,
            background: "linear-gradient(135deg, #f0f4ff, #94a3b8)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: "-0.02em",
          }}>
            Lamp Voice Control
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {/* Connection status */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <div className={`connection-dot ${connectionStatus}`} />
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {connectionStatus === "connected" ? "Connected" : connectionStatus === "disconnected" ? "Disconnected" : "No status"}
            </span>
          </div>

          {/* Lamp count */}
          <span style={{
            fontSize: "0.8rem", color: "var(--text-muted)",
            background: "rgba(255,255,255,0.05)", padding: "0.25rem 0.625rem",
            borderRadius: "var(--radius-full)",
          }}>
            {onCount}/11 ON
          </span>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main style={{
        flex: 1, position: "relative", zIndex: 1,
        maxWidth: "1100px", width: "100%", margin: "0 auto",
        padding: "1.25rem 1rem 2rem",
        display: "flex", flexDirection: "column", gap: "1.25rem",
      }}>
        {/* ── Toasts ── */}
        <div style={{
          position: "fixed", top: "5rem", right: "1rem", zIndex: 100,
          display: "flex", flexDirection: "column", gap: "0.5rem",
          maxWidth: "380px",
        }}>
          {toasts.map((toast) => (
            <div key={toast.id} className={toast.type === "error" ? "error-banner" : "success-banner"}>
              {toast.type === "error" ? <AlertIcon /> : <CheckIcon />}
              {toast.message}
            </div>
          ))}
        </div>

        {/* ── ESP32 Config ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)", flexShrink: 0 }}>
            <WifiIcon />
            <label htmlFor="esp32-ip" style={{ fontSize: "0.9rem", fontWeight: 600 }}>ESP32 IP:</label>
          </div>
          <input
            id="esp32-ip"
            type="text"
            className="config-input"
            placeholder="e.g. 192.168.1.100"
            value={esp32Ip}
            onChange={(e) => setEsp32Ip(e.target.value)}
            style={{ maxWidth: "280px" }}
          />
        </div>

        {/* ── Voice Control Panel ── */}
        <div className="voice-panel" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            {/* Mic button */}
            {speechSupported && micPermission !== "denied" ? (
              <button
                id="mic-toggle-btn"
                className={`mic-button ${isListening ? "listening" : ""}`}
                onClick={toggleListening}
                aria-label={isListening ? "Stop listening" : "Start listening"}
              >
                {isListening ? <MicIcon size={40} /> : <MicIcon size={40} />}
              </button>
            ) : (
              <button
                className="mic-button"
                style={{ borderColor: "var(--text-muted)", color: "var(--text-muted)", cursor: "not-allowed", opacity: 0.5 }}
                disabled
                aria-label="Microphone unavailable"
              >
                <MicOffIcon size={40} />
              </button>
            )}

            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {/* Listening indicator */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {isListening && (
                  <>
                    <div className="wave-bars">
                      <div className="wave-bar" />
                      <div className="wave-bar" />
                      <div className="wave-bar" />
                      <div className="wave-bar" />
                      <div className="wave-bar" />
                    </div>
                    <span style={{ fontSize: "0.85rem", color: "var(--mic-active)", fontWeight: 600 }}>
                      Listening...
                    </span>
                  </>
                )}
                {!isListening && speechSupported && micPermission !== "denied" && (
                  <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Tap the mic to start voice control
                  </span>
                )}
                {micPermission === "denied" && (
                  <span style={{ fontSize: "0.85rem", color: "var(--accent-red)" }}>
                    ⚠ Mic permission denied — use text input below
                  </span>
                )}
                {!speechSupported && (
                  <span style={{ fontSize: "0.85rem", color: "var(--accent-amber)" }}>
                    ⚠ Speech not supported in this browser — use text input below
                  </span>
                )}
              </div>

              {/* Transcript */}
              <div className={`transcript-area ${transcript ? "has-text" : ""}`}>
                {transcript || (isListening ? 'Say "light lamp three" or "turn off all lamps"...' : "Voice transcript will appear here")}
              </div>

              {/* Last command badge */}
              {lastCommand && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Last command:</span>
                  <span className={`command-badge ${lastCommand.action}`}>
                    {lastCommand.action === "on" ? "⚡" : "⏻"}{" "}
                    {lastCommand.action.toUpperCase()} → Lamp{" "}
                    {lastCommand.id === "all" ? "ALL" : `#${lastCommand.id}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Text input fallback */}
          {(!speechSupported || micPermission === "denied") && (
            <form onSubmit={handleTextSubmit} style={{ display: "flex", gap: "0.5rem" }}>
              <input
                id="text-command-input"
                type="text"
                className="text-command-input"
                placeholder='Type a command, e.g. "light lamp 5" or "turn off all"'
                value={textCommand}
                onChange={(e) => setTextCommand(e.target.value)}
              />
              <button
                type="submit"
                className="btn-action btn-all-on"
                style={{ flexShrink: 0 }}
              >
                Send
              </button>
            </form>
          )}
        </div>

        {/* ── Bulk Actions ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <button id="all-on-btn" className="btn-action btn-all-on" onClick={allOn}>
            ⚡ All Lamps ON
          </button>
          <button id="all-off-btn" className="btn-action btn-all-off" onClick={allOff}>
            ⏻ All Lamps OFF
          </button>
        </div>

        {/* ── Lamp Grid ── */}
        <div className="lamp-grid">
          {lamps.map((lamp) => (
            <button
              key={lamp.id}
              id={`lamp-card-${lamp.id}`}
              className={`lamp-card ${lamp.on ? "is-on" : ""} ${lamp.error ? "is-error" : ""}`}
              onClick={() => toggleLamp(lamp.id)}
              aria-label={`Lamp ${lamp.id} — ${lamp.on ? "ON" : "OFF"}. Click to toggle.`}
            >
              {lamp.loading && (
                <div className="lamp-loading">
                  <div className="spinner" />
                </div>
              )}

              <div className={`lamp-bulb ${lamp.on ? "on" : "off"}`}>
                <BulbIcon on={lamp.on} />
              </div>

              <span className="lamp-label">Lamp {lamp.id}</span>
              <span className={`lamp-status ${lamp.on ? "on" : "off"}`}>
                {lamp.on ? "ON" : "OFF"}
              </span>
            </button>
          ))}
        </div>

        {/* ── Help Text ── */}
        <div style={{
          marginTop: "0.5rem", padding: "1rem",
          background: "rgba(255,255,255,0.02)", borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-subtle)",
        }}>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600, marginBottom: "0.5rem" }}>
            🎤 Voice Command Examples:
          </p>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "0.25rem 1rem", fontSize: "0.8rem", color: "var(--text-muted)",
          }}>
            <span>&quot;Light lamp three&quot; → ON #3</span>
            <span>&quot;Turn on lamp 7&quot; → ON #7</span>
            <span>&quot;Turn off lamp five&quot; → OFF #5</span>
            <span>&quot;Light all lamps&quot; → ON ALL</span>
            <span>&quot;Turn off all lamps&quot; → OFF ALL</span>
            <span>&quot;Switch off lamp eleven&quot; → OFF #11</span>
          </div>
        </div>
      </main>
    </div>
  );
}