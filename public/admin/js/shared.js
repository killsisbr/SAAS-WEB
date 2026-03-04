/**
 * shared.js - Shared Utilities for Admin Portal
 * Centralizes authentication, API headers, formatting, and notifications.
 */

// 1. Authentication & Context
const token = localStorage.getItem('token');

// Redirect to login if no token and not already on login page
if (!token && !window.location.pathname.includes('/login')) {
    window.location.href = '/login';
}

// Global context constants
const TENANT_SLUG = window.location.pathname.split('/loja/')[1]?.split('/')[0] || '';
const API_HEADERS = {
    'Authorization': `Bearer ${token}`,
    'X-Tenant-Slug': TENANT_SLUG
};

// 2. Global Actions
function logout() {
    showConfirm({
        title: 'Sair da Conta',
        message: 'Tem certeza que deseja sair? Sua sessão será encerrada.',
        confirmText: 'Sair agora',
        cancelText: 'Continuar aqui',
        type: 'danger',
        onConfirm: () => {
            localStorage.removeItem('token');
            localStorage.removeItem('tenantId');
            localStorage.removeItem('tenantSlug');
            window.location.href = '/login';
        }
    });
}

/**
 * Custom Neo-Brutalist Confirm Modal
 */
function showConfirm({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', onConfirm, type = 'primary' }) {
    const modal = document.createElement('div');
    modal.id = 'custom-confirm-modal';

    const color = type === 'danger' ? '#ef4444' : '#d9432e';

    modal.innerHTML = `
        <div class="modal-backdrop">
            <div class="modal-content">
                <div class="modal-header">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h2>${title}</h2>
                </div>
                <p>${message}</p>
                <div class="modal-actions">
                    <button class="btn-modal btn-cancel">${cancelText}</button>
                    <button class="btn-modal btn-confirm" style="background: ${color}">${confirmText}</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const close = () => {
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 300);
    };

    modal.querySelector('.btn-cancel').onclick = close;
    modal.querySelector('.btn-confirm').onclick = () => {
        if (onConfirm) onConfirm();
        close();
    };

    // Trigger animation
    requestAnimationFrame(() => modal.classList.add('active'));
}

// 3. Formatting Utilities
function formatCurrency(value) {
    if (typeof value !== 'number') value = parseFloat(value) || 0;
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatStatus(status) {
    const map = {
        'PENDING': 'Pendente',
        'CONFIRMED': 'Confirmado',
        'PREPARING': 'Preparando',
        'READY': 'Pronto',
        'DELIVERED': 'Entregue',
        'CANCELLED': 'Cancelado'
    };
    return map[status] || status;
}

// 4. Notifications
function showToast(message, type = 'success', title = null) {
    // Standardized toast implementation
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // Base styles
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        padding: '12px 24px',
        borderRadius: '12px',
        background: type === 'success' ? '#22c55e' : (type === 'error' ? '#ef4444' : '#3b82f6'),
        color: 'white',
        fontWeight: '700',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
        zIndex: '10000',
        animation: 'toastIn 0.3s ease-out',
        minWidth: '200px',
        border: '2px solid rgba(0,0,0,0.1)'
    });

    if (title) {
        const titleEl = document.createElement('div');
        titleEl.style.fontSize = '0.7rem';
        titleEl.style.textTransform = 'uppercase';
        titleEl.style.opacity = '0.8';
        titleEl.style.marginBottom = '4px';
        titleEl.textContent = title;
        toast.appendChild(titleEl);
    }

    const msgEl = document.createElement('div');
    msgEl.textContent = message;
    toast.appendChild(msgEl);

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// 5. Shared UI Initializers
async function initStoreInfo() {
    try {
        const res = await fetch('/api/auth/me', { headers: API_HEADERS });
        if (!res.ok) {
            if (res.status === 401) {
                localStorage.removeItem('token');
                window.location.href = '/login';
            }
            return null;
        }

        const data = await res.json();
        if (data.tenant) {
            // Update common UI elements if they exist
            const logo = document.getElementById('sidebarLogo') || document.getElementById('storeLogo');
            if (logo) logo.textContent = data.tenant.name;

            const name = document.getElementById('storeName');
            if (name) name.textContent = data.tenant.name;

            const plan = document.getElementById('storePlan');
            if (plan) plan.textContent = data.tenant.subscription?.plan || 'Trial';

            const link = document.getElementById('viewStoreLink');
            if (link) link.href = `/loja/${data.tenant.slug}`;
        }
        return data;
    } catch (error) {
        console.error('Error initializing store info:', error);
        return null;
    }
}

// Global API fetch wrapper with auto-auth and error handling
async function apiFetch(url, options = {}) {
    const headers = { ...API_HEADERS, ...options.headers };

    // Auto-detect JSON body
    if (options.body) {
        if (typeof options.body === 'object' && !(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        } else if (typeof options.body === 'string') {
            // Check if it looks like a JSON string to be safe
            try {
                if ((options.body.startsWith('{') && options.body.endsWith('}')) ||
                    (options.body.startsWith('[') && options.body.endsWith(']'))) {
                    if (!headers['Content-Type']) {
                        headers['Content-Type'] = 'application/json';
                    }
                }
            } catch (e) {
                // Not a valid JSON string, ignore
            }
        }
    }

    try {
        const response = await fetch(url, { ...options, headers });

        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login';
            return null;
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.error || errorData.message || `Erro ${response.status}`;
            throw new Error(errorMsg);
        }

        // Return JSON if applicable
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return await response.json();
        }

        return response;
    } catch (error) {
        console.error('API Fetch Error:', error);
        throw error;
    }
}

// Add CSS for toast animations
if (!document.getElementById('shared-styles')) {
    const style = document.createElement('style');
    style.id = 'shared-styles';
    style.textContent = `
        @keyframes toastIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes toastOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
        
        /* Modal Styles */
        #custom-confirm-modal {
            position: fixed;
            inset: 0;
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        }

        #custom-confirm-modal.active {
            opacity: 1;
            pointer-events: all;
        }

        #custom-confirm-modal .modal-backdrop {
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        #custom-confirm-modal .modal-content {
            background: #fff9f0;
            border: 4px solid #1a1a1a;
            border-radius: 24px;
            padding: 32px;
            width: 100%;
            max-width: 400px;
            box-shadow: 12px 12px 0 #1a1a1a;
            transform: translateY(20px) scale(0.95);
            transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        #custom-confirm-modal.active .modal-content {
            transform: translateY(0) scale(1);
        }

        #custom-confirm-modal.closing .modal-content {
            transform: translateY(20px) scale(0.95);
            opacity: 0;
        }

        #custom-confirm-modal .modal-header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 20px;
        }

        #custom-confirm-modal .modal-header i {
            font-size: 2rem;
            color: #ffb800;
            filter: drop-shadow(2px 2px 0 #1a1a1a);
        }

        #custom-confirm-modal h2 {
            font-family: 'Bebas Neue', sans-serif;
            font-size: 2.5rem;
            letter-spacing: 1px;
            margin: 0;
            color: #1a1a1a;
        }

        #custom-confirm-modal p {
            font-family: 'Outfit', sans-serif;
            font-size: 1.1rem;
            color: #444;
            line-height: 1.5;
            margin-bottom: 32px;
            font-weight: 500;
        }

        #custom-confirm-modal .modal-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }

        #custom-confirm-modal .btn-modal {
            padding: 16px;
            border: 3px solid #1a1a1a;
            border-radius: 14px;
            font-family: 'Outfit', sans-serif;
            font-weight: 800;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            cursor: pointer;
            transition: all 0.2s;
        }

        #custom-confirm-modal .btn-cancel {
            background: white;
            color: #1a1a1a;
            box-shadow: 4px 4px 0 #1a1a1a;
        }

        #custom-confirm-modal .btn-confirm {
            color: white;
            box-shadow: 4px 4px 0 #1a1a1a;
        }

        #custom-confirm-modal .btn-modal:hover {
            transform: translate(-2px, -2px);
            box-shadow: 6px 6px 0 #1a1a1a;
        }

        #custom-confirm-modal .btn-modal:active {
            transform: translate(2px, 2px);
            box-shadow: 2px 2px 0 #1a1a1a;
        }

        @media (max-width: 480px) {
            #custom-confirm-modal .modal-content {
                padding: 24px;
            }
            #custom-confirm-modal h2 {
                font-size: 2rem;
            }
        }

        @media (min-width: 769px) {
            .hide-on-desktop {
                display: none !important;
            }
        }
    `;
    document.head.appendChild(style);
}
