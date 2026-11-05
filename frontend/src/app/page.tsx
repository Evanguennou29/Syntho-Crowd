'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, statusLabel } from '@/lib/api';
import { ScAgentProfile, ScTest } from '@/types/database';
import Link from 'next/link';
import { Rocket, Users, Monitor, Smartphone, Target, Activity, Zap, Plus, Trash2, History, ChevronRight, ArrowUpRight } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // --- ÉTATS ---
  const [url, setUrl] = useState('https://www.google.com');
  const [goal, setGoal] = useState('');
  const [recentTests, setRecentTests] = useState<ScTest[]>([]);

  // Gestion Multi-Profils
  const [profiles, setProfiles] = useState<ScAgentProfile[]>([{
    id: '1', // ID temporaire pour le front
    age: 25,
    gender: 'Homme',
    tech_level: 8,
    device_type: 'desktop',
    traits: 'Pressé',
    multiplier: 1 // Chaque profil a son propre compteur de foule
  }]);

  // --- CHARGEMENT HISTORIQUE ---
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setRecentTests(await apiFetch<ScTest[]>('campaigns?limit=5'));
        setHistoryError(false);
      } catch { setHistoryError(true); }
      finally { setHistoryLoading(false); }
    };
    fetchHistory();
  }, []);

  // --- LOGIQUE PROFILS ---
  const addProfile = () => {
    if (profiles.length >= 20) return;
    setProfiles([...profiles, {
      id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      age: 35,
      gender: 'Femme',
      tech_level: 5,
      device_type: 'mobile',
      traits: 'Curieux',
      multiplier: 1
    }]);
  };

  const removeProfile = (id: string) => {
    if (profiles.length === 1 || removingId) return;
    setRemovingId(id);
    window.setTimeout(() => {
      setProfiles(current => current.filter(profile => profile.id !== id));
      setRemovingId(null);
    }, 180);
  };

  const updateProfile = (id: string, field: keyof ScAgentProfile, value: string | number) => {
    setProfiles(current => current.map(profile => profile.id === id ? { ...profile, [field]: value } : profile));
  };

  // --- CALCULS ---
  const totalAgents = profiles.reduce((acc, p) => acc + p.multiplier, 0);
  const totalCost = totalAgents * 5;


  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLaunchError('');
    setLoading(true);
    try {
      const data = await apiFetch<{ campaign_id: string }>('campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          goal,
          profiles: profiles.map(({ age, gender, tech_level, device_type, traits, multiplier }) =>
            ({ age, gender, tech_level, device_type, traits, multiplier }))
        }),
      });

      router.push(`/results/${data.campaign_id}`);
    } catch (e) {
      console.error(e);
      setLaunchError(e instanceof Error ? e.message : 'Une erreur inattendue est survenue.');
      setLoading(false);
    }
  };

  return (
    <div className="app-shell builder-page">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-7">

        {/* === COLONNE GAUCHE (Configuration) === */}
        <div className="lg:col-span-8 space-y-7">

          {/* 1. MISSION */}
          <section className="glass-panel control-panel reveal delay-1 relative overflow-hidden group" aria-labelledby="mission-title">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
              <Target size={120} className="text-cyan-400"/>
            </div>

            <h2 id="mission-title" className="section-title">
              <span className="section-number cyan">01</span><span><small>POINT DE DÉPART</small> Mission du test</span>
            </h2>

            <div className="space-y-6 relative z-10">
              <div>
                <label htmlFor="target-url" className="label-cyber">URL à tester <span className="text-cyan-400">*</span></label>
                <input
                  id="target-url" required
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="input-cyber w-full font-mono text-sm bg-slate-950"
                  placeholder="https://..."
                />
                <p className="field-help">Les agents ouvriront cette page pour effectuer leur mission.</p>
              </div>
              <div>
                <label htmlFor="audit-goal" className="label-cyber">Objectif de l’audit</label>
                <textarea
                  id="audit-goal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="input-cyber w-full h-24 resize-none text-sm leading-relaxed"
                  placeholder="Scénario : 'Trouver le bouton s'inscrire, remplir le formulaire...'"
                />
                <p className="field-help">Sans objectif, les agents exploreront librement les frictions.</p>
              </div>
            </div>
          </section>

          {/* 2. GESTION DES PROFILS (Multi-Persona) */}
          <section className="glass-panel control-panel reveal delay-2 relative overflow-hidden" aria-labelledby="personas-title">
            <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
              <Users size={120} className="text-violet-500"/>
            </div>

            <div className="flex justify-between items-center gap-3 mb-7">
               <h2 id="personas-title" className="section-title">
                 <span className="section-number violet">02</span><span><small>CONFIGURATION</small> Votre foule</span>
               </h2>
               <span className="persona-limit">{profiles.length} / 20 personas</span>
            </div>
            <p className="section-description">Chaque persona définit un comportement. Ajustez le nombre d’agents pour explorer plusieurs parcours.</p>

            <div className="space-y-6">
              {profiles.map((p, index) => (
                <div key={p.id} className={`persona-card ${removingId === p.id ? 'persona-removing' : ''}`}>

                  {/* Header Carte Profil */}
                  <div className="flex justify-between items-start mb-6 border-b border-white/5 pb-4">
                     <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-violet-900/30 border border-violet-500/30 flex items-center justify-center text-xs font-bold text-violet-300">
                           #{index + 1}
                        </div>
                        <span className="text-sm font-bold text-slate-300">PERSONA {index + 1}</span>
                     </div>
                     {profiles.length > 1 && (
                         <button type="button" onClick={() => removeProfile(p.id!)} aria-label={`Supprimer le persona ${index + 1}`} className="persona-delete">
                         <Trash2 size={16}/>
                       </button>
                     )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

                    {/* Colonne Config (8 parts) */}
                    <div className="md:col-span-7 space-y-4">
                        <div className="flex gap-3">
                           <div className="flex-1">
                              <label htmlFor={`${p.id}-gender`} className="label-cyber">Genre</label>
                              <select
                                id={`${p.id}-gender`}
                                value={p.gender}
                                onChange={(e) => updateProfile(p.id!, 'gender', e.target.value)}
                                className="input-cyber w-full py-2 text-xs"
                              >
                                <option value="Homme">Homme</option>
                                <option value="Femme">Femme</option>
                              </select>
                           </div>
                           <div className="w-20">
                              <label htmlFor={`${p.id}-age`} className="label-cyber">Âge</label>
                              <input
                                id={`${p.id}-age`} type="number" min="18" max="100" required
                                value={p.age}
                                onChange={(e) => updateProfile(p.id!, 'age', Number(e.target.value))}
                                className="input-cyber w-full py-2 text-xs text-center"
                              />
                           </div>
                        </div>

                        <div>
                           <label htmlFor={`${p.id}-tech`} className="label-cyber">Aisance numérique <strong>{p.tech_level}/10</strong></label>
                           <input
                              id={`${p.id}-tech`}
                              type="range" min="1" max="10"
                              value={p.tech_level}
                              onChange={(e) => updateProfile(p.id!, 'tech_level', Number(e.target.value))}
                              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                           />
                        </div>

                        <div><span className="label-cyber" id={`${p.id}-device`}>Appareil</span><div className="flex gap-2" role="group" aria-labelledby={`${p.id}-device`}>
                           <button
                             type="button" aria-pressed={p.device_type === 'desktop'}
                             onClick={() => updateProfile(p.id!, 'device_type', 'desktop')}
                             className={`flex-1 py-2 rounded border text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 ${p.device_type === 'desktop' ? 'bg-violet-500/20 border-violet-500/50 text-white' : 'border-slate-800 text-slate-500 hover:border-slate-600'}`}
                           >
                             <Monitor size={12}/> Desktop
                           </button>
                           <button
                             type="button" aria-pressed={p.device_type === 'mobile'}
                             onClick={() => updateProfile(p.id!, 'device_type', 'mobile')}
                             className={`flex-1 py-2 rounded border text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 ${p.device_type === 'mobile' ? 'bg-violet-500/20 border-violet-500/50 text-white' : 'border-slate-800 text-slate-500 hover:border-slate-600'}`}
                           >
                             <Smartphone size={12}/> Mobile
                           </button>
                        </div></div>

                        <label htmlFor={`${p.id}-traits`} className="label-cyber">Traits de caractère</label>
                        <input
                           id={`${p.id}-traits`}
                           type="text"
                           value={p.traits}
                           onChange={(e) => updateProfile(p.id!, 'traits', e.target.value)}
                           className="input-cyber w-full text-xs"
                           placeholder="Traits: Pressé, Sceptique..."
                        />
                    </div>

                    {/* Colonne Multiplicateur (4 parts) */}
                    <div className="md:col-span-5 bg-cyan-950/10 rounded-lg border border-cyan-500/10 p-4 flex flex-col justify-center">
                        <label className="label-cyber text-cyan-200 mb-4 text-center">
                           AGENTS POUR CE PROFIL
                        </label>
                        <div className="text-center mb-4">
                           <span key={p.multiplier} className="text-4xl font-black text-cyan-400 font-space count-change">{p.multiplier}</span>
                        </div>
                        <input
                           type="range" min="1" max="50" aria-label={`Nombre d’agents pour le persona ${index + 1}`}
                           value={p.multiplier}
                           onChange={(e) => updateProfile(p.id!, 'multiplier', Number(e.target.value))}
                           className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                        />
                        <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-2">
                           <span>1</span><span>50</span>
                        </div>
                    </div>

                  </div>
                </div>
              ))}

              {/* Bouton Ajout Large */}
              <button
                type="button" disabled={profiles.length >= 20}
                onClick={addProfile}
                className="w-full py-4 rounded-xl border-2 border-dashed border-slate-800 text-slate-500 hover:border-violet-500/50 hover:text-violet-400 hover:bg-violet-900/5 transition-all flex items-center justify-center gap-2 font-bold uppercase tracking-widest text-xs"
              >
                <Plus size={16}/> {profiles.length >= 20 ? 'Limite de 20 personas atteinte' : 'Ajouter un persona'}
              </button>
            </div>
          </section>
        </div>

        {/* === COLONNE DROITE (Contrôle & Historique) === */}
        <aside className="lg:col-span-4 space-y-6" aria-label="Pilotage du test">

          {/* PANNEAU DE CONTRÔLE */}
          <div className="glass-panel summary-panel reveal delay-2 sticky top-24 z-20">
            <h3 className="summary-title">
              <Activity size={18} className="text-cyan-400"/>
              <span><small>VUE D’ENSEMBLE</small> Prêt au lancement</span>
            </h3>
            <div className="crowd-visual" aria-hidden="true"><div className="crowd-orbit orbit-one"/><div className="crowd-orbit orbit-two"/><div className="crowd-center"><Users size={24}/></div><i className="orbit-node node-one"/><i className="orbit-node node-two"/><i className="orbit-node node-three"/></div>

            {/* TOTAL */}
            <div className="space-y-4 mb-8">
               <div className="flex justify-between items-end border-b border-white/10 pb-4">
                  <span className="text-slate-400 text-xs font-bold uppercase">Total Agents</span>
                  <div className="text-right">
                      <span key={totalAgents} className="text-4xl font-black text-white font-space leading-none inline-block count-bump" aria-live="polite">{totalAgents}</span>
                      <span className="text-xs text-slate-400 block">{totalAgents > 1 ? 'agents configurés' : 'agent configuré'}</span>
                  </div>
               </div>

                <div className="flex justify-between text-sm items-center">
                   <span className="text-slate-400">Personas</span>
                   <span className="text-white font-mono font-bold">{profiles.length}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-400">Coût total</span>
                  <span className="text-white font-mono font-bold">{totalCost} CRÉDITS</span>
               </div>
               <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-400">Temps estimé</span>
                  <span className="text-white font-mono opacity-80">~{Math.max(2, Math.round(totalAgents * 0.5))} min</span>
               </div>
            </div>

            {/* BOUTON LANCEMENT */}
            <button
              type="submit" disabled={loading}
              className={`
                w-full py-5 rounded-xl font-bold text-white text-sm tracking-[0.15em] font-space
                flex items-center justify-center gap-3 transition-all duration-500 relative overflow-hidden group
                ${loading
                  ? 'is-launching cursor-wait'
                  : 'hover:translate-y-[-2px]'
                }
              `}
            >
              <div className="launch-sweep" aria-hidden="true"/>
              {loading ? (
                <>
                  <span className="launch-spinner" aria-hidden="true"/>
                  FOULE EN ACTION…
                </>
              ) : (
                <>
                  <Rocket size={20} className="group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform"/>
                   DÉPLOYER LA FOULE <ArrowUpRight size={16}/>
                </>
              )}
            </button>
            {loading && <div className="launch-status" role="status"><div className="launch-track"><span/></div><p>Création de la campagne. Le suivi s’ouvrira dès son enregistrement.</p></div>}
            {launchError && <div className="inline-error" role="alert">{launchError}</div>}
            <div className="mt-4 flex gap-3 items-start bg-slate-950/40 p-3 rounded border border-white/5">
                <Zap size={14} className="text-yellow-400 shrink-0 mt-0.5"/>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Vous lancez {totalAgents} agent{totalAgents > 1 ? 's' : ''} sur {profiles.length} persona{profiles.length > 1 ? 's' : ''}. L’audit est exécuté sur la cible indiquée.
                </p>
            </div>
          </div>

          {/* HISTORIQUE (Réintégré !) */}
          <div className="glass-panel history-panel reveal delay-3">
             <h3 className="text-xs font-bold text-slate-400 mb-6 font-space flex items-center gap-2 tracking-widest uppercase">
              <History size={16}/> Derniers Audits
            </h3>

            <div className="space-y-3">
              {historyLoading ? (
                <div className="history-skeleton" aria-label="Chargement de l’historique"><span/><span/><span/></div>
              ) : historyError ? (
                <div className="text-xs text-slate-400 text-center py-4">Historique indisponible pour le moment.</div>
              ) : recentTests.length === 0 ? (
                <div className="text-xs text-slate-400 text-center py-4">Aucun test récent. Votre premier audit apparaîtra ici.</div>
              ) : (
                recentTests.map((test) => (
                  <Link href={`/results/${test.id}`} key={test.id} className="block group">
                    <div className="bg-slate-950/50 p-3 rounded-lg border border-white/5 hover:border-cyan-500/30 hover:bg-cyan-950/10 transition-all flex justify-between items-center">
                      <div className="overflow-hidden">
                        <div className="text-xs font-bold text-slate-300 truncate group-hover:text-cyan-400 transition-colors w-40">
                          {test.url}
                        </div>
                        <div className="text-[10px] text-slate-600 font-mono mt-0.5">
                          {new Date(test.created_at).toLocaleDateString()} • {new Date(test.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          <span className="block mt-1">{statusLabel(test.status)}</span>
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-slate-600 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all"/>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

        </aside>
      </form>
    </div>
  );
}
