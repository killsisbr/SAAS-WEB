-- Migração: Criar tabela pid_jid_mappings
-- Para mapear PID do WhatsApp para JID que funciona para responder

CREATE TABLE IF NOT EXISTS pid_jid_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    pid TEXT NOT NULL,
    jid TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, pid)
);

CREATE INDEX IF NOT EXISTS idx_pid_jid_mappings ON pid_jid_mappings(tenant_id, pid);

SELECT 'Tabela pid_jid_mappings criada com sucesso!' as status;
