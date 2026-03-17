#!/bin/sh
set -e

echo "[entrypoint] DB_DIALECT=${DB_DIALECT:-sqlite}"

# PostgreSQL/MySQL の場合、起動前にスキーマを同期
if [ "$DB_DIALECT" = "postgres" ] || [ "$DB_DIALECT" = "mysql" ]; then
  echo "[entrypoint] drizzle-kit push でスキーマを同期中..."
  npx drizzle-kit push --force
  echo "[entrypoint] スキーマ同期完了"
fi

echo "[entrypoint] アプリケーション起動: $@"
exec "$@"
