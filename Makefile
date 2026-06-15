.PHONY: up down migrate seed test-backend test-frontend lint build logs shell-backend shell-db

# ─── Environment ──────────────────────────────────────────────────────────────
COMPOSE = docker compose
BACKEND = $(COMPOSE) exec backend
DB      = $(COMPOSE) exec postgres

# ─── Infrastructure ───────────────────────────────────────────────────────────
up:
	$(COMPOSE) up -d --build
	@echo "Services started. Frontend: http://localhost:3000 | API: http://localhost:8000 | Flower: http://localhost:5555"

down:
	$(COMPOSE) down

down-volumes:
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f

logs-backend:
	$(COMPOSE) logs -f backend celery_worker

# ─── Database ─────────────────────────────────────────────────────────────────
migrate:
	$(BACKEND) alembic upgrade head

migrate-down:
	$(BACKEND) alembic downgrade -1

migrate-history:
	$(BACKEND) alembic history

seed:
	$(BACKEND) python scripts/seed_person_master.py

# ─── Testing ──────────────────────────────────────────────────────────────────
test-backend:
	$(BACKEND) pytest tests/ -v --cov=app --cov-report=term-missing

test-queue:
	$(BACKEND) python scripts/test_queue.py

test-e2e:
	bash scripts/e2e_test.sh

test-frontend:
	$(COMPOSE) exec frontend npm run test

# ─── Linting ──────────────────────────────────────────────────────────────────
lint:
	$(BACKEND) ruff check app/ && $(BACKEND) mypy app/
	$(COMPOSE) exec frontend npm run lint

lint-fix:
	$(BACKEND) ruff check --fix app/

# ─── Utility ──────────────────────────────────────────────────────────────────
shell-backend:
	$(BACKEND) bash

shell-db:
	$(DB) psql -U ndtv -d ndtv_dam

import-persons:
	$(BACKEND) python scripts/import_person_master.py $(FILE)

build:
	$(COMPOSE) build --no-cache
