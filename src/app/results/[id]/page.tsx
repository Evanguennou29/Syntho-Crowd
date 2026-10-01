'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ScTest } from '@/types/database';
import Link from 'next/link';
import { ChevronLeft, Play, Download, Smartphone, Monitor, AlertTriangle, Lightbulb, XCircle, Activity, RefreshCw, X } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Type sécurisé
type AuditReport = {
  ux_score: number;
  summary: string;
  frustrations: string[];
  positive_points: string[];
  improvements: string[];
};

type TestRun = {
  id: string;
  status: string;
  ai_report: string | null;
  video_url: string | null;
  action_logs: { action: string; selector?: string; reasoning?: string }[] | null;
  profile: { age: number; gender: string; device_type: string; tech_level: number; traits: string } | null;
};

export default function ResultPage() {
  const params = useParams();
  const testId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [test, setTest] = useState<ScTest | null>(null);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedRun, setSelectedRun] = useState<TestRun | null>(null);
  const [tab, setTab] = useState<'audit' | 'logs'>('audit');

  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { if (testId) void fetchData(testId); }, [testId]);
  useEffect(() => {
    if (!testId || test?.status !== 'running') return;
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void fetchData(testId, true); }, 5000);
    return () => window.clearInterval(interval);
  }, [testId, test?.status]);

  useEffect(() => {
    if (selectedRun && videoRef.current) {
        videoRef.current.playbackRate = 2.0;
    }
  }, [selectedRun]);

  useEffect(() => {
    if (!selectedRun) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSession();
      if (event.key === 'Tab') {
        const modal = document.querySelector<HTMLElement>('[data-session-modal]');
        const focusable = modal?.querySelectorAll<HTMLElement>('button, video[controls], a, [tabindex]:not([tabindex="-1"])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); };
  }, [selectedRun]);

  function closeSession() { setSelectedRun(null); window.setTimeout(() => triggerRef.current?.focus(), 0); }

  function openSession(run: TestRun, trigger: HTMLButtonElement) { triggerRef.current = trigger; setTab('audit'); setSelectedRun(run); }

  const fetchData = async (id: string, quiet = false) => {
    try {
      const { data: testData, error: testError } = await supabase.from('sc_tests').select('*').eq('id', id).single();
      if (testError) throw testError;
      const { data: runsData, error: runsError } = await supabase.from('sc_test_runs').select('*, profile:sc_agent_profiles(*)').eq('test_id', id);
      if (runsError) throw runsError;
      setTest(testData);
      setRuns((runsData || []) as TestRun[]);
      setSelectedRun(current => current ? ((runsData || []) as TestRun[]).find(run => run.id === current.id) || current : null);
      setLoadError('');
    } catch {
      if (!quiet) setLoadError('Impossible de charger cet audit. Vérifiez votre connexion puis réessayez.');
    } finally { if (!quiet) setLoading(false); }
  };

  const getSafeReport = (jsonString: string | null): AuditReport => {
    const defaultReport = {
        ux_score: 0,
        summary: "Analyse en attente ou échouée.",
        frustrations: [],
        positive_points: [],
        improvements: []
    };
    if (!jsonString) return defaultReport;
    try {
      const parsed = JSON.parse(jsonString);
      return {
        ux_score: typeof parsed.ux_score === 'number' ? parsed.ux_score : 0,
        summary: parsed.summary || "Pas de résumé.",
        frustrations: Array.isArray(parsed.frustrations) ? parsed.frustrations : [],
        positive_points: Array.isArray(parsed.positive_points) ? parsed.positive_points : [],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
      };
    } catch { return defaultReport; }
  };

  // --- MOTEUR PDF PREMIUM ---
  const downloadPDF = () => {
    if (!test || runs.length === 0) return;

    const doc = new jsPDF();

    // Couleurs
    const colCyan = [0, 243, 255] as [number, number, number];
    const colViolet = [112, 0, 255] as [number, number, number];
    const colDark = [10, 10, 30] as [number, number, number];

    // PAGE DE GARDE
    doc.setFillColor(...colDark);
    doc.rect(0, 0, 210, 297, 'F');

    doc.setFontSize(40);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text("SYNTHO", 20, 100);
    doc.setTextColor(...colCyan);
    doc.text("CROWD", 85, 100);

    doc.setFontSize(16);
    doc.setTextColor(200, 200, 200);
    doc.setFont('helvetica', 'normal');
    doc.text("RAPPORT D'AUDIT UX AUTOMATISÉ", 20, 115);

    doc.setDrawColor(...colViolet);
    doc.setLineWidth(1);
    doc.line(20, 130, 190, 130);

    doc.setFontSize(12);
    doc.setTextColor(150, 150, 150);
    doc.text(`CIBLE :`, 20, 150);
    doc.setTextColor(255, 255, 255);
    doc.text(test.url, 50, 150);

    doc.setTextColor(150, 150, 150);
    doc.text(`DATE :`, 20, 160);
    doc.setTextColor(255, 255, 255);
    doc.text(new Date().toLocaleDateString(), 50, 160);

    const avgScore = Math.round(runs.reduce((a, b) => a + getSafeReport(b.ai_report).ux_score, 0) / runs.length);

    const scoreColor: [number, number, number] = avgScore >= 70 ? [50, 205, 50] : avgScore >= 40 ? [255, 165, 0] : [255, 50, 50];
    doc.setDrawColor(...scoreColor);
    doc.setLineWidth(3);
    doc.circle(160, 160, 20);

    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text(`${avgScore}`, 160, 162, { align: 'center' });
    doc.setFontSize(8);
    doc.text("SCORE UX", 160, 172, { align: 'center' });

    // CONTENU
    doc.addPage();
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, 'F');

    let yPos = 30;

    runs.forEach((run, index) => {
        const report = getSafeReport(run.ai_report);
        const profile = run.profile;

        autoTable(doc, {
            startY: yPos,
            head: [[`AGENT #${index + 1}  •  ${profile?.age ?? '?'} ans  •  ${(profile?.gender || 'INCONNU').toUpperCase()}  •  Tech ${profile?.tech_level ?? '?'}/10`]],
            theme: 'grid',
            headStyles: {
                fillColor: colDark,
                textColor: colCyan,
                fontSize: 10,
                fontStyle: 'bold',
                halign: 'left'
            },
            margin: { top: 10 }
        });

        const contentData = [
            [{ content: 'RÉSUMÉ', styles: { fontStyle: 'bold' as const, textColor: colViolet } }, report.summary],
            [{ content: 'FRICTIONS', styles: { fontStyle: 'bold' as const, textColor: [255, 50, 50] as [number, number, number] } }, report.frustrations.map(f => `• ${f}`).join('\n')],
            [{ content: 'CONSEILS', styles: { fontStyle: 'bold' as const, textColor: [0, 150, 100] as [number, number, number] } }, report.improvements.map(i => `• ${i}`).join('\n')]
        ];

        const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

        autoTable(doc, {
            startY: finalY,
            body: contentData,
            theme: 'plain',
            styles: { fontSize: 9, cellPadding: 4, overflow: 'linebreak' },
            columnStyles: { 0: { cellWidth: 35, valign: 'top' }, 1: { cellWidth: 'auto', valign: 'top' } },
            didDrawPage: (data) => { if (data.pageNumber > 1 && data.cursor?.y === data.settings.startY) { yPos = data.settings.startY; } }
        });

        yPos = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 2; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Rapport Syntho-Crowd - Page ${i}/${pageCount}`, 105, 290, { align: 'center' });
    }

    doc.save(`SynthoCrowd_Audit_${test.id.slice(0,6)}.pdf`);
  };

  if (loading) return <div className="app-shell results-loading" role="status"><div className="result-skeleton large"/><div className="result-skeleton"/><div className="result-skeleton"/><span>Chargement du rapport…</span></div>;
  if (loadError) return <div className="app-shell results-error" role="alert"><AlertTriangle size={28}/><h1>Rapport indisponible</h1><p>{loadError}</p><button onClick={() => testId && fetchData(testId)}>Réessayer</button><Link href="/">Retour au Builder</Link></div>;
  if (!test) return <div className="app-shell results-error"><h1>Test introuvable</h1><p>Aucun audit ne correspond à cet identifiant.</p><Link href="/">Retour au Builder</Link></div>;

  const scores = runs.map(r => getSafeReport(r.ai_report).ux_score).filter(s => s > 0);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return (
    <div className="results-page min-h-screen pb-20">
      {/* HEADER DASHBOARD */}
      <div className="results-header">
         <div className="max-w-7xl mx-auto px-6 py-7 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-5 w-full md:w-auto">
               <Link href="/" aria-label="Retour au Builder" className="h-12 w-12 flex items-center justify-center rounded-xl border border-white/10 bg-slate-800/50 hover:bg-white/10 hover:border-cyan-500/50 transition-all text-slate-400 hover:text-cyan-400">
                  <ChevronLeft size={24}/>
               </Link>
                <div className="min-w-0">
                   <p className="results-eyebrow">RAPPORT DE MISSION <span>/</span> {test.status === 'running' ? 'EN COURS' : test.status === 'failure' ? 'ÉCHEC' : 'TERMINÉ'}</p>
                   <h1 className="text-xl md:text-2xl font-bold text-white font-space tracking-tight truncate max-w-md" title={test.url}>{test.url}</h1>
                  <div className="flex items-center gap-3 mt-1">
                     <span className="text-[10px] bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20 font-mono uppercase tracking-wider">
                        {runs.length} AGENTS
                     </span>
                      <span className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">ID: {test.id.substring(0,8)}...</span>
                  </div>
               </div>
            </div>

            <div className="flex items-center gap-8 w-full md:w-auto justify-between md:justify-end bg-slate-950/50 p-3 rounded-xl border border-white/5 md:bg-transparent md:border-0 md:p-0">
               <div className="text-right">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">SCORE GLOBAL</div>
                  <div className={`text-4xl font-black font-space leading-none ${scores.length === 0 ? 'text-slate-400' : avgScore >= 70 ? 'text-emerald-400' : avgScore >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                     {scores.length ? avgScore : '—'}<span className="text-lg text-slate-400 font-light">/100</span>
                  </div>
               </div>
               <div className="w-px h-10 bg-white/10 hidden md:block"></div>
               <button onClick={downloadPDF} disabled={runs.length === 0} className="pdf-button bg-gradient-to-br from-slate-800 to-slate-900 hover:from-cyan-900 hover:to-slate-900 text-slate-200 border border-white/10 hover:border-cyan-500/50 px-5 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg">
                  <Download size={16}/> RAPPORT PDF
               </button>
            </div>
         </div>
      </div>

      {/* GRILLE DES AGENTS */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="results-overview reveal"><div><p className="eyebrow">LECTURE DU TERRAIN</p><h2>Sessions individuelles</h2><p>Explorez les parcours, les vidéos et les constats de chaque agent.</p></div><span><Activity size={16}/>{runs.filter(run => run.status !== 'running').length} / {runs.length} sessions traitées</span></div>
        {test.status === 'running' && <div className="results-progress" role="status"><RefreshCw size={17} className="results-spinner"/><div><strong>Audit en cours</strong><p>Les sessions se mettent à jour automatiquement lorsque de nouvelles données arrivent.</p></div></div>}
        {test.status === 'failure' && <div className="results-progress error" role="alert"><AlertTriangle size={17}/><div><strong>L’audit a échoué</strong><p>Les sessions déjà enregistrées restent consultables ci-dessous.</p></div></div>}
        {runs.length === 0 && <div className="results-empty">Aucune session enregistrée pour le moment.</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {runs.map((run, i) => {
            const report = getSafeReport(run.ai_report);
            return (
              <button type="button"
                key={run.id}
                onClick={(event) => openSession(run, event.currentTarget)}
                className="result-card glass-panel rounded-xl p-0 cursor-pointer hover:border-cyan-500/50 hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden text-left reveal"
                style={{ animationDelay: `${Math.min(i * 35, 350)}ms` }}
                aria-label={`Voir l’analyse de l’agent ${i + 1}`}
              >
                <div className={`absolute top-0 left-0 w-1 h-full z-20 ${run.status === 'running' ? 'bg-amber-400' : run.status === 'failure' ? 'bg-rose-500' : 'bg-emerald-500'}`}/>
                <div className="p-6 pl-8 relative z-10">
                    <div className="flex justify-between items-start mb-5">
                      <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-lg bg-slate-800/80 flex items-center justify-center font-bold text-slate-300 font-mono border border-white/5 group-hover:bg-slate-700 transition-colors">
                            {run.profile?.age ?? '—'}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white tracking-wide">{run.profile?.gender?.toUpperCase() || 'PROFIL INCONNU'}</div>
                            <div className="text-[10px] text-slate-500 font-mono uppercase flex items-center gap-1.5 mt-1">
                                {run.profile?.device_type === 'mobile' ? <Smartphone size={12}/> : <Monitor size={12}/>}
                                TECH {run.profile?.tech_level ?? '—'}/10
                            </div>
                          </div>
                      </div>
                      {report.ux_score > 0 && (
                        <div className={`px-2.5 py-1 rounded border backdrop-blur-md text-sm font-bold font-mono ${report.ux_score >= 70 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
                          {report.ux_score}
                        </div>
                      )}
                    </div>
                    <div className="relative">
                        <p className="text-xs text-slate-400 line-clamp-2 h-9 leading-relaxed italic border-l-2 border-slate-700 pl-3">« {report.summary} »</p>
                    </div>
                </div>
                <div className="bg-slate-950/50 px-6 py-3 border-t border-white/5 flex justify-between items-center group-hover:bg-cyan-950/20 transition-colors">
                    <span className="text-[10px] text-slate-400 font-mono uppercase">Agent #{i+1} · {run.status === 'running' ? 'En cours' : run.status === 'failure' ? 'Échec' : 'Terminé'}</span>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-cyan-400 opacity-60 group-hover:opacity-100 transition-opacity">
                       VOIR L’ANALYSE <Play size={10} fill="currentColor"/>
                    </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* MODALE DÉTAILS */}
      {selectedRun && (
        <div className="session-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSession(); }}>
          <div data-session-modal role="dialog" aria-modal="true" aria-label="Analyse de la session" className="session-modal" onMouseDown={event => event.stopPropagation()}>
            <button ref={closeRef} type="button" onClick={closeSession} className="session-close" aria-label="Fermer l’analyse"><X size={18}/></button>

            {/* GAUCHE : PLAYER */}
            <div className="session-player">
               {selectedRun.video_url ? (
                  // ⚡ VIDEO AVEC REF POUR SPEED X2
                  <video
                    ref={videoRef}
                    src={selectedRun.video_url}
                    controls
                    autoPlay
                    playsInline
                    aria-label="Enregistrement vidéo de la session"
                    className="max-w-full max-h-full object-contain shadow-2xl"
                  />
               ) : (
                  <div className="text-slate-500 flex flex-col items-center gap-3 font-mono text-xs">
                      <AlertTriangle size={32} className="opacity-50"/>
                      VIDÉO EN TRAITEMENT
                  </div>
               )}
            </div>

            {/* DROITE : RAPPORT */}
            <div className="session-report">
               <div className="flex border-b border-slate-800" role="tablist" aria-label="Détails de la session">
                  <button role="tab" aria-selected={tab === 'audit'} id="audit-tab" aria-controls="audit-panel" onClick={() => setTab('audit')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors ${tab === 'audit' ? 'text-cyan-300 border-b-2 border-cyan-400 bg-cyan-950/10' : 'text-slate-300 hover:text-white'}`}>Audit UX</button>
                  <button role="tab" aria-selected={tab === 'logs'} id="logs-tab" aria-controls="logs-panel" onClick={() => setTab('logs')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors ${tab === 'logs' ? 'text-violet-300 border-b-2 border-violet-400 bg-violet-950/10' : 'text-slate-300 hover:text-white'}`}>Logs Console</button>
               </div>

               <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                  {tab === 'audit' && (
                    <div role="tabpanel" id="audit-panel" aria-labelledby="audit-tab">
                      <div className="text-center pb-6 border-b border-slate-800">
                         <div className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mb-2">Expérience Utilisateur</div>
                         <div className={`text-6xl font-black font-space ${getSafeReport(selectedRun.ai_report).ux_score >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {selectedRun.ai_report ? getSafeReport(selectedRun.ai_report).ux_score : '—'}
                         </div>
                         <p className="text-sm text-slate-400 mt-4 leading-relaxed font-light italic">
                           « {getSafeReport(selectedRun.ai_report).summary} »
                         </p>
                      </div>
                      <div className="space-y-4">
                         <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2"><Lightbulb size={14}/> Recommandations</h3>
                         <ul className="space-y-3">
                           {getSafeReport(selectedRun.ai_report).improvements.map((item, i) => (
                             <li key={i} className="bg-cyan-950/20 border border-cyan-500/20 p-3 rounded text-sm text-cyan-100/80 flex gap-3 leading-snug"><span className="text-cyan-500 font-bold font-mono">{i+1}.</span>{item}</li>
                           ))}
                         </ul>
                      </div>
                      <div className="space-y-4">
                         <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-2"><XCircle size={14}/> Points de friction</h3>
                         <ul className="space-y-2">
                           {getSafeReport(selectedRun.ai_report).frustrations.map((item, i) => (
                             <li key={i} className="text-sm text-slate-400 flex gap-2 leading-snug"><span className="text-rose-500 shrink-0 mt-1">•</span> {item}</li>
                           ))}
                         </ul>
                      </div>
                    </div>
                  )}
                  {tab === 'logs' && (
                     <div role="tabpanel" id="logs-panel" aria-labelledby="logs-tab" className="font-mono text-xs space-y-2 text-slate-300">
                        {!selectedRun.action_logs?.length && <p className="text-slate-400">Aucun log disponible pour cette session.</p>}
                        {selectedRun.action_logs?.map((log, i: number) => (
                           <div key={i} className="flex gap-3 border-b border-slate-800/50 pb-2">
                              <span className="text-slate-600 w-6 shrink-0">{i+1}</span>
                              <div className="break-all">
                                <span className={`font-bold uppercase ${log.action === 'fail' ? 'text-rose-400' : 'text-cyan-400'}`}>{log.action}</span>
                                <span className="ml-2 text-slate-500">{log.selector}</span>
                                <div className="text-slate-600 mt-1 italic">{log.reasoning}</div>
                              </div>
                           </div>
                        ))}
                     </div>
                  )}
               </div>
               <button onClick={closeSession} className="p-4 text-center text-xs font-bold text-slate-300 hover:text-white border-t border-slate-800 bg-slate-900/50 hover:bg-slate-800 transition-colors uppercase tracking-widest">
                  Fermer la session
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
