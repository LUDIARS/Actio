# ─── Development (hot-reload with volume mounts) ─────────────
dev:
	docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up --build

dev-d:
	docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up --build -d

# ─── Production ───────────────────────────────────────────────
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
