# ─── Development (hot-reload with volume mounts) ─────────────
# Override ports: make dev FRONTEND_PORT=9090 BACKEND_PORT=4000 DB_PORT=15432
dev:
	docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up --build

dev-d:
	docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up --build -d

# ─── Production ───────────────────────────────────────────────
# Override ports: make prod FRONTEND_PORT=9090 BACKEND_PORT=4000 DB_PORT=15432
prod:
	docker compose up --build

prod-d:
	docker compose up --build -d

# ─── Utilities ────────────────────────────────────────────────
down:
	docker compose down

logs:
	docker compose logs -f

clean:
	docker compose down -v
