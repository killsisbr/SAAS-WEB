// ============================================================
// Middleware de Autenticacao JWT
// ============================================================

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'deliveryhub-secret-key-change-in-production';

/**
 * Middleware que verifica JWT e adiciona user ao request
 */
export function authMiddleware(db) {
    return async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Token nao fornecido' });
            }

            const token = authHeader.split(' ')[1];

            // Verificar JWT
            const decoded = jwt.verify(token, JWT_SECRET);

            // Buscar usuario
            const user = await db.get(
                'SELECT id, email, name, phone, role FROM users WHERE id = ?',
                [decoded.userId]
            );

            if (!user) {
                return res.status(401).json({ error: 'Usuario nao encontrado' });
            }

            // Adicionar ao request
            req.user = user;
            req.tenantId = decoded.tenantId;

            next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expirado' });
            }
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({ error: 'Token invalido' });
            }
            console.error('Auth error:', error);
            return res.status(500).json({ error: 'Erro de autenticacao' });
        }
    };
}

/**
 * Middleware opcional - nao bloqueia se nao estiver autenticado
 */
export function optionalAuth(db) {
    return async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;

            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                const decoded = jwt.verify(token, JWT_SECRET);

                const user = await db.get(
                    'SELECT id, email, name, phone, role FROM users WHERE id = ?',
                    [decoded.userId]
                );

                if (user) {
                    req.user = user;
                    req.tenantId = decoded.tenantId;
                }
            }
        } catch (error) {
            // Ignorar erros - autenticacao e opcional
        }

        next();
    };
}

/**
 * Middleware que verifica se usuario e Super Admin
 */
export function superAdminOnly(req, res, next) {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Acesso restrito a Super Admin' });
    }
    next();
}

/**
 * Middleware que verifica roles especificas
 */
export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        next();
    };
}

/**
 * Gerar JWT
 */
export function generateToken(userId, tenantId = null) {
    return jwt.sign(
        { userId, tenantId },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
}

export default {
    authMiddleware,
    optionalAuth,
    superAdminOnly,
    requireRole,
    generateToken
};
