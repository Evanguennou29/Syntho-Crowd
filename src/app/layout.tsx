import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';


export const metadata: Metadata = {
  title: 'SynthoCrowd — Laboratoire de tests UX',
  description: 'Configurez une foule de personas et analysez leurs parcours UX.',
};

const Logo = () => (
  <div className="flex items-center gap-3 group">
    <div className="relative">
      <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"/>
      <svg width="32" height="32" viewBox="0 0 100 100" fill="none" className="relative z-10">
        <path d="M50 10V90" stroke="#00f3ff" strokeWidth="6" strokeLinecap="round" />
        <path d="M10 50H90" stroke="#7000ff" strokeWidth="6" strokeLinecap="round"/>
        <circle cx="50" cy="50" r="30" stroke="url(#paint0_linear)" strokeWidth="6"/>
        <defs>
          <linearGradient id="paint0_linear" x1="0" y1="0" x2="100" y2="100">
            <stop stopColor="#00f3ff"/>
            <stop offset="1" stopColor="#7000ff"/>
          </linearGradient>
        </defs>
      </svg>
    </div>
    <span className="brand-wordmark">
      SYNTHO<span className="text-cyan-400">CROWD</span>
    </span>
  </div>
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased text-slate-200">
        <nav className="site-nav">
          <div className="nav-inner">
            <Link href="/" aria-label="SynthoCrowd — accueil"><Logo /></Link>
            <div className="nav-right"><span className="nav-version">UX TESTING / 01</span><Link href="/" className="nav-builder">BUILDER</Link></div>
          </div>
        </nav>
        <main className="site-main">
          {children}
        </main>
      </body>
    </html>
  );
}
