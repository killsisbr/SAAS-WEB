/**
 * shared.js - Shared Utilities for Admin Portal
 * Centralizes authentication, API headers, formatting, and notifications.
 */

// 1. Authentication & Context
const token = localStorage.getItem('token');

// Redirect to login if no token and not already on login page
if (!token && !window.location.pathname.includes('/login')) {
    window.location.href = 'login';
}

// Global context constants
const TENANT_SLUG = window.location.pathname.split('/loja/')[1]?.split('/')[0] || '';
const API_HEADERS = {
    'Authorization': `Bearer ${token}`,
    'X-Tenant-Slug': TENANT_SLUG
};

// 2. Global Actions
function logout() {
    if (confirm('Tem certeza que deseja sair?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('tenantId');
        localStorage.removeItem('tenantSlug');
        window.location.href = 'login';
    }
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
                window.location.href = 'login';
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
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }

    try {
        const response = await fetch(url, { ...options, headers });

        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = 'login';
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
        
        @media (min-width: 769px) {
            .hide-on-desktop {
                display: none !important;
            }
        }
    `;
    document.head.appendChild(style);
}
