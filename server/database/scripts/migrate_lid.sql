-- ============================================================
-- Migracao: Criar tabela lid_phone_mappings
-- Executa no servidor com: sqlite3 database/deliveryhub.sqlite < migrate_lid.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS lid_phone_mappings (
    id TEXT PRIMARY KEY,
    lid TEXT NOT NULL,
    phone TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lid, tenant_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lid_mappings ON lid_phone_mappings(lid, tenant_id);

-- Verificar se foi criada
SELECT 'Tabela lid_phone_mappings criada com sucesso!' as status;
