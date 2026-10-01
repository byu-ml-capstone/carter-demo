# My Workspace

A single-page sprint workspace for a small classmate team. The board, backlog, and sprint history live in one app so the team can plan, run, and close a sprint without switching tools.

The API is a FastAPI service in `backend/`. The UI is a React app in `frontend/`. SQLite is the database (`DATABASE_URL`, default `sqlite:///./data/workspace.db` locally and `sqlite:////data/workspace.db` in Compose). Workspace routes require `Authorization: Bearer <token>` from `POST /auth/register` or `POST /auth/login`. `GET /health` and `GET /version` are public.

Sprint report drafts call `sprint_report.draft_report`. That package is owned by the data scientist. Faculty notes are an optional string on sprint close; an empty value becomes `No faculty notes recorded` in the draft, and a non-empty value is kept as entered.

The product spec is [`product_specification.md`](product_specification.md). [`ProductManagementTool.md`](ProductManagementTool.md) records the GitHub Projects and Jira research behind the MVP.

## Layout

```
├── docker-compose.yaml           # production compose (Coolify reads this)
├── docker-compose.override.yml   # local-dev only (host port 8000); ignored by Coolify
├── smoke-test.sh                 # docker compose up + smoke-test; also `./smoke-test.sh URL`
├── README.md
├── ProductManagementTool.md
├── product_specification.md
├── .github/workflows/ci.yml      # test → deploy-staging → deploy-prod
│
├── backend/                        # API — Traefik-routed on port 8000
│   ├── main.py                   # FastAPI app and routes
│   ├── auth.py                   # password hashing and bearer tokens
│   ├── dao.py                    # SQL and the migration runner
│   ├── db.py
│   ├── domain.py                 # status, priority, type, and report rules
│   ├── migrations/001_workspace.sql
│   ├── sprint_report/            # draft_report for sprint close
│   ├── requirements.txt
│   ├── Dockerfile
│   └── tests/test_api.py
│
├── frontend/                     # React + TypeScript + Vite, dev server on port 43123
│   └── src/                      # sign-in, project list, board, ticket modal, sprint report
│
└── terraform/                    # Coolify project, environments, apps, GitHub secrets
```

Compose runs one public service, `backend`, and stores the SQLite file on the `workspace-data` volume. Staging and production each get their own volume. `docker compose down` keeps the data; `docker compose down -v` deletes it.

Coolify's Traefik routes to the container. The compose file references `${SERVICE_FQDN_BACKEND}` so Coolify generates the domain. Locally, `docker-compose.override.yml` publishes port 8000. The API allows the UI origin `http://localhost:43123` through `CORS_ORIGINS`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file. Compose sets `sqlite:////data/workspace.db`. |
| `APP_URL` | `${SERVICE_FQDN_BACKEND}` — the reference that triggers Coolify routing |
| `CORS_ORIGINS` | Browser origins allowed to call the API. Default `http://localhost:43123` |

## Run locally

API:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

UI (talks to `http://127.0.0.1:8000` unless `VITE_API_ORIGIN` is set):

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:43123`. Sign up, create a project, and use the board.

With Docker, from the repo root:

```bash
./smoke-test.sh
```

That builds the API, waits for `/health` on `http://localhost:8000`, registers a user, and creates a project. `./smoke-test.sh http://<your-app>.ml-capstone.cs.byu.edu` runs the same checks against a deploy.

## API

Base URL locally is `http://localhost:8000`. Send `Authorization: Bearer <token>` on every route except `/health`, `/version`, `/auth/register`, and `/auth/login`.

```bash
BASE=http://localhost:8000

curl -s $BASE/health
# {"ok":true,"version":"0.2.0"}

TOKEN=$(curl -s -X POST $BASE/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"password1"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')

curl -s -X POST $BASE/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Capstone"}'
```

