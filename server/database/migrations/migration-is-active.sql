-- Migration: Adicionar coluna is_active na tabela tenants
-- Resolve o erro "no such column: is_active" na VPS

ALTER TABLE tenants ADD COLUMN is_active INTEGER DEFAULT 1;

-- Opcional: Se outras tabelas estiverem falhando, aqui estão os comandos 
-- (Mas pelo schema elas já deveriam ter, verifique se seu banco local/vps está defasado)
-- ALTER TABLE products ADD COLUMN is_active INTEGER DEFAULT 1; 
