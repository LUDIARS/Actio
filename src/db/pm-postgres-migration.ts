import type postgres from "postgres";

/** PM schema creation is atomic and failure stops task-service startup. */
export async function migratePmPostgres(pool: postgres.Sql): Promise<void> {
  await pool.begin(async sql => {
    await sql.unsafe("SELECT pg_advisory_xact_lock(hashtextextended('actio-pm-schema', 0))");
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS pm_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        source_config JSONB NOT NULL DEFAULT '{}',
        sync_interval_minutes INTEGER NOT NULL DEFAULT 15,
        last_synced_at TEXT,
        owner_id TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_pm_projects_owner ON pm_projects(owner_id)`);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS pm_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        external_id TEXT NOT NULL,
        external_url TEXT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        priority TEXT NOT NULL DEFAULT 'medium',
        assignees JSONB NOT NULL DEFAULT '[]',
        labels JSONB NOT NULL DEFAULT '[]',
        due_date TEXT,
        milestone_external_id TEXT,
        milestone_name TEXT,
        estimated_hours REAL,
        blocked_by JSONB NOT NULL DEFAULT '[]',
        description_hash TEXT,
        dirty_flag INTEGER NOT NULL DEFAULT 0,
        local_updated_at TEXT,
        external_updated_at TEXT,
        last_synced_at TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_pm_tasks_project ON pm_tasks(project_id)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_pm_tasks_status ON pm_tasks(status)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_pm_tasks_due_date ON pm_tasks(due_date)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_pm_tasks_dirty ON pm_tasks(dirty_flag)`);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS pm_task_snapshots (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        change_type TEXT NOT NULL,
        changed_fields JSONB NOT NULL DEFAULT '{}',
        snapshot_data JSONB NOT NULL DEFAULT '{}',
        detected_at TEXT NOT NULL
      )
    `);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_pm_snapshots_task ON pm_task_snapshots(task_id)`);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS pm_milestones (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        due_date TEXT,
        state TEXT NOT NULL DEFAULT 'open',
        external_updated_at TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_pm_milestones_project ON pm_milestones(project_id)`);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS pm_task_validations (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        issues JSONB NOT NULL DEFAULT '[]',
        suggestions JSONB NOT NULL DEFAULT '[]',
        related_commits JSONB NOT NULL DEFAULT '[]',
        test_files JSONB NOT NULL DEFAULT '[]',
        validated_at TEXT NOT NULL
      )
    `);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_pm_validations_task ON pm_task_validations(task_id)`);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS pm_conflicts (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        local_version JSONB NOT NULL DEFAULT '{}',
        external_version JSONB NOT NULL DEFAULT '{}',
        base_version JSONB NOT NULL DEFAULT '{}',
        resolution TEXT NOT NULL DEFAULT 'manual',
        resolved_data JSONB,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at_text TEXT NOT NULL,
        resolved_at TEXT
      )
    `);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_pm_conflicts_project ON pm_conflicts(project_id)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_pm_conflicts_status ON pm_conflicts(status)`);
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS pm_analytics_cache (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        report_type TEXT NOT NULL,
        data JSONB NOT NULL DEFAULT '{}',
        generated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    `);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_pm_cache_project_type ON pm_analytics_cache(project_id, report_type)`);
  });
}
