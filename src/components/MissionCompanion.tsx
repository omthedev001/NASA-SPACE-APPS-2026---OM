import { useEffect, useState } from 'react';
import { MessageSquare, Send, Wind } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  mode?: string;
}

const BREATH_PHASES = [
  { label: 'Inhale slowly', seconds: 4, color: 'bg-[#0b3d91]' },
  { label: 'Hold steady', seconds: 7, color: 'bg-[#d97706]' },
  { label: 'Exhale completely', seconds: 8, color: 'bg-[#15803d]' },
];

export function MissionCompanion() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'assistant',
      text: 'AstroHealth Flight Surgeon & Behavioral Companion ready. Ask about your vitals, sleep/isolation stress, radiation safety, or use the 4-7-8 breathing pacer above.',
      mode: 'ready',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // 4-7-8 Vagal Breathing Pacer state (zero circles, pure rectangular bar)
  const [pacing, setPacing] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!pacing) return;
    const timer = window.setInterval(() => {
      setElapsedSec((prev) => {
        const currentPhase = BREATH_PHASES[phaseIdx];
        if (prev + 1 >= currentPhase.seconds) {
          setPhaseIdx((p) => (p + 1) % BREATH_PHASES.length);
          return 0;
        }
        return prev + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pacing, phaseIdx]);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/companion/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: data.reply || 'Unable to reach companion engine.',
          mode: data.mode,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: 'Local companion endpoint unreachable. Check server connection on port 3000.',
          mode: 'error',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const activePhase = BREATH_PHASES[phaseIdx];
  const phasePct = Math.round(((elapsedSec + 1) / activePhase.seconds) * 100);

  return (
    <div id="section-companion" className="sx-panel overflow-hidden">
      <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#93c5fd]" />
          <h2 className="text-xs font-semibold tracking-wide text-white">
            Behavioral Companion &amp; Guided Breathing
          </h2>
        </div>
        <span className="text-[11px] font-mono text-[#dbeafe]">Crew Support</span>
      </div>

      <div className="p-4 flex flex-col gap-3.5">
        {/* 4-7-8 Vagal Breathing Pacer (Rectangular Progress Bar) */}
        <div className="sx-cell p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#0f2942]">
              <Wind className="w-3.5 h-3.5 text-[#0b3d91]" />
              <span>4-7-8 Vagal Breathing Pacer</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPacing((p) => !p);
                setPhaseIdx(0);
                setElapsedSec(0);
              }}
              className={`px-3 py-1 text-xs font-semibold cursor-pointer ${
                pacing ? 'sx-btn' : 'sx-btn-primary'
              }`}
            >
              {pacing ? 'Stop Pacer' : 'Start 4-7-8 Pacer'}
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-[#475569]">
            <span>{pacing ? activePhase.label : 'Standby · Lowers cortisol & heart rate'}</span>
            <span>
              {pacing ? `${elapsedSec + 1}s / ${activePhase.seconds}s` : '4s · 7s · 8s'}
            </span>
          </div>

          <div className="h-3 w-full bg-[#dce5f0] border border-[#9cb0c9]">
            <div
              className={`h-full transition-all duration-300 ${
                pacing ? activePhase.color : 'bg-[#94a3b8]'
              }`}
              style={{ width: pacing ? `${phasePct}%` : '0%' }}
            />
          </div>
        </div>

        {/* Quick Prompts */}
        <div className="flex flex-wrap gap-1.5">
          {[
            'Review my current vitals',
            'I feel anxious and isolated',
            'Why is blood pressure changing?',
            'Guide me through breathing',
          ].map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => sendMessage(prompt)}
              disabled={loading}
              className="sx-btn px-2.5 py-1 text-[11px] font-medium cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Chat Log */}
        <div className="sx-cell p-3 max-h-60 overflow-y-auto flex flex-col gap-2 bg-white">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`p-2.5 border text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#eff6ff] border-[#0b3d91] text-[#0f2942] ml-8'
                  : 'bg-[#f8fafc] border-[#b6c6d8] text-[#1e293b] mr-4'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-mono text-[#475569] mb-1">
                <span>{msg.role === 'user' ? 'CDR-01' : 'Flight Surgeon'}</span>
                {msg.mode && msg.role === 'assistant' && (
                  <span className="text-[#0b3d91] font-semibold">
                    {msg.mode === 'uplink-ai' ? 'AI Uplink' : 'Offline Edge'}
                  </span>
                )}
              </div>
              <p>{msg.text}</p>
            </div>
          ))}
          {loading && (
            <div className="text-xs font-mono text-[#0b3d91] p-2">
              Evaluating live telemetry and formulating guidance...
            </div>
          )}
        </div>

        {/* Input Row */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about symptoms, isolation stress, sleep, or countermeasures..."
            className="sx-input flex-1 px-3 py-2 text-xs"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="sx-btn-primary px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
