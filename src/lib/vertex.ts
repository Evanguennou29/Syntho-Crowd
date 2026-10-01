import { GoogleGenerativeAI } from '@google/generative-ai';
import { ScAgentProfile, ActionLog } from '@/types/database';
import { z } from 'zod';

const modelId = 'gemini-2.5-flash';

// --- SCHÉMAS ---
const AgentActionSchema = z.object({
  action: z.enum(['click', 'type', 'scroll', 'wait', 'finish', 'fail']),
  selector: z.string().nullable().optional(),
  value: z.string().nullable().optional(),
  direction: z.enum(['up', 'down']).nullable().optional(),
  reasoning: z.string().optional().default("Action logique."),
});

export type AgentAction = z.infer<typeof AgentActionSchema>;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// --- NETTOYAGE JSON ROBUSTE ---
function cleanJson(text: string): string {
  // 1. Enlever les balises Markdown ```json ... ```
  let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();

  // 2. Trouver le premier { et le dernier }
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }

  // 3. Petite correction pour les virgules traînantes (fréquent avec les LLM)
  clean = clean.replace(/,(\s*})/g, '$1');

  return clean;
}

// --- CONFIGURATION DU MODÈLE ---
function getModel(maxTokens: number = 1000) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY manquante");

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: modelId,
    generationConfig: {
      responseMimeType: "application/json", // Force le mode JSON
      temperature: 0.7,
      maxOutputTokens: maxTokens, // Paramètre dynamique
    }
  });
}

// --- FONCTION 1 : NAVIGATION ---
export async function analyzeScreen(
  screenshotBase64: string,
  goal: string,
  profile: ScAgentProfile,
  previousLogs: string[] = []
): Promise<AgentAction> {

  const mission = goal && goal.trim().length > 5 ? goal : "Explore and test functionalities.";

  const systemPrompt = `
    ROLE: Automated UX Tester.
    MISSION: "${mission}"
    USER: ${profile.age}yo, Tech ${profile.tech_level}/10.
    HISTORY: ${previousLogs.slice(-2).join(' -> ')}

    INSTRUCTIONS:
    1. Analyze the UI screenshot.
    2. Decide the next logical action.
    3. IGNORE cookie banners (click accept if needed).
    4. IF STUCK: Scroll or click a menu. NEVER output "fail".

    OUTPUT JSON STRICTLY:
    {
      "action": "click"|"type"|"scroll"|"wait"|"finish",
      "selector": "css_selector" | null,
      "value": "text_input" | null,
      "direction": "down" | "up" | null,
      "reasoning": "Very short explanation (max 10 words)"
    }
  `;

  let attempts = 0;
  while (attempts < 3) {
    try {
      // On met 1000 tokens pour la nav (c'est large pour du JSON court)
      const model = getModel(1000);

      const result = await model.generateContent([
        systemPrompt,
        { inlineData: { data: screenshotBase64, mimeType: "image/jpeg" } },
      ]);

      const text = result.response.text();
      if (!text) throw new Error("Empty response");

      const jsonString = cleanJson(text);
      const jsonRaw = JSON.parse(jsonString);

      // Nettoyage des nulls
      if (jsonRaw.selector === null) delete jsonRaw.selector;
      if (jsonRaw.value === null) delete jsonRaw.value;
      if (jsonRaw.direction === null) delete jsonRaw.direction;

      const validated = AgentActionSchema.safeParse(jsonRaw);

      if (validated.success) return validated.data;

      console.warn("⚠️ JSON Invalide:", jsonRaw);
      throw new Error("Invalid Schema");

    } catch (e: unknown) {
      // console.warn(`⚠️ Retry Gemini (${attempts+1}):`, e.message);
      if (e instanceof Error && e.message.includes('429')) await delay(5000);
      else await delay(1000);
      attempts++;
    }
  }

  return { action: 'scroll', direction: 'down', reasoning: "Fallback (Error limit)" };
}

// --- FONCTION 2 : RAPPORT FINAL ---
export async function generateRunReport(goal: string, profile: ScAgentProfile, logs: ActionLog[]): Promise<string> {
  try {
    // 🔥 ICI C'EST IMPORTANT : On donne 8192 tokens pour que le rapport soit entier !
    const model = getModel(8192);

    const readableLogs = logs.map(l => `[Step ${l.step}] ${l.action} ${l.selector || ''} (${l.reasoning})`).join('\n');

    const prompt = `
      CONTEXT: You are a Senior UX Researcher analyzing a session log.
      MISSION: "${goal}"
      USER PROFILE: ${profile.age} years old, Tech Level ${profile.tech_level}/10.

      SESSION LOGS:
      ${readableLogs}

      TASK: Generate a detailed UX Report in valid JSON.

      OUTPUT FORMAT:
      {
        "ux_score": (0-100 score based on friction encountered),
        "summary": "A comprehensive summary of the session (3-4 sentences).",
        "frustrations": ["List specific pain points", "Navigation loops", "Errors"],
        "positive_points": ["What worked well", "Clear elements"],
        "improvements": ["Actionable advice 1", "Actionable advice 2"]
      }
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Nettoyage et Parsing
    const clean = cleanJson(text);
    const parsed = JSON.parse(clean);

    // Validation structurelle minimale
    const report = {
        ux_score: typeof parsed.ux_score === 'number' ? parsed.ux_score : 50,
        summary: parsed.summary || "Analyse terminée.",
        frustrations: Array.isArray(parsed.frustrations) ? parsed.frustrations : [],
        positive_points: Array.isArray(parsed.positive_points) ? parsed.positive_points : [],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements : []
    };

    return JSON.stringify(report);

  } catch (e: unknown) {
    console.error("🔥 Erreur Génération Rapport:", e);

    // Fallback propre pour ne pas casser le dashboard
    return JSON.stringify({
        ux_score: 40,
        summary: "L'analyse automatique a échoué (réponse IA incomplète ou invalide). Veuillez consulter la vidéo.",
        frustrations: ["Erreur technique IA"],
        positive_points: [],
        improvements: []
    });
  }
}
