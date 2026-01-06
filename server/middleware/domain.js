// ============================================================
// Middleware de Roteamento por Custom Domain
// ============================================================

export function domainMiddleware(db) {
    return async (req, res, next) => {
        const host = req.hostname || req.headers.host?.split(':')[0];

        // Ignorar dominios locais e padrao
        if (!host || host === 'localhost' || host.includes('deliveryhub') || host.includes('127.0.0.1')) {
            return next();
        }

        try {
            // Buscar tenant pelo dominio customizado
            const domain = await db.get(`
                SELECT cd.*, t.slug 
                FROM custom_domains cd
                JOIN tenants t ON cd.tenant_id = t.id
                WHERE cd.domain = ? AND cd.verified = 1
            `, [host]);

            if (domain) {
                // Redirecionar para a loja do tenant
                // Se a requisicao for para a raiz, redirecionar para /loja/:slug
                if (req.path === '/' || req.path === '') {
                    return res.redirect(`/loja/${domain.slug}`);
                }

                // Se for uma requisicao de API, adicionar tenant_id ao request
                if (req.path.startsWith('/api/')) {
                    req.tenantId = domain.tenant_id;
                    req.customDomain = domain.domain;
                }

                // Se for para /admin, redirecionar para /loja/:slug/admin
                if (req.path.startsWith('/admin')) {
                    const adminPath = req.path.replace('/admin', '');
                    return res.redirect(`/loja/${domain.slug}/admin${adminPath}`);
                }
            }
        } catch (error) {
            console.error('Domain middleware error:', error);
        }

        next();
    };
}
