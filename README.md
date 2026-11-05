# SynthoCrowd V2

Tests UX par personas synthétiques : **Next.js + FastAPI + CrewAI + Playwright**, avec
workers Celery, Redis et déploiement Docker Compose. Le Builder lance une campagne,
le suivi affiche les sessions au fil de leur exécution, puis les vidéos, traces,
rapports individuels et la synthèse de campagne deviennent consultables.

Les observations d’agents sont des simulations ; elles complètent les tests avec
des utilisateurs réels. Le score UX est une estimation du modèle.

## Architecture

```text
Navigateur → Next.js → FastAPI → PostgreSQL Supabase
                          ↓
                        Redis → workers Celery → CrewAI → Playwright + Gemini
                                                   ↓
                                       Supabase Storage (bucket privé)
```

- **frontend** : Builder, historique V2, progression, annulation, résultats et PDF.
- **api** : validation Pydantic, campagnes, sessions et accès temporaire aux médias.
- **worker** : un navigateur isolé par session, un testeur persona et un analyste UX.
- **scheduler** : Celery Beat déclenche la distribution des tâches et la récupération.
- **redis** : broker persistant. Les résultats durables sont dans PostgreSQL.
- **migrate** : migrations SQL versionnées, exécutées avant l’API et les workers.

L’application est conteneurisée ; **Supabase et Gemini restent des dépendances
externes**. Aucun hébergement n’est créé par ces fichiers.

## Démarrage avec Docker

Prérequis : Docker Engine avec Compose v2 et conteneurs Linux, un projet Supabase,
une clé Gemini et un modèle disponible pour cette clé. Le worker Chromium requiert
un hôte autorisant les espaces de noms utilisateur Linux.

1. Copier `.env.example` vers `.env` à la racine :

   ```powershell
   Copy-Item .env.example .env
   ```

2. Renseigner les valeurs suivantes :

   | Variable | Configuration |
   | --- | --- |
   | `DATABASE_URL` | Connexion PostgreSQL Supabase, préfixe `postgresql+psycopg://`, TLS activé |
   | `SUPABASE_URL` | URL du projet Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | Clé serveur pour l’accès au stockage |
   | `GEMINI_API_KEY` | Clé du fournisseur de modèles |
   | `API_TOKEN` | Secret aléatoire d’au moins 32 caractères |
   | `APP_PASSWORD` | Mot de passe d’accès à l’application, au moins 16 caractères |

   Utiliser la connexion directe ou le **session pooler** Supabase, et encoder les
   caractères spéciaux du mot de passe PostgreSQL dans l’URL. Le compte de migration
   doit pouvoir créer le schéma `syntho` et ses tables. Éviter le transaction pooler
   pour cette configuration. Ne jamais commiter `.env`.

3. Créer dans Supabase Storage un bucket **privé** nommé `sc-artifacts-v2`, ou
   adapter `STORAGE_BUCKET`. Autoriser les types `video/webm`, `image/jpeg` et
   `application/zip`, avec une limite de fichier adaptée aux vidéos des sessions.
   Aucune politique de lecture publique n’est nécessaire : seul le backend signe
   les liens. Le navigateur ne reçoit aucune clé Supabase.

4. Lancer depuis la racine :

   ```bash
   docker compose up -d --build
   docker compose ps
   docker compose logs -f worker scheduler
   ```

5. Ouvrir `http://localhost:3000`, avec l’identifiant `admin` (ou `APP_USERNAME`) et
   `APP_PASSWORD`. Créer une mission sur un site autorisant les tests automatisés.
   L’interface ouvre le suivi dès la réponse `202`, sans attendre la campagne.

L’interface écoute par défaut sur **127.0.0.1**, et ni Redis ni l’API ne publient de
port sur l’hôte. Pour un serveur distant, placer un reverse proxy HTTPS devant ce
port. Cette version utilise un compte partagé, sans gestion de tenants, de comptes
individuels ou de facturation. L’authentification HTTP Basic doit passer par HTTPS
hors du poste local. Il n’y a aucune clé à fournir lors du build du frontend.

## Exécution, reprise et limites

- Une campagne crée transactionnellement ses profils et sessions dans PostgreSQL.
  Les lignes `queued` constituent une outbox durable. Une indisponibilité de Redis
  après l’enregistrement n’efface donc pas la campagne.
- Chaque session est revendiquée sous verrou PostgreSQL. Les livraisons dupliquées
  ne peuvent pas démarrer deux navigateurs pour la même tentative active.
- Le scheduler fonctionne toutes les 15 secondes **quand un worker est disponible**.
  Une publication échouée est retentée. Les publications sans confirmation de
  démarrage sont réémises après 30 minutes, notamment après une perte du broker.
- Le worker possède une limite dure de 15 minutes. Une session sans heartbeat depuis
  20 minutes est récupérable, avec au maximum trois tentatives. Le parcours reprend
  **depuis le début**, avec un nouveau navigateur : ne pas utiliser de scénario
  comportant des actions externes irréversibles. La V2 ne promet pas une exécution
  exactement une fois des actions sur le site cible.
- L’annulation marque immédiatement les sessions en attente comme annulées. Les
  navigateurs actifs s’arrêtent au prochain contrôle, entre les outils/appels IA ;
  l’arrêt n’est pas instantané pendant un appel réseau en cours.
- Le statut technique (`success`/`failure`) est séparé de l’objectif de mission
  (`achieved`/`blocked`/`incomplete`). Une campagne peut être `partial`.
