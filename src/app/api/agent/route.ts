import { NextResponse } from 'next/server';
import { runCrowdCampaign } from '@/core/agent';

// On augmente le timeout max de Vercel/Next.js car le traitement de foule est long
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Le Frontend V3 envoie : { url, goal, profiles: [...] }
    const { url, profiles } = body;
    let { goal } = body;

    if (!url || !profiles || profiles.length === 0) {
      return NextResponse.json(
        { error: 'Données manquantes : URL et au moins un Profil requis.' },
        { status: 400 }
      );
    }

    if (!goal || goal.trim() === '') {
      goal = "Exploration critique : Trouvez les bugs et frictions.";
    }

    // Lancement du moteur de foule
    // Note : Dans un vrai SaaS, on utiliserait une Queue (Redis/BullMQ) ici.
    // Pour ce MVP, on attend la fin du traitement, mais on va optimiser le moteur.
    const result = await runCrowdCampaign(url, goal, profiles);

    return NextResponse.json(result);

  } catch (error: unknown) {
    console.error("🔥 API Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur interne serveur' },
      { status: 500 }
    );
  }
}
