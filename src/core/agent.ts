import { chromium, BrowserContext, Page } from 'playwright';
import { analyzeScreen, generateRunReport } from '@/lib/vertex';
import { supabase } from '@/lib/supabase';
import { ScAgentProfile, ActionLog } from '@/types/database';
import fs from 'fs';
import path from 'path';
import pLimit from 'p-limit';

// 🔒 SÉCURITÉ : 1 agent à la fois pour éviter les erreurs de quota API
const limit = pLimit(1);

export async function runCrowdCampaign(url: string, goal: string, profiles: ScAgentProfile[]) {
  const totalAgents = profiles.reduce((acc, p) => acc + p.multiplier, 0);
  console.log(`🚀 [ENGINE] Initialisation pour ${totalAgents} agents (Mode Séquentiel).`);

  const { data: test, error } = await supabase
    .from('sc_tests')
    .insert({ url, goal, status: 'running' })
    .select()
    .single();

  if (error || !test) throw new Error("Erreur DB Création Test");

  // --- PRÉPARATION ---
  const tasksQueue: { runId: string, profile: ScAgentProfile, index: number }[] = [];
  let globalIndex = 0;

  for (const profileConfig of profiles) {
    const profileData = { ...profileConfig };
    delete profileData.id;
    const { data: storedProfile } = await supabase
      .from('sc_agent_profiles')
      .insert({ ...profileData, test_id: test.id })
      .select().single();

    if (!storedProfile) continue;

    for (let i = 0; i < profileConfig.multiplier; i++) {
      globalIndex++;
      const { data: run } = await supabase
        .from('sc_test_runs')
        .insert({ test_id: test.id, profile_id: storedProfile.id, status: 'running' })
        .select().single();

      if (run) {
        tasksQueue.push({ runId: run.id, profile: storedProfile as ScAgentProfile, index: globalIndex });
      }
    }
  }

  // --- EXÉCUTION ---
  const executions = tasksQueue.map(task =>
    limit(() => runSingleAgent(test.id, task.runId, task.profile, url, goal, task.index, tasksQueue.length))
  );

  await Promise.all(executions);
  await supabase.from('sc_tests').update({ status: 'completed' }).eq('id', test.id);

  return { testId: test.id, totalRuns: tasksQueue.length };
}

async function runSingleAgent(
    testId: string, runId: string, profile: ScAgentProfile, url: string, goal: string, index: number, total: number
) {
  console.log(`🏎️ [AGENT ${index}/${total}] Démarrage navigateur...`);

  const browser = await chromium.launch({ headless: true });
  const videoDir = path.join(process.cwd(), 'temp_videos');
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir);

  let context: BrowserContext | null = null;
  let page: Page | null = null;
  const logs: ActionLog[] = [];
  const status: 'success' | 'failure' = 'success';

  try {
    context = await browser.newContext({
      viewport: profile.device_type === 'mobile' ? { width: 375, height: 667 } : { width: 1366, height: 768 },
      recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
    });

    page = await context.newPage();

    console.log(`🌐 [AGENT ${index}] Navigation vers ${url}...`);
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log(`✅ [AGENT ${index}] Page chargée.`);
    } catch {
        console.log(`⚠️ [AGENT ${index}] Timeout chargement (continuons quand même)`);
    }

    let step = 0;
    const MAX_STEPS = 40; // Limite raisonnable pour la démo

    while (step < MAX_STEPS) {
      step++;

      const screenshot = await page.screenshot({ type: 'jpeg', quality: 60 });
      const b64 = screenshot.toString('base64');

      // Appel IA
      const analysis = await analyzeScreen(b64, goal, profile, logs.map(l => l.reasoning));

      console.log(`⚡ [AGENT ${index}] Step ${step}: ${analysis.action} ${analysis.selector || ''} (${analysis.reasoning})`);

      logs.push({
        step,
        action: analysis.action,
        reasoning: analysis.reasoning,
        selector: analysis.selector || undefined,
        value: analysis.value || undefined,
        timestamp: new Date().toISOString()
      });

      if (analysis.action === 'finish') {
          console.log(`🏁 [AGENT ${index}] L'IA a décidé de finir.`);
          break;
      }

      // Exécution de l'action
      try {
        if (analysis.action === 'scroll') {
           // 🧠 INTELLIGENCE SCROLL : On détecte si l'IA veut remonter
           const reason = analysis.reasoning.toLowerCase();
           const intentUp = analysis.direction === 'up'
                            || reason.includes('top')
                            || reason.includes('haut')
                            || reason.includes('back')
                            || reason.includes('return');

           const delta = intentUp ? -800 : 800;

           if (intentUp) console.log(`   ⬆️ SCROLL UP détecté via raisonnement.`);

           await page.mouse.wheel(0, delta);
           await page.waitForTimeout(500);
        }
        else if (analysis.action === 'wait' || analysis.action === 'fail') {
           await page.waitForTimeout(1000);
        }
        else if (analysis.selector) {
           let sel = analysis.selector;
           if (sel.startsWith('aria/')) sel = `text=${sel.replace('aria/', '')}`;
           sel = sel.replace(':contains(', ':has-text(');

           const locator = page.locator(sel).first();
           if (await locator.isVisible({ timeout: 2000 })) {
                // Highlight visuel
                await locator.evaluate((el) => el.style.border = '4px solid #00f3ff');
                await page.waitForTimeout(200);

                if (analysis.action === 'click') {
                    await locator.click({ timeout: 3000, force: true });
                }
                else if (analysis.action === 'type' && analysis.value) {
                    await locator.fill(analysis.value, { timeout: 3000 });
                    await page.keyboard.press('Enter');
                }
                await locator.evaluate((el) => el.style.border = '');
           } else {
               console.log(`   ⚠️ Element invisible: ${sel} -> Scroll de secours.`);
               await page.mouse.wheel(0, 300);
           }
        }
      } catch {
         // Erreur action ignorée pour continuer la boucle
      }
    }

    console.log(`💾 [AGENT ${index}] Sauvegarde de la vidéo...`);
    await context.close();

    // UPLOAD VIDÉO
    let publicVideoUrl = null;
    const videoPath = await page.video()?.path();

    if (videoPath && fs.existsSync(videoPath)) {
      const fileName = `${testId}/${runId}.webm`;
      const fileBuffer = fs.readFileSync(videoPath);

       const { error: uploadError } = await supabase.storage
        .from('test-videos')
        .upload(fileName, fileBuffer, { contentType: 'video/webm', upsert: true });

      if (!uploadError) {
          const { data: pubData } = supabase.storage.from('test-videos').getPublicUrl(fileName);
          publicVideoUrl = pubData.publicUrl;
          console.log(`🎥 [AGENT ${index}] Vidéo uploadée.`);
      }
      fs.unlinkSync(videoPath);
    }

    // RAPPORT FINAL
    console.log(`📝 [AGENT ${index}] Génération du rapport...`);
    const aiReport = await generateRunReport(goal, profile, logs);

    await supabase.from('sc_test_runs').update({
      status,
      video_url: publicVideoUrl || undefined,
      ai_report: aiReport,
      action_logs: logs
    }).eq('id', runId);

    console.log(`✅ [AGENT ${index}] SESSION TERMINÉE.`);

  } catch (err) {
    console.error(`🔥 CRASH FATAL Agent ${index}`, err);
    await supabase.from('sc_test_runs').update({ status: 'failure' }).eq('id', runId);
  } finally {
    if (browser) await browser.close();
  }
}
