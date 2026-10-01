# SynthoCrowd

SynthoCrowd est un outil de test UX assisté par agents. Le Builder définit une mission et des personas ; le moteur parcourt le site cible avec Playwright et Gemini ; les résultats regroupent les sessions, leurs constats, les vidéos disponibles et un export PDF.

Le dépôt contient également une **présentation interactive statique** dans [`docs/`](docs/). Elle fonctionne sans compte, sans clé API et sans lancer d’agents. Les profils et la capture de résultats présentés sont des exemples ; la vidéo se termine par un rapport fictif.

## Deux usages

| Dossier | Usage | Dépendances à l’exécution |
| --- | --- | --- |
| `src/` | Application Next.js : Builder, API, résultats | Supabase, Gemini, navigateur Playwright |
| `docs/` | Présentation web autonome | Aucune API ; HTML, CSS, JavaScript et médias locaux |

## Voir la présentation

Ouvrez [`docs/index.html`](docs/index.html) dans un navigateur, ou servez le dossier localement :

```powershell
python -m http.server 4173 --directory docs
```

Puis ouvrez `http://localhost:4173/`. La présentation s’ouvre sur le seul nom SynthoCrowd, puis explique son fonctionnement général : mission, profils, parcours et résultats. Les sélections de profils, l’exploration des étapes et le tracé des parcours sont interactifs et fonctionnent uniquement côté navigateur ; ils n’appellent pas `/api/agent`. Une capture de l’interface réelle et une vidéo complètent la présentation.

Pour publier **seulement la présentation** avec GitHub Pages, pousser `docs/` sur `main`, puis sélectionner **Settings → Pages → Deploy from a branch → main → /docs** dans le dépôt GitHub. L’URL prendra normalement la forme `https://evanguennou29.github.io/Syntho-Crowd/` une fois Pages activé. La présence des fichiers dans GitHub ne rend pas cette URL active à elle seule.

## Lancer l’application

Prérequis : Node.js compatible avec Next.js 16, un projet Supabase préparé pour l’application, une clé Gemini et Chromium pour Playwright.

```powershell
npm ci
npx playwright install chromium
```

Créer un fichier `.env.local` à la racine :

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre-cle-publique
GEMINI_API_KEY=votre-cle-serveur
```

Ne pas commiter `.env.local` ; il est ignoré par Git. La clé Gemini reste réservée au serveur. Les variables `NEXT_PUBLIC_` sont exposées au navigateur par Next.js.

```powershell
npm run dev
```

Ouvrir `http://localhost:3000/`. Le Builder envoie la mission et les profils à `POST /api/agent`. Le moteur écrit dans les tables `sc_tests`, `sc_agent_profiles` et `sc_test_runs`, et envoie les enregistrements disponibles dans le bucket Supabase Storage `test-videos`. La page `/results/[id]` lit ces données et permet l’export PDF. Les tables, les politiques d’accès et le bucket doivent être configurés dans votre projet Supabase : ce dépôt ne contient pas encore de migration SQL.

## Vérifications

```powershell
npm run lint
npm run build
```

La présentation statique peut être vérifiée indépendamment des services externes. Pour un test complet de l’application, il faut des clés valides et un site cible autorisant la navigation automatisée.

## Structure utile

```text
docs/                     Présentation statique publiable séparément
src/app/page.tsx          Builder
src/app/results/[id]/     Résultats et export PDF
src/app/api/agent/        Endpoint de lancement
src/core/agent.ts         Navigation et capture Playwright
src/lib/vertex.ts         Analyse Gemini
src/lib/supabase.ts       Client Supabase
```

## Publication

Publier `docs/` ne déploie **pas** l’application Next.js ni `/api/agent`. L’application complète requiert un hébergement Node compatible, les variables d’environnement et l’accès aux services externes. Choisir cet hébergement et le domaine avant de la déployer.
