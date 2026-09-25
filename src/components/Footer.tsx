'use client';

import React from 'react';
import { Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="w-full border-t border-slate-800/60 bg-slate-950/40 backdrop-blur-md relative overflow-hidden">
      {/* Subtle gradient line at top */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          {/* Left: Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-400 via-indigo-500 to-fuchsia-600 p-[1px] shadow-md shadow-cyan-500/20">
              <div className="w-full h-full bg-[#06070B] rounded-[6px] flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="fkg1" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#00E5FF"/>
                      <stop offset="50%" stopColor="#6366F1"/>
                      <stop offset="100%" stopColor="#D946EF"/>
                    </linearGradient>
                  </defs>
                  {/* K */}
                  <path d="M18 25 L18 75 M18 50 L35 25 M18 50 L35 75" stroke="url(#fkg1)" strokeWidth="11" strokeLinecap="round"/>
                  {/* E */}
                  <path d="M45 25 L60 25 M45 50 L58 50 M45 75 L60 75 M45 25 L45 75" stroke="url(#fkg1)" strokeWidth="11" strokeLinecap="round"/>
                  {/* E */}
                  <path d="M70 25 L85 25 M70 50 L83 50 M70 75 L85 75 M70 25 L70 75" stroke="url(#fkg1)" strokeWidth="11" strokeLinecap="round"/>
                  {/* V */}
                  <path d="M90 25 L96 75 L102 25" stroke="url(#fkg1)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"/>
                  {/* A */}
                  <path d="M108 75 L115 25 L122 75 M110 50 L120 50" stroke="url(#fkg1)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            <span className="text-slate-300 text-sm font-bold tracking-tight">
              Keeva
            </span>
            <span className="text-slate-600 text-xs hidden sm:inline">•</span>
            <span className="text-slate-500 text-xs hidden sm:inline font-mono">Media Intelligence OS</span>
          </div>

          {/* Center: Made with love by */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Crafted with</span>
            <Heart className="w-3 h-3 text-red-400 fill-red-400 animate-pulse" />
            <span>by</span>
            <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-indigo-400 to-fuchsia-400">
              Abhinav Guddu
            </span>
          </div>

          {/* Right: Links */}
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="hidden sm:inline">© {new Date().getFullYear()} Keeva</span>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-slate-300 transition-colors cursor-pointer"
              aria-label="GitHub"
            >
              {/* GitHub SVG mark */}
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              <span className="hidden sm:inline">Source</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
