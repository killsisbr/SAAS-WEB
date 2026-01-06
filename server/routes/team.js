// ============================================================
// Rotas de Equipe (Multi-User)
// ============================================================

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';

export default function (db) {
    const router = Router();

    // Todas as rotas requerem autenticacao
    router.use(authMiddleware(db), tenantMiddleware(db));

    // ========================================
    // GET /api/team - Listar membros da equipe
    // ========================================
    router.get('/', async (req, res) => {
        try {
            const members = await db.all(`
                SELECT tu.*, u.name, u.email, u.phone
                FROM tenant_users tu
                JOIN users u ON tu.user_id = u.id
                WHERE tu.tenant_id = ?
                ORDER BY tu.role, u.name
            `, [req.tenantId]);

            const invites = await db.all(`
                SELECT * FROM user_invites
                WHERE tenant_id = ? AND accepted_at IS NULL AND expires_at > CURRENT_TIMESTAMP
            `, [req.tenantId]);

            res.json({ members, invites });
        } catch (error) {
            console.error('Get team error:', error);
            res.status(500).json({ error: 'Erro ao buscar equipe' });
        }
    });

    // ========================================
    // POST /api/team/invite - Convidar membro
    // ========================================
    router.post('/invite', async (req, res) => {
        try {
            const { email, role } = req.body;

            if (!email || !role) {
                return res.status(400).json({ error: 'Email e funcao sao obrigatorios' });
            }

            if (!['MANAGER', 'STAFF'].includes(role)) {
                return res.status(400).json({ error: 'Funcao invalida' });
            }

            // Verificar se ja existe convite pendente
            const existingInvite = await db.get(`
                SELECT id FROM user_invites
                WHERE tenant_id = ? AND email = ? AND accepted_at IS NULL AND expires_at > CURRENT_TIMESTAMP
            `, [req.tenantId, email]);

            if (existingInvite) {
                return res.status(400).json({ error: 'Ja existe um convite pendente para este email' });
            }

            // Verificar se usuario ja faz parte
            const existingUser = await db.get(`
                SELECT u.id FROM users u
                JOIN tenant_users tu ON u.id = tu.user_id
                WHERE u.email = ? AND tu.tenant_id = ?
            `, [email, req.tenantId]);

            if (existingUser) {
                return res.status(400).json({ error: 'Usuario ja faz parte da equipe' });
            }

            // Criar convite
            const token = crypto.randomBytes(32).toString('hex');
            const id = uuidv4();
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 dias

            await db.run(`
                INSERT INTO user_invites (id, tenant_id, email, role, invited_by, token, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [id, req.tenantId, email, role, req.user.id, token, expiresAt]);

            // TODO: Enviar email com link de convite
            const inviteLink = `/invite/${token}`;

            res.status(201).json({
                success: true,
                inviteLink,
                expiresAt
            });
        } catch (error) {
            console.error('Invite team member error:', error);
            res.status(500).json({ error: 'Erro ao enviar convite' });
        }
    });

    // ========================================
    // POST /api/team/accept/:token - Aceitar convite (publico)
    // ========================================
    router.post('/accept/:token', async (req, res) => {
        try {
            const { name, password } = req.body;
            const { token } = req.params;

            // Buscar convite
            const invite = await db.get(`
                SELECT * FROM user_invites
                WHERE token = ? AND accepted_at IS NULL AND expires_at > CURRENT_TIMESTAMP
            `, [token]);

            if (!invite) {
                return res.status(404).json({ error: 'Convite invalido ou expirado' });
            }

            // Verificar se usuario ja existe
            let user = await db.get('SELECT * FROM users WHERE email = ?', [invite.email]);

            if (!user) {
                // Criar usuario
                if (!name || !password) {
                    return res.status(400).json({ error: 'Nome e senha sao obrigatorios' });
                }

                const userId = uuidv4();
                const passwordHash = await bcrypt.hash(password, 10);

                await db.run(`
                    INSERT INTO users (id, email, password_hash, name, role)
                    VALUES (?, ?, ?, ?, 'STAFF')
                `, [userId, invite.email, passwordHash, name]);

                user = { id: userId };
            }

            // Adicionar ao tenant
            await db.run(`
                INSERT INTO tenant_users (id, tenant_id, user_id, role)
                VALUES (?, ?, ?, ?)
            `, [uuidv4(), invite.tenant_id, user.id, invite.role]);

            // Marcar convite como aceito
            await db.run(
                'UPDATE user_invites SET accepted_at = CURRENT_TIMESTAMP WHERE id = ?',
                [invite.id]
            );

            res.json({ success: true, message: 'Convite aceito! Faca login para continuar.' });
        } catch (error) {
            console.error('Accept invite error:', error);
            res.status(500).json({ error: 'Erro ao aceitar convite' });
        }
    });

    // ========================================
    // PUT /api/team/:userId/role - Alterar funcao
    // ========================================
    router.put('/:userId/role', async (req, res) => {
        try {
            const { role } = req.body;

            if (!['MANAGER', 'STAFF'].includes(role)) {
                return res.status(400).json({ error: 'Funcao invalida' });
            }

            // Nao pode alterar o proprio cargo
            if (req.params.userId === req.user.id) {
                return res.status(400).json({ error: 'Voce nao pode alterar sua propria funcao' });
            }

            await db.run(`
                UPDATE tenant_users SET role = ?
                WHERE tenant_id = ? AND user_id = ?
            `, [role, req.tenantId, req.params.userId]);

            res.json({ success: true });
        } catch (error) {
            console.error('Update role error:', error);
            res.status(500).json({ error: 'Erro ao alterar funcao' });
        }
    });

    // ========================================
    // DELETE /api/team/:userId - Remover membro
    // ========================================
    router.delete('/:userId', async (req, res) => {
        try {
            // Nao pode remover a si mesmo
            if (req.params.userId === req.user.id) {
                return res.status(400).json({ error: 'Voce nao pode remover a si mesmo' });
            }

            // Verificar se e o owner
            const tenant = await db.get('SELECT owner_id FROM tenants WHERE id = ?', [req.tenantId]);
            if (req.params.userId === tenant.owner_id) {
                return res.status(400).json({ error: 'Nao e possivel remover o proprietario' });
            }

            await db.run(
                'DELETE FROM tenant_users WHERE tenant_id = ? AND user_id = ?',
                [req.tenantId, req.params.userId]
            );

            res.json({ success: true });
        } catch (error) {
            console.error('Remove team member error:', error);
            res.status(500).json({ error: 'Erro ao remover membro' });
        }
    });

    // ========================================
    // DELETE /api/team/invite/:id - Cancelar convite
    // ========================================
    router.delete('/invite/:id', async (req, res) => {
        try {
            await db.run(
                'DELETE FROM user_invites WHERE id = ? AND tenant_id = ?',
                [req.params.id, req.tenantId]
            );
            res.json({ success: true });
        } catch (error) {
            console.error('Delete invite error:', error);
            res.status(500).json({ error: 'Erro ao cancelar convite' });
        }
    });

    return router;
}
