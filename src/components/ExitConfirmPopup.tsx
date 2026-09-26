'use client';

import React, { useEffect, useState } from 'react';

interface ExitConfirmPopupProps {
  isOpen: boolean;
  onStay: () => void;
  onExit: () => void;
}

const MESSAGES = [
  {
    emoji: '🥺',
    headline: 'Abhi mat jao...',
    subtext: 'Teri saved reels tumhara wait kar rahi hain!',
    ctaStay: 'Ruko thoda',
    ctaExit: 'Exit karna hai',
    accent: 'from-pink-500 to-rose-600',
  },
  {
    emoji: '💾',
    headline: 'Ek baar aur dekh lo?',
    subtext: 'Teri Must-Learn list abhi bhi poori nahi hui boss!',
    ctaStay: 'Thehro',
    ctaExit: 'Baad mein aaunga',
    accent: 'from-indigo-500 to-purple-600',
  },
  {
    emoji: '🔥',
    headline: 'Knowledge chhod ke ja raha hai?',
    subtext: 'Abhi 5 must-learn reels tumhara wait kar rahi hain...',
    ctaStay: 'Dekh leta hoon',
    ctaExit: 'Phir bhi jaana hai',
    accent: 'from-amber-500 to-orange-600',
  },
  {
    emoji: '🚀',
    headline: 'Vault band karna? Sach mein?',
    subtext: 'Jo log sikhna nahi chhodte — wahi aage badhte hain!',
    ctaStay: 'Seekhna jaari rakhunga',
    ctaExit: 'Kal dekh lunga',
    accent: 'from-cyan-500 to-blue-600',
  },
];

export function ExitConfirmPopup({ isOpen, onStay, onExit }: ExitConfirmPopupProps) {
  const [msg] = useState(() => MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLeaving(false);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  const handleStay = () => {
    setLeaving(false);
    setVisible(false);
    setTimeout(onStay, 280);
  };

  const handleExit = () => {
    setLeaving(true);
    setVisible(false);
    setTimeout(onExit, 320);
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-end sm:items-center justify-center transition-all duration-300 ${
        visible ? 'bg-black/70 backdrop-blur-md' : 'bg-black/0 backdrop-blur-none'
      }`}
      onClick={handleStay}
    >
      <div
        className={`w-full sm:w-auto sm:min-w-[340px] sm:max-w-sm mx-4 mb-6 sm:mb-0 transition-all duration-300 ${
          visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-20 opacity-0 scale-95'
        } ${leaving ? '-translate-y-4 opacity-0 scale-105' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glass card */}
        <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl shadow-black/60 bg-slate-900/95 backdrop-blur-2xl">
          {/* Ambient gradient glow behind */}
          <div className={`absolute inset-0 bg-gradient-to-br ${msg.accent} opacity-10 pointer-events-none`} />

          {/* Top accent bar */}
          <div className={`h-1 w-full bg-gradient-to-r ${msg.accent}`} />

          <div className="p-6 text-center">
            {/* Big emoji with bounce */}
            <div
              className="text-6xl mb-4 select-none"
              style={{ animation: 'bounce 1s ease-in-out infinite' }}
            >
              {msg.emoji}
            </div>

            {/* Headline */}
            <h2 className="text-xl font-black text-white mb-2 leading-tight">{msg.headline}</h2>

            {/* Subtext */}
            <p className="text-sm text-slate-300 mb-6 leading-relaxed">{msg.subtext}</p>

            {/* CTA Buttons */}
            <div className="flex flex-col gap-2.5">
              {/* Stay — primary */}
              <button
                onClick={handleStay}
                className={`w-full py-3.5 rounded-2xl bg-gradient-to-r ${msg.accent} text-white font-bold text-sm shadow-lg active:scale-95 transition-all hover:opacity-90`}
              >
                {msg.ctaStay} 😊
              </button>

              {/* Exit — ghost */}
              <button
                onClick={handleExit}
                className="w-full py-3 rounded-2xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-medium text-sm transition-all active:scale-95 border border-slate-700/60"
              >
                {msg.ctaExit}
              </button>
            </div>

            {/* Bottom caption */}
            <p className="text-[11px] text-slate-600 mt-4 font-mono">Keeva — Your Learning Vault</p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