- Le testeur reçoit le DOM, des identifiants d’éléments réellement observés et une
  observation visuelle Gemini. Les actions et leurs erreurs sont enregistrées ; les
  valeurs saisies ne sont pas copiées dans les logs d’actions.
- Les sorties des tâches sont validées avec Pydantic. Un rapport invalide ne devient
  pas un rapport de remplacement avec un score inventé. Une erreur de synthèse ne
  masque pas les rapports individuels.
- Les vidéos, captures et traces sont privées. Les liens signés expirent après une
  heure. Une erreur d’upload est affichée sans effacer un rapport UX déjà calculé.

Commencer avec **un worker et une concurrence de 1**. `MAX_RPM` est une limite par
agent ; les appels de vision s’ajoutent aux appels CrewAI, et les quotas sont partagés
entre tous les workers. Mesurer mémoire et quotas avant d’augmenter la concurrence :

```bash
docker compose up -d --scale worker=2
```

`MAX_CAMPAIGN_RUNS` vaut 100 par défaut. `MAX_STEPS`, `SESSION_TIMEOUT` et `LLM_MODEL`
sont configurables. Vérifier la disponibilité et le cycle de vie du modèle choisi.
Les clés, le schéma métier et le stockage sont côté serveur.

Les URL initiales et requêtes navigateur refusent les adresses privées/locales,
les ports non standards et les identifiants dans les URL. `TARGET_ALLOWED_HOSTS`
permet une liste exacte de domaines, incluant les redirections et CDN nécessaires.
Les WebSockets et service workers sont bloqués. Ces vérifications applicatives ne
remplacent pas une isolation réseau avec filtrage de sortie : pour des cibles non
fiables, utiliser un réseau de workers dédié sans accès aux réseaux internes ni aux
endpoints de métadonnées, afin de couvrir aussi le DNS rebinding. Chromium tourne
sans privilèges et avec son sandbox ; voir [`docker/README.md`](docker/README.md).
Les captures, traces et contenus de page peuvent contenir des données personnelles
et sont transmis au modèle pour analyse : employer des comptes et données de test.

## API et développement

Les routes FastAPI demandent `Authorization: Bearer <API_TOKEN>`. L’interface utilise
un proxy serveur de même origine qui conserve ce secret côté serveur.

| Route | Fonction |
| --- | --- |
| `POST /api/v1/campaigns` | Créer et planifier, réponse `202` |
| `GET /api/v1/campaigns?limit=5` | Historique |
| `GET /api/v1/campaigns/{id}` | Statuts, compteurs et synthèse |
| `GET /api/v1/campaigns/{id}/runs` | Sessions, résultats et erreurs |
| `POST /api/v1/campaigns/{id}/cancel` | Annulation idempotente |
| `GET /api/v1/campaigns/{id}/runs/{run}/artifacts/{kind}` | Lien signé vidéo, capture ou trace |
| `GET /health/live`, `GET /health/ready` | Santé et disponibilité DB/Redis |

Le schéma OpenAPI est disponible sur le réseau interne à `/docs`. Les URL de vidéos
renvoyées dans les sessions ciblent le proxy de l’interface ; les clients API directs
peuvent utiliser la route d’artefact pour obtenir leur lien signé.

Les dépendances Python sont verrouillées dans `backend/uv.lock`. Depuis la racine,
avec Python 3.12 et uv :

```bash
uv sync --project backend --locked --extra dev --extra worker
uv run --project backend --extra dev --extra worker ruff check backend/app backend/tests
uv run --project backend --extra dev --extra worker pytest backend/tests -q
uv run --project backend --extra worker uvicorn app.main:app --reload
```

Pour démarrer les processus hors Docker, renseigner aussi `REDIS_URL` et
`ARTIFACT_DIR` dans l’environnement et lancer les migrations depuis la racine :
`uv run --project backend python -m app.migrate`. Les workers Celery de production
sont destinés à Linux ; Docker est le chemin recommandé sous Windows.

```bash
cd frontend
npm ci
npm run lint
npm run build
```

Les tests ordinaires utilisent SQLite pour les transitions et l’API, sans clé IA.
`RUN_BROWSER_TESTS=1` active un test Playwright sur un site local, avec la vision
remplacée par une réponse de test. Installer Chromium auparavant. Le test PostgreSQL
utilise `TEST_DATABASE_URL` vers une **base de test vierge et jetable** : il crée le
schéma `syntho` et refuse de toucher un schéma existant. La CI vérifie aussi la
migration, les revendications concurrentes et la construction/démarrage des images.
Les appels réels Gemini et Supabase nécessitent des clés valides et un test séparé.

## Migration depuis la V1 et présentation

Le frontend a été déplacé de la racine vers `frontend/`. Le moteur TypeScript et
`/api/agent` ont été remplacés par le backend Python. Les anciennes tables
`public.sc_tests`, `public.sc_agent_profiles` et `public.sc_test_runs` restent intactes.
La V2 écrit dans son propre schéma `syntho` ; l’historique V1 n’est pas importé
automatiquement et reste consultable via la V1/Supabase. Sauvegarder les données
avant tout déploiement. Un retour au code V1 ne demande pas d’effacer le schéma V2.

`docs/` reste la présentation statique autonome, sans exécution d’agents :

```powershell
python -m http.server 4173 --directory docs
```

Publier `docs/` sur GitHub Pages publie la présentation uniquement. L’application V2
requiert les conteneurs et services décrits ci-dessus.
