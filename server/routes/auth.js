// ============================================================
// Rotas de Autenticacao
// ============================================================

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { generateToken, authMiddleware } from '../middleware/auth.js';

export default function (db) {
    const router = Router();

    // ========================================
    // POST /api/auth/register
    // ========================================
    router.post('/register', async (req, res) => {
        try {
            const { name, email, phone, password } = req.body;

            // Validacoes
            if (!name || !email || !password) {
                return res.status(400).json({ error: 'Nome, email e senha sao obrigatorios' });
            }

            if (password.length < 6) {
                return res.status(400).json({ error: 'Senha deve ter no minimo 6 caracteres' });
            }

            // Verificar email unico
            const existing = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
            if (existing) {
                return res.status(400).json({ error: 'Email ja cadastrado' });
            }

            // Hash da senha
            const passwordHash = await bcrypt.hash(password, 10);

            // Criar usuario
            const userId = uuidv4();
            await db.run(`
                INSERT INTO users (id, email, password_hash, name, phone, role)
                VALUES (?, ?, ?, ?, ?, 'OWNER')
            `, [userId, email.toLowerCase(), passwordHash, name, phone || null]);

            // Gerar token (sem tenant ainda - sera criado no onboarding)
            const token = generateToken(userId, null);

            res.status(201).json({
                success: true,
                user: { id: userId, name, email: email.toLowerCase(), phone },
                token
            });
        } catch (error) {
            console.error('Register error:', error);
            res.status(500).json({ error: 'Erro ao criar conta' });
        }
    });

    // ========================================
    // POST /api/auth/login
    // ========================================
    router.post('/login', async (req, res) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: 'Email e senha sao obrigatorios' });
            }

            // Buscar usuario
            const user = await db.get(
                'SELECT * FROM users WHERE email = ?',
                [email.toLowerCase()]
            );

            if (!user) {
                return res.status(401).json({ error: 'Email ou senha incorretos' });
            }

            // Verificar senha
            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Email ou senha incorretos' });
            }

            // Buscar tenant do usuario (se existir)
            const tenant = await db.get(
                'SELECT * FROM tenants WHERE owner_id = ?',
                [user.id]
            );

            // Gerar token
            const token = generateToken(user.id, tenant?.id || null);

            res.json({
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role
                },
                tenant: tenant ? {
                    id: tenant.id,
                    name: tenant.name,
                    slug: tenant.slug,
                    status: tenant.status
                } : null,
                token
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: 'Erro ao fazer login' });
        }
    });

    // ========================================
    // POST /api/auth/logout
    // ========================================
    router.post('/logout', (req, res) => {
        // JWT e stateless - logout e feito no cliente removendo o token
        res.json({ success: true, message: 'Logout realizado' });
    });

    // ========================================
    // GET /api/auth/me
    // ========================================
    router.get('/me', authMiddleware(db), async (req, res) => {
        try {
            const user = req.user;

            // Buscar tenant
            let tenant = null;
            if (req.tenantId) {
                tenant = await db.get('SELECT * FROM tenants WHERE id = ?', [req.tenantId]);

                // Buscar subscription
                if (tenant) {
                    tenant.subscription = await db.get(`
                        SELECT s.*, p.name as plan_name, p.slug as plan_slug
                        FROM subscriptions s
                        JOIN plans p ON s.plan_id = p.id
                        WHERE s.tenant_id = ?
                    `, [tenant.id]);
                }
            }

            res.json({
                user,
                tenant: tenant ? {
                    id: tenant.id,
                    name: tenant.name,
                    slug: tenant.slug,
                    logo_url: tenant.logo_url,
                    status: tenant.status,
                    subscription: tenant.subscription ? {
                        plan: tenant.subscription.plan_name,
                        status: tenant.subscription.status,
                        trial_ends_at: tenant.subscription.trial_ends_at
                    } : null
                } : null
            });
        } catch (error) {
            console.error('Me error:', error);
            res.status(500).json({ error: 'Erro ao buscar dados do usuario' });
        }
    });

    // ========================================
    // PUT /api/auth/password
    // ========================================
    router.put('/password', authMiddleware(db), async (req, res) => {
        try {
            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) {
                return res.status(400).json({ error: 'Senhas sao obrigatorias' });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({ error: 'Nova senha deve ter no minimo 6 caracteres' });
            }

            // Buscar usuario com senha
            const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);

            // Verificar senha atual
            const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Senha atual incorreta' });
            }

            // Hash nova senha
            const newPasswordHash = await bcrypt.hash(newPassword, 10);

            // Atualizar
            await db.run(
                'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [newPasswordHash, req.user.id]
            );

            res.json({ success: true, message: 'Senha alterada com sucesso' });
        } catch (error) {
            console.error('Password change error:', error);
            res.status(500).json({ error: 'Erro ao alterar senha' });
        }
    });

    return router;
}