| Area | Routes |
|---|---|
| Public | `GET /health`, `GET /version` |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Projects | `POST /projects`, `GET /projects`, `GET /projects/{id}` |
| Stories | `GET/POST /projects/{id}/stories`, `PATCH /stories/{id}` |
| Sprints | `GET/POST /projects/{id}/sprints`, `GET /sprints/{id}`, `POST /sprints/{id}/activate`, `POST /sprints/{id}/close` |
| Reports | `POST /sprints/{id}/report/draft`, `PUT /sprints/{id}/report`, `GET /sprints/{id}/report` |
| Members | `GET/POST /projects/{id}/members` |
| Comments | `GET/POST /stories/{id}/comments`, `GET/POST /sprints/{id}/comments` |

Story status is `Backlog`, `Selected for Sprint`, `In Progress`, or `Done`. Priority is `Low`, `Medium`, or `High`. Type is `Feature`, `Bug`, or `Chore`. A project has at most one sprint in `Planned` or `Active`. Closing a sprint stores a snapshot of its stories and the faculty notes used by the report draft.

Coolify polls `GET /health` after a deploy. Bump `APP_VERSION` in `backend/main.py` so a curl of `/health` shows the new build.

## Tests

```bash
cd backend
pip install -r requirements.txt httpx pytest
pytest tests/ -v
```

GitHub Actions runs that job on pushes and pull requests to `main` and `staging`, then fires the Coolify webhook for the matching branch.

## Deploy

1. Fork or copy this directory into your team's GitHub repo.
2. Follow **`student-guide.md` → Part B → Setup** (in the top-level of `ml-capstone-platform`) to create the Coolify Applications and GitHub secrets.
3. Push to `staging` → tests run → Coolify deploys to `http://<your-repo>-staging.ml-capstone.cs.byu.edu`.
4. Merge `staging` into `main` → the same flow deploys to `http://<your-repo>.ml-capstone.cs.byu.edu`.

Student apps are served over `http://`. The CS wildcard certificate covers one level under `cs.byu.edu`, and these hostnames are two levels deep, so an `https://` request gets `503 no available server`. Traffic is encrypted at the VPN layer. The hostname comes from the repository name.

## Provisioning with Terraform

`terraform/` creates the Coolify Project, both Environments, both Applications (auto-deploy off; GitHub Actions drives deploys), and the three GitHub Actions secrets.

### What you need first

1. **Terraform 1.5+** — `brew install hashicorp/tap/terraform`, `winget install -e --id Hashicorp.Terraform`, or [the Linux packages](https://developer.terraform.io/terraform/install).
2. **A Coolify API token.** Switch to your own team in Coolify's team switcher first — the token is scoped to the active team. Then Coolify wordmark → **Keys & Tokens → API Tokens → + New Token**, permissions **`write`** and **`deploy`**. Copy it immediately; it is shown once.
3. **A GitHub token** with `repo` scope — `gh auth token` if you have the GitHub CLI.
4. **Your Coolify server UUID.** Every team has its own server record, all named `ml-capstone`, each with a different UUID:

   ```bash
   curl -H "Authorization: Bearer <your-coolify-token>" \
     https://ml-capstone-admin.cs.byu.edu/api/v1/servers
   ```

   Exactly one comes back. Copy its `uuid`.

### Run it

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars

terraform init
terraform plan
terraform apply
```

`plan` should end with **`Plan: 7 to add, 0 to change, 0 to destroy`**. The outputs print both URLs and the Application UUIDs.

### The one manual step

Coolify's API will not accept per-service domains on a Docker Compose application. For each of the two Applications: **Access → gear icon on "1 configured domain"** (or the **Domains** tab) → under service `backend`, set `http://<your-repo>-staging.ml-capstone.cs.byu.edu` (or the production equivalent) → **Save**. Delete the auto-generated `sslip.io` placeholder and the `www.` variant.

Do this before the first deploy. Traefik bakes routing labels into a container when it starts, so a domain added afterwards returns `404 page not found` until you hit **Redeploy**.

`terraform.tfvars` holds two live credentials and is gitignored. `terraform destroy` removes the Project, both Applications, and the three GitHub secrets. The repo is untouched. See [`terraform/README.md`](terraform/README.md) for the longer walkthrough.
