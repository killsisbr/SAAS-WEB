// ============================================================
// Rotas de Custom Domains
// ============================================================

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import dns from 'dns';
import { promisify } from 'util';

const resolveCname = promisify(dns.resolveCname);

export default function (db) {
    const router = Router();

    // ========================================
    // GET /api/domains - Listar dominios
    // ========================================
    router.get('/', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const domains = await db.all(
                'SELECT * FROM custom_domains WHERE tenant_id = ? ORDER BY created_at DESC',
                [req.tenantId]
            );
            res.json(domains);
        } catch (error) {
            console.error('Get domains error:', error);
            res.status(500).json({ error: 'Erro ao buscar dominios' });
        }
    });

    // ========================================
    // POST /api/domains - Adicionar dominio
    // ========================================
    router.post('/', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const { domain } = req.body;

            if (!domain) {
                return res.status(400).json({ error: 'Dominio e obrigatorio' });
            }

            // Validar formato do dominio
            const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
            if (!domainRegex.test(domain)) {
                return res.status(400).json({ error: 'Formato de dominio invalido' });
            }

            // Verificar se ja existe
            const existing = await db.get(
                'SELECT id FROM custom_domains WHERE domain = ?',
                [domain]
            );

            if (existing) {
                return res.status(400).json({ error: 'Dominio ja esta em uso' });
            }

            const id = uuidv4();
            await db.run(
                'INSERT INTO custom_domains (id, tenant_id, domain, verified, ssl_status) VALUES (?, ?, ?, 0, ?)',
                [id, req.tenantId, domain, 'pending']
            );

            res.status(201).json({
                success: true,
                id,
                domain,
                verified: false,
                ssl_status: 'pending',
                cname_target: 'app.killsis.com' // O CNAME que o usuario deve apontar
            });
        } catch (error) {
            console.error('Add domain error:', error);
            res.status(500).json({ error: 'Erro ao adicionar dominio' });
        }
    });

    // ========================================
    // POST /api/domains/:id/verify - Verificar DNS
    // ========================================
    router.post('/:id/verify', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const domainEntry = await db.get(
                'SELECT * FROM custom_domains WHERE id = ? AND tenant_id = ?',
                [req.params.id, req.tenantId]
            );

            if (!domainEntry) {
                return res.status(404).json({ error: 'Dominio nao encontrado' });
            }

            // Verificar CNAME
            let verified = false;
            try {
                const records = await resolveCname(domainEntry.domain);
                // Verificar se aponta para nosso dominio
                if (records.some(r => r.includes('killsis') || r.includes('localhost'))) {
                    verified = true;
                }
            } catch (dnsError) {
                // CNAME nao encontrado ou erro de DNS
                console.log('DNS check failed:', dnsError.code);
            }

            if (verified) {
                await db.run(
                    'UPDATE custom_domains SET verified = 1, ssl_status = ? WHERE id = ?',
                    ['active', req.params.id]
                );

                // Auto-config Nginx em producao
                if (process.env.NODE_ENV === 'production') {
                    try {
                        const { exec } = await import('child_process');
                        const tenant = await db.get('SELECT slug FROM tenants WHERE id = ?', [req.tenantId]);
                        const configScript = '/var/www/deliveryhub/nginx-domain-config.sh';

                        exec(`sudo ${configScript} ${domainEntry.domain} ${tenant.slug}`, (error, stdout, stderr) => {
                            if (error) {
                                console.error('Nginx config error:', error);
                            } else {
                                console.log('Nginx config success:', stdout);
                            }
                        });
                    } catch (execError) {
                        console.error('Failed to auto-config Nginx:', execError);
                    }
                }

                res.json({ success: true, verified: true, ssl_status: 'active' });
            } else {
                res.json({
                    success: false,
                    verified: false,
                    message: 'CNAME nao encontrado. Configure o DNS para apontar para app.killsis.com'
                });
            }
        } catch (error) {
            console.error('Verify domain error:', error);
            res.status(500).json({ error: 'Erro ao verificar dominio' });
        }
    });

    // ========================================
    // DELETE /api/domains/:id - Remover dominio
    // ========================================
    router.delete('/:id', authMiddleware(db), tenantMiddleware(db), async (req, res) => {
        try {
            const result = await db.run(
                'DELETE FROM custom_domains WHERE id = ? AND tenant_id = ?',
                [req.params.id, req.tenantId]
            );

            if (result.changes === 0) {
                return res.status(404).json({ error: 'Dominio nao encontrado' });
            }

            res.json({ success: true, message: 'Dominio removido' });
        } catch (error) {
            console.error('Remove domain error:', error);
            res.status(500).json({ error: 'Erro ao remover dominio' });
        }
    });

    return router;
}
