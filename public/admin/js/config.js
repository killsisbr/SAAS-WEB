let currentTenantId = null;
let currentSettings = {};
let deliveryZones = [];

async function saveDeliverySettings() {
    if (!currentTenantId) {
        showToast('Tenant nao carregado', 'error');
        return;
    }

    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btn.disabled = true;

    try {
        // Verificar toggle de retirada
        const pickupToggle = document.querySelector('#toggle-pickup .toggle-switch');
        const allowPickup = pickupToggle ? pickupToggle.classList.contains('active') : true;

        // Ordenar zonas por km antes de salvar
        const sortedZones = [...deliveryZones].sort((a, b) => (parseFloat(a.maxKm) || 0) - (parseFloat(b.maxKm) || 0));

        const newSettings = {
            ...currentSettings,
            storeLat: parseFloat(document.getElementById('storeLat').value) || null,
            storeLng: parseFloat(document.getElementById('storeLng').value) || null,
            minOrder: parseFloat(document.getElementById('minOrder').value) || 0,
            deliveryFee: parseFloat(document.getElementById('deliveryFee').value) || 0,
            deliveryZones: sortedZones,
            allow_pickup: allowPickup
        };

        const data = await apiFetch(`/api/tenants/${currentTenantId}`, {
            method: 'PUT',
            body: {
                settings: newSettings
            }
        });

        currentSettings = newSettings;
        showToast('Configuracoes de entrega salvas!', 'success');
    } catch (e) {
        console.error(e);
        showToast(e.message || 'Erro ao salvar', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function savePaymentSettings() {
    if (!currentTenantId) {
        showToast('Tenant nao carregado', 'error');
        return;
    }

    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btn.disabled = true;

    try {
        const pixHolderName = document.getElementById('pixHolderName')?.value || '';
        const pixKey = document.getElementById('pixKey')?.value || '';

        const acceptCash = document.querySelector('#toggle-pay-cash .toggle-switch')?.classList.contains('active') !== false;
        const acceptPix = document.querySelector('#toggle-pay-pix .toggle-switch')?.classList.contains('active') !== false;
        const acceptCard = document.querySelector('#toggle-pay-card .toggle-switch')?.classList.contains('active') !== false;

        const newSettings = {
            ...currentSettings,
            pix_holder_name: pixHolderName,
            pix_key: pixKey,
            acceptCash,
            acceptPix,
            acceptCard
        };

        const data = await apiFetch(`/api/tenants/${currentTenantId}`, {
            method: 'PUT',
            body: {
                settings: newSettings
            }
        });

        currentSettings = newSettings;
        showToast('Configuracoes de pagamento salvas!', 'success');
    } catch (e) {
        console.error(e);
        showToast(e.message || 'Erro ao salvar', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function renderDeliveryZones() {
    const container = document.getElementById('deliveryZonesList');
    if (!container) return;

    if (deliveryZones.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: var(--text-muted); background: var(--bg); border-radius: 12px; border: 2px dashed var(--border);">Nenhuma zona de entrega configurada</div>';
        return;
    }

    container.innerHTML = deliveryZones.map((zone, index) => `
        <div style="background: var(--bg); border: 2px solid var(--border); border-radius: 12px; padding: 16px; position: relative;">
            <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 8px;">RAIO DA ZONA</div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                <input type="number" step="0.1" value="${zone.maxKm}" onchange="updateZone(${index}, 'maxKm', this.value)" style="flex: 1; padding: 8px; border: 2px solid var(--border); border-radius: 8px; font-weight: 700;">
                <span style="font-weight: 700;">KM</span>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 8px;">VALOR DA ENTREGA</div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 700;">R$</span>
                <input type="number" step="0.01" value="${zone.fee}" onchange="updateZone(${index}, 'fee', this.value)" style="flex: 1; padding: 8px; border: 2px solid var(--border); border-radius: 8px; font-weight: 700; color: var(--primary);">
            </div>
            <button onclick="removeZone(${index})" style="position: absolute; top: -10px; right: -10px; background: var(--danger); color: white; border: 2px solid var(--dark); border-radius: 50%; width: 24px; height: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.7rem;">
                <i class="fas fa-times"></i>
            </button>
        </div>`).join('');
}

function addZone() {
    const lastKm = deliveryZones.length > 0 ? parseFloat(deliveryZones[deliveryZones.length - 1].maxKm) : 0;
    const newMaxKm = Math.round((lastKm + 2.0) * 10) / 10;
    deliveryZones.push({ maxKm: newMaxKm, fee: 7 });
    renderDeliveryZones();
}

function updateZone(index, field, value) {
    deliveryZones[index][field] = parseFloat(value) || 0;
}

function removeZone(index) {
    deliveryZones.splice(index, 1);
    renderDeliveryZones();
}

function getMyLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            document.getElementById('storeLat').value = position.coords.latitude.toFixed(6);
            document.getElementById('storeLng').value = position.coords.longitude.toFixed(6);
            showToast('Localizacao obtida com sucesso!', 'success');
        }, (error) => {
            showToast('Erro ao obter localizacao: ' + error.message, 'error');
        });
    } else {
        showToast('Seu navegador nao suporta geolocalizacao', 'error');
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const buttons = document.querySelectorAll('.tab');
    buttons.forEach(t => t.classList.remove('active'));

    for (let btn of buttons) {
        const clickAttr = btn.getAttribute('onclick') || '';
        if (clickAttr.includes(`switchTab('${tabId}')`) || clickAttr.includes(`switchTab("${tabId}")`)) {
            btn.classList.add('active');
        }
    }

    const content = document.getElementById(`tab-${tabId}`);
    if (content) content.classList.add('active');
}

function toggleSwitch(el) {
    el.querySelector('.toggle-switch').classList.toggle('active');
}

async function init() {
    const data = await initStoreInfo();
    if (data && data.tenant) {
        currentTenantId = data.tenant.id;
        currentSettings = data.tenant.settings || {};

        document.getElementById('storeName').value = data.tenant.name || '';
        document.getElementById('storePhone').value = currentSettings.phone || '';
        document.getElementById('storeWhatsapp').value = currentSettings.whatsapp || '';
        document.getElementById('storeAddress').value = currentSettings.address || '';

        const userNameEl = document.getElementById('userName');
        const userEmailEl = document.getElementById('userEmail');
        if (userNameEl) userNameEl.value = data.user?.name || '';
        if (userEmailEl) userEmailEl.value = data.user?.email || '';

        const openToggle = document.querySelector('#toggle-store-open .toggle-switch');
        if (openToggle) openToggle.classList.toggle('active', !!currentSettings.isOpen);

        const schedule = currentSettings.schedule || {};
        const days = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
        days.forEach(day => {
            const daySchedule = schedule[day] || {};
            const openInp = document.getElementById(`${day}-open`);
            const closeInp = document.getElementById(`${day}-close`);
            if (openInp) openInp.value = daySchedule.open || '';
            if (closeInp) closeInp.value = daySchedule.close || '';
            if (daySchedule.closed) toggleDayFolga(day, true);
        });

        const announcementToggle = document.querySelector('#toggle-announcement .toggle-switch');
        if (announcementToggle) announcementToggle.classList.toggle('active', !!currentSettings.announcementEnabled);
        const annText = document.getElementById('announcementText');
        if (annText) annText.value = currentSettings.announcementText || '';

        const marqueeToggle = document.querySelector('#toggle-marquee .toggle-switch');
        if (marqueeToggle) marqueeToggle.classList.toggle('active', currentSettings.marqueeEnabled !== false);
        const marqText = document.getElementById('marqueeText');
        if (marqText) marqText.value = currentSettings.marqueeText || '';

        document.getElementById('storeLat').value = currentSettings.storeLat || '';
        document.getElementById('storeLng').value = currentSettings.storeLng || '';
        document.getElementById('minOrder').value = currentSettings.minOrder || '';
        document.getElementById('deliveryFee').value = currentSettings.deliveryFee || '';

        deliveryZones = currentSettings.deliveryZones || [];
        renderDeliveryZones();

        const pickupToggle = document.querySelector('#toggle-pickup .toggle-switch');
        if (pickupToggle) pickupToggle.classList.toggle('active', currentSettings.allow_pickup !== false);

        const pixHN = document.getElementById('pixHolderName');
        const pixK = document.getElementById('pixKey');
        if (pixHN) pixHN.value = currentSettings.pix_holder_name || '';
        if (pixK) pixK.value = currentSettings.pix_key || '';

        const cashToggle = document.querySelector('#toggle-pay-cash .toggle-switch');
        if (cashToggle) cashToggle.classList.toggle('active', currentSettings.acceptCash !== false);
        const pixToggle = document.querySelector('#toggle-pay-pix .toggle-switch');
        if (pixToggle) pixToggle.classList.toggle('active', currentSettings.acceptPix !== false);
        const cardToggle = document.querySelector('#toggle-pay-card .toggle-switch');
        if (cardToggle) cardToggle.classList.toggle('active', currentSettings.acceptCard !== false);

        const themeSelect = document.getElementById('storeTheme');
        if (themeSelect && currentSettings.storeTheme) {
            themeSelect.value = currentSettings.storeTheme;
            updateThemePreview();
        }

        if (currentSettings.logoType === 'image') {
            const logImgRadio = document.getElementById('logoTypeImage');
            if (logImgRadio) logImgRadio.checked = true;
            const logUpSect = document.getElementById('logoUploadSection');
            if (logUpSect) logUpSect.style.display = 'block';

            if (currentSettings.logoUrl) {
                const preview = document.getElementById('logoPreview');
                const placeholder = document.getElementById('logoPlaceholder');
                const sizeImg = document.getElementById('logoSizePreviewImg');
                const sizePlac = document.getElementById('logoSizePreviewPlaceholder');

                if (preview) {
                    preview.src = currentSettings.logoUrl;
                    preview.style.display = 'block';
                }
                if (placeholder) placeholder.style.display = 'none';
                if (sizeImg) {
                    sizeImg.src = currentSettings.logoUrl;
                    sizeImg.style.display = 'block';
                }
                if (sizePlac) sizePlac.style.display = 'none';
            }

            const savedSize = currentSettings.logoSize || 100;
            const logSizeInp = document.getElementById('logoSize');
            if (logSizeInp) logSizeInp.value = savedSize;
            const logSizeVal = document.getElementById('logoSizeValue');
            if (logSizeVal) logSizeVal.textContent = savedSize + 'px';
            const sizeImg = document.getElementById('logoSizePreviewImg');
            if (sizeImg) sizeImg.style.maxHeight = savedSize + 'px';
        } else {
            const logTxtRadio = document.getElementById('logoTypeText');
            if (logTxtRadio) logTxtRadio.checked = true;
        }

        const orderMode = currentSettings.whatsappOrderMode || (currentSettings.enableDirect !== false ? 'direct' : 'link');
        selectOrderMode(orderMode);

        loadAISettings();
    }
}

async function saveStoreData() {
    if (!currentTenantId) {
        alert('Tenant nao carregado');
        return;
    }

    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btn.disabled = true;

    try {
        const name = document.getElementById('storeName')?.value || currentSettings.name || '';
        const scheduleDays = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
        const schedule = {};

        scheduleDays.forEach(day => {
            const btnFolga = document.getElementById(`btn-folga-${day}`);
            schedule[day] = {
                open: document.getElementById(`${day}-open`)?.value || '',
                close: document.getElementById(`${day}-close`)?.value || '',
                closed: btnFolga?.classList.contains('active') || false
            };
        });

        const logoType = document.getElementById('logoTypeImage')?.checked ? 'image' : 'text';
        let logoUrl = currentSettings.logoUrl || '';

        if (logoType === 'image') {
            const fileInput = document.getElementById('logoFile');
            if (fileInput?.files && fileInput.files[0]) {
                const uploadedUrl = await uploadLogo();
                if (uploadedUrl) logoUrl = uploadedUrl;
            }
        }

        const newSettings = {
            ...currentSettings,
            phone: document.getElementById('storePhone')?.value || '',
            whatsapp: document.getElementById('storeWhatsapp')?.value || '',
            address: document.getElementById('storeAddress')?.value || '',
            isOpen: document.querySelector('#toggle-store-open .toggle-switch')?.classList.contains('active') || false,
            schedule: schedule,
            announcementEnabled: document.querySelector('#toggle-announcement .toggle-switch')?.classList.contains('active') || false,
            announcementText: document.getElementById('announcementText')?.value || '',
            marqueeEnabled: document.querySelector('#toggle-marquee .toggle-switch')?.classList.contains('active') ?? true,
            marqueeText: document.getElementById('marqueeText')?.value || '',
            logoType: logoType,
            logoUrl: logoUrl,
            logoSize: parseInt(document.getElementById('logoSize')?.value) || 100,
            enableDirect: document.getElementById('selectedOrderMode')?.value === 'direct',
            whatsappOrderMode: document.getElementById('selectedOrderMode')?.value
        };

        await apiFetch(`/api/tenants/${currentTenantId}`, {
            method: 'PUT',
            body: { name, settings: newSettings }
        });

        currentSettings = newSettings;
        showToast('Configuracoes salvas com sucesso!', 'success');
    } catch (e) {
        console.error(e);
        showToast(e.message || 'Erro ao salvar configuracoes', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function saveTheme() {
    if (!currentTenantId) {
        alert('Tenant nao carregado');
        return;
    }

    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btn.disabled = true;

    try {
        const selectedTheme = document.getElementById('storeTheme').value;
        const newSettings = { ...currentSettings, storeTheme: selectedTheme };

        await apiFetch(`/api/tenants/${currentTenantId}`, {
            method: 'PUT',
            body: { settings: newSettings }
        });

        currentSettings = newSettings;
        showToast('Tema salvo com sucesso!', 'success');
    } catch (e) {
        console.error(e);
        showToast(e.message || 'Erro ao salvar tema', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function updateThemePreview() {
    const themeSelect = document.getElementById('storeTheme');
    if (!themeSelect) return;
    const theme = themeSelect.value;

    // Mapa completo — cores extraidas de public/store/index.html CSS vars reais
    const themeStyles = {
        'retro': { bg: '#fff9f0', text: '#1a1a1a', brand: '#d9432e', card: '#ffffff', cardBorder: '#1a1a1a', btnBg: '#d9432e', btnText: '#ffffff', radius: '20px', borderStyle: 'solid', font: 'Outfit', layoutType: 'grid', label: 'Retro', marquee: '#1a1a1a', marqueeText: '#fff9f0', searchBg: '#f0e6d6' },
        'midnight': { bg: '#050505', text: '#f9fafb', brand: '#10b981', card: '#111827', cardBorder: '#1f2937', btnBg: '#10b981', btnText: '#ffffff', radius: '12px', borderStyle: 'solid', font: 'Outfit', layoutType: 'grid', label: 'Midnight', marquee: '#10b981', marqueeText: '#050505', searchBg: '#1f2937' },
        'vibe': { bg: '#f8fafc', text: '#0f172a', brand: '#4f46e5', card: '#ffffff', cardBorder: '#e2e8f0', btnBg: '#4f46e5', btnText: '#ffffff', radius: '32px', borderStyle: 'solid', font: 'Outfit', layoutType: 'grid', label: 'Vibe', marquee: '#4f46e5', marqueeText: '#ffffff', searchBg: '#f1f5f9' },
        'doodle': { bg: '#ffffff', text: '#000000', brand: '#e11d48', card: '#ffffff', cardBorder: '#000000', btnBg: '#e11d48', btnText: '#ffffff', radius: '2px', borderStyle: 'dashed', font: 'Outfit', layoutType: 'grid', label: 'Doodle', marquee: '#000000', marqueeText: '#ffffff', searchBg: '#f5f5f5' },
        'luxury': { bg: '#0a0a0a', text: '#f5f5f5', brand: '#c5a059', card: '#151515', cardBorder: '#c5a059', btnBg: '#c5a059', btnText: '#0a0a0a', radius: '0px', borderStyle: 'solid', font: 'Outfit', layoutType: 'grid', label: 'Luxury', marquee: '#c5a059', marqueeText: '#0a0a0a', searchBg: '#1a1a1a' },
        'matrix': { bg: '#000000', text: '#00ff41', brand: '#00ff41', card: '#000000', cardBorder: '#00ff41', btnBg: '#00ff41', btnText: '#000000', radius: '4px', borderStyle: 'solid', font: 'Fira Code', layoutType: 'grid', label: 'Matrix', marquee: '#00ff41', marqueeText: '#000000', searchBg: '#0a1a0a' },
        'candy': { bg: '#fff5f7', text: '#4a4e69', brand: '#ff85a1', card: '#ffffff', cardBorder: '#ff85a1', btnBg: '#ff85a1', btnText: '#ffffff', radius: '40px', borderStyle: 'solid', font: 'Outfit', layoutType: 'grid', label: 'Candy', marquee: '#ff85a1', marqueeText: '#ffffff', searchBg: '#ffe4ec' },
        'modern': { bg: '#F5F5F7', text: '#1C1C1E', brand: '#2B2B2B', card: '#FFFFFF', cardBorder: '#D1D1D6', btnBg: '#2B2B2B', btnText: '#FFFFFF', radius: '12px', borderStyle: 'solid', font: 'Inter', layoutType: 'list', label: 'Modern', marquee: '#2B2B2B', marqueeText: '#F5F5F7', searchBg: '#E5E5EA' },
        'compact': { bg: '#f8f9fa', text: '#212529', brand: '#333333', card: '#ffffff', cardBorder: '#e9ecef', btnBg: '#333333', btnText: '#ffffff', radius: '8px', borderStyle: 'solid', font: 'Inter', layoutType: 'list', label: 'Compact', marquee: '#333333', marqueeText: '#ffffff', searchBg: '#e9ecef' },
        'elegant': { bg: '#121212', text: '#E0E0E0', brand: '#D4AF37', card: '#1E1E1E', cardBorder: 'rgba(212,175,55,0.3)', btnBg: '#D4AF37', btnText: '#121212', radius: '4px', borderStyle: 'solid', font: 'Playfair Display', layoutType: 'list', label: 'Elegant', marquee: '#D4AF37', marqueeText: '#121212', searchBg: '#2a2a2a' },
        'glass': { bg: 'linear-gradient(135deg, #1a1a2e, #16213e, #2c0e52)', text: '#ffffff', brand: '#bd00ff', card: 'rgba(255,255,255,0.08)', cardBorder: 'rgba(255,255,255,0.15)', btnBg: '#bd00ff', btnText: '#ffffff', radius: '24px', borderStyle: 'solid', font: 'Outfit', layoutType: 'grid', label: 'Glass', marquee: 'rgba(255,255,255,0.15)', marqueeText: '#ffffff', searchBg: 'rgba(255,255,255,0.08)' },
        'social': { bg: '#000000', text: '#ffffff', brand: '#ff0055', card: '#1a1a1a', cardBorder: '#333333', btnBg: '#ff0055', btnText: '#ffffff', radius: '16px', borderStyle: 'none', font: 'Inter', layoutType: 'feed', label: 'Social', marquee: '#ff0055', marqueeText: '#ffffff', searchBg: '#1a1a1a' },
        'arcade': { bg: '#1a0b2e', text: '#43ffff', brand: '#ff00de', card: '#11081f', cardBorder: '#43ffff', btnBg: '#ff00de', btnText: '#ffffff', radius: '0px', borderStyle: 'dashed', font: 'Press Start 2P', layoutType: 'arcade', label: 'Arcade', marquee: '#ff00de', marqueeText: '#ffffff', searchBg: '#11081f' },
        'organic': { bg: '#f1f8e9', text: '#1b4332', brand: '#2d6a4f', card: '#ffffff', cardBorder: 'rgba(162,209,73,0.3)', btnBg: '#2d6a4f', btnText: '#ffffff', radius: '20px', borderStyle: 'none', font: 'Quicksand', layoutType: 'list', label: 'Organic', marquee: '#2d6a4f', marqueeText: '#ffffff', searchBg: '#e8f5e9' },
        'neon': { bg: '#050505', text: '#ffffff', brand: '#ff0055', card: '#111111', cardBorder: '#00f2ff', btnBg: '#ff0055', btnText: '#ffffff', radius: '4px', borderStyle: 'solid', font: 'Inter', layoutType: 'list', label: 'Neon Night', marquee: '#ff0055', marqueeText: '#ffffff', searchBg: '#1a1a1a' },
        'sketch': { bg: '#fdf6e3', text: '#222222', brand: '#333333', card: 'transparent', cardBorder: '#555555', btnBg: '#333333', btnText: '#fdf6e3', radius: '0px', borderStyle: 'solid', font: 'Gloria Hallelujah', layoutType: 'list', label: 'Sketch', marquee: '#333333', marqueeText: '#fdf6e3', searchBg: '#f5ecda' },
        'fashion': { bg: '#ffffff', text: '#111827', brand: '#9333ea', card: '#ffffff', cardBorder: '#111827', btnBg: '#9333ea', btnText: '#ffffff', radius: '0px', borderStyle: 'solid', font: 'Outfit', layoutType: 'grid', label: 'Fashion', marquee: '#9333ea', marqueeText: '#ffffff', searchBg: '#f3e8ff' },
        'petshop': { bg: '#f8fafc', text: '#1f2937', brand: '#f97316', card: '#ffffff', cardBorder: '#0f172a', btnBg: '#f97316', btnText: '#ffffff', radius: '30px', borderStyle: 'none', font: 'Quicksand', layoutType: 'grid', label: 'Pet Shop', marquee: '#f97316', marqueeText: '#ffffff', searchBg: '#fff7ed' },
        'pharmacy': { bg: '#f9fafb', text: '#111827', brand: '#059669', card: '#ffffff', cardBorder: '#e5e7eb', btnBg: '#059669', btnText: '#ffffff', radius: '12px', borderStyle: 'solid', font: 'Inter', layoutType: 'grid', label: 'Pharmacy', marquee: '#059669', marqueeText: '#ffffff', searchBg: '#ecfdf5' }
    };

    // Variantes -list herdam cores do tema base
    const baseTheme = theme.replace('-list', '');
    const isListVariant = theme !== baseTheme;
    const style = themeStyles[theme] || themeStyles[baseTheme] || themeStyles['retro'];

    const layoutLabel = isListVariant ? 'list' : (style.layoutType || 'grid');
    const layoutIcons = { grid: '▦ GRID', list: '☰ LISTA', feed: '◉ FEED', arcade: '▣ ARCADE' };
    const isGradientBg = style.bg.startsWith('linear');
    const solidBg = isGradientBg ? '#1a1a2e' : style.bg;
    const borderVal = style.borderStyle === 'none' ? 'solid' : style.borderStyle;

    // Buscar todos os elementos
    const el = id => document.getElementById(id);
    const els = {
        preview: el('themePreview'), marquee: el('previewMarquee'), header: el('previewHeader'),
        content: el('previewContent'), search: el('previewSearch'),
        catActive: el('previewCatActive'), catInactive: el('previewCatInactive'), catInactive2: el('previewCatInactive2'),
        card: el('previewCard'), card2: el('previewCard2'),
        price: el('previewPrice'), price2: el('previewPrice2'),
        addBtn: el('previewAddBtn'), addBtn2: el('previewAddBtn2'),
        button: el('previewButton'), bottomNav: el('previewBottomNav'),
        cartBadge: el('previewCartBadge'), label: el('previewLabel'),
        storeName: el('previewStoreName'), layoutBadge: el('previewLayoutBadge')
    };

    // === Aplicar estilos ===
    if (els.preview) {
        els.preview.style.borderColor = style.brand;
        els.preview.style.borderRadius = parseInt(style.radius) > 20 ? '28px' : style.radius;
    }
    if (els.marquee) {
        els.marquee.style.background = style.marquee;
        els.marquee.style.color = style.marqueeText;
        els.marquee.style.fontFamily = style.font + ', sans-serif';
    }
    if (els.header) {
        els.header.style.background = solidBg;
        els.header.style.color = style.text;
        els.header.style.fontFamily = style.font + ', sans-serif';
    }
    if (els.content) {
        els.content.style.background = style.bg;
        els.content.style.color = style.text;
        els.content.style.fontFamily = style.font + ', sans-serif';
    }
    if (els.search) {
        els.search.style.background = style.searchBg;
        els.search.style.color = style.text;
        els.search.style.borderRadius = style.radius;
        els.search.style.border = `1px ${borderVal} ${style.cardBorder}`;
    }
    // Category tabs
    if (els.catActive) {
        els.catActive.style.background = style.brand;
        els.catActive.style.color = style.btnText;
        els.catActive.style.borderRadius = style.radius;
    }
    [els.catInactive, els.catInactive2].forEach(cat => {
        if (cat) {
            cat.style.background = style.card;
            cat.style.color = style.text;
            cat.style.border = `1px solid ${style.cardBorder}`;
            cat.style.borderRadius = style.radius;
        }
    });
    // Product cards
    [els.card, els.card2].forEach(card => {
        if (card) {
            card.style.background = style.card;
            card.style.border = `2px ${borderVal} ${style.cardBorder}`;
            card.style.borderRadius = style.radius;
        }
    });
    // Prices
    if (els.price) els.price.style.color = style.brand;
    if (els.price2) els.price2.style.color = style.brand;
    // Add buttons
    [els.addBtn, els.addBtn2].forEach(btn => {
        if (btn) {
            btn.style.background = style.brand;
            btn.style.color = style.btnText;
        }
    });
    // CTA button
    if (els.button) {
        els.button.style.background = style.btnBg;
        els.button.style.color = style.btnText;
        els.button.style.borderRadius = style.radius;
        els.button.style.fontFamily = style.font + ', sans-serif';
    }
    // Bottom nav
    if (els.bottomNav) {
        els.bottomNav.style.background = solidBg;
        els.bottomNav.style.color = style.text;
        els.bottomNav.style.borderColor = style.cardBorder;
    }
    // Cart badge
    if (els.cartBadge) {
        els.cartBadge.style.background = style.brand;
        els.cartBadge.style.color = style.btnText;
    }
    // Store name & layout badge
    if (els.storeName) els.storeName.style.color = style.text;
    if (els.layoutBadge) {
        els.layoutBadge.innerText = layoutIcons[layoutLabel] || layoutIcons['grid'];
        els.layoutBadge.style.background = style.brand;
        els.layoutBadge.style.color = style.btnText;
    }
    // Theme label
    if (els.label) {
        els.label.style.background = solidBg;
        els.label.style.color = style.text;
        els.label.innerText = style.label + (isListVariant ? ' (Lista)' : '');
    }
}

function toggleLogoType() {
    const useImgInp = document.getElementById('logoTypeImage');
    const uploadSection = document.getElementById('logoUploadSection');
    if (uploadSection && useImgInp) {
        uploadSection.style.display = useImgInp.checked ? 'block' : 'none';
    }
}

function previewLogo(input) {
    const preview = document.getElementById('logoPreview');
    const placeholder = document.getElementById('logoPlaceholder');
    const sizeImg = document.getElementById('logoSizePreviewImg');
    const sizePlac = document.getElementById('logoSizePreviewPlaceholder');

    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.size > 2 * 1024 * 1024) {
            showToast('Imagem muito grande! Maximo: 2MB', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            if (preview) {
                preview.src = e.target.result;
                preview.style.display = 'block';
            }
            if (placeholder) placeholder.style.display = 'none';
            if (sizeImg) {
                sizeImg.src = e.target.result;
                sizeImg.style.display = 'block';
                const size = document.getElementById('logoSize')?.value || 100;
                sizeImg.style.maxHeight = size + 'px';
            }
            if (sizePlac) sizePlac.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }
}

function updateLogoSizePreview(size) {
    const lsv = document.getElementById('logoSizeValue');
    if (lsv) lsv.textContent = size + 'px';
    const sizeImg = document.getElementById('logoSizePreviewImg');
    if (sizeImg && sizeImg.src) sizeImg.style.maxHeight = size + 'px';
}

async function uploadLogo() {
    const fileInput = document.getElementById('logoFile');
    if (!fileInput?.files || !fileInput.files[0]) return null;

    const formData = new FormData();
    formData.append('image', fileInput.files[0]);

    try {
        const data = await apiFetch('/api/upload/image', {
            method: 'POST',
            body: formData
        });
        return data.url || data.path;
    } catch (e) {
        console.error('Erro upload logo:', e);
        showToast('Erro ao fazer upload da logo', 'error');
        return null;
    }
}

function toggleDayFolga(day, forceState = null) {
    const btn = document.getElementById(`btn-folga-${day}`);
    const openInput = document.getElementById(`${day}-open`);
    const closeInput = document.getElementById(`${day}-close`);
    if (!btn) return;

    const isCurrentlyActive = btn.classList.contains('active');
    const newState = forceState !== null ? forceState : !isCurrentlyActive;

    if (newState) {
        btn.classList.add('active');
        btn.innerText = 'FECHADO';
        btn.style.background = '#ef4444';
        btn.style.color = 'white';
        if (openInput) openInput.disabled = true;
        if (closeInput) closeInput.disabled = true;
    } else {
        btn.classList.remove('active');
        btn.innerText = 'FOLGA';
        btn.style.background = 'var(--bg)';
        btn.style.color = 'var(--text)';
        if (openInput) openInput.disabled = false;
        if (closeInput) closeInput.disabled = false;
    }
}

function selectOrderMode(mode) {
    const linkCard = document.getElementById('modeLinkCard');
    const directCard = document.getElementById('modeDirectCard');
    const aiCard = document.getElementById('modeAIEmployeeCard');
    const input = document.getElementById('selectedOrderMode');
    const badge = document.querySelector('.card-title span'); // O badge ao lado do título
    const hint = document.getElementById('modeHint');

    if (input) input.value = mode;

    const setCardState = (card, isActive) => {
        if (!card) return;
        card.style.background = isActive ? '#ffb800' : 'transparent';
        card.style.boxShadow = isActive ? '4px 4px 0 #1a1a1a' : 'none';
        card.classList.toggle('active', isActive);
    };

    setCardState(linkCard, mode === 'link');
    setCardState(directCard, mode === 'direct');
    setCardState(aiCard, mode === 'funcionario_ia');

    // Atualizar Badge
    if (badge) {
        if (mode === 'direct') {
            badge.textContent = 'HÍBRIDO';
            badge.style.background = '#10b981';
        } else if (mode === 'funcionario_ia') {
            badge.textContent = 'FUNCIONÁRIO IA';
            badge.style.background = 'linear-gradient(135deg, #8b5cf6, #d946ef)';
        } else {
            badge.textContent = 'LINK';
            badge.style.background = '#3b82f6';
        }
    }

    if (hint) {
        if (mode === 'link') hint.textContent = "Dica: O modo link é ideal para cardápios visuais e fotos grandes!";
        else if (mode === 'direct') hint.textContent = "Dica: O modo direto é mais rápido para clientes frequentes!";
        else if (mode === 'funcionario_ia') hint.textContent = "Dica: O Funcionário IA atende automaticamente pelo WhatsApp!";
    }
}

let backupFileContent = null;

async function exportBackup() {
    const passInp = document.getElementById('exportPassword');
    const password = passInp?.value;
    if (!password || password.length < 4) {
        showToast('Senha obrigatoria (minimo 4 caracteres)', 'error');
        return;
    }

    const btn = document.getElementById('btnExport');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exportando...';
        btn.disabled = true;
    }

    try {
        const response = await fetch(`/api/backup/export?password=${encodeURIComponent(password)}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Erro ao exportar');
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;

        // Tentar ler do Header, senao usar default
        let filename = 'backup.dhub';
        const disp = response.headers.get('Content-Disposition');
        if (disp && disp.includes('filename=')) {
            filename = disp.split('filename=')[1]?.replace(/"/g, '');
        }

        a.download = filename;
        document.body.appendChild(a);
        a.click();

        // Delay para garantir que o navegador capture antes de revogar da RAM (previne extensao corrompida)
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            a.remove();
        }, 1000);
        showToast('Backup exportado com sucesso!', 'success');
    } catch (e) {
        console.error(e);
        showToast(e.message || 'Erro ao exportar backup', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-download"></i> Baixar Backup';
            btn.disabled = false;
        }
    }
}

async function previewBackup() {
    const fileInput = document.getElementById('backupFile');
    const password = document.getElementById('importPassword')?.value;
    const file = fileInput?.files?.[0];
    if (!file) return;

    const bPre = document.getElementById('backupPreview');
    const bStats = document.getElementById('backupStats');
    const btnImp = document.getElementById('btnImport');

    // Se nao tiver senha, apenas carregar o arquivo e mostrar stats basicos
    const reader = new FileReader();
    reader.onload = async function (e) {
        backupFileContent = e.target.result;

        if (bPre) bPre.style.display = 'block';
        if (bStats) {
            bStats.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
                    <i class="fas fa-file-archive" style="font-size: 1.5rem; color: var(--secondary);"></i>
                    <div>
                        <div style="font-weight: 700;">${file.name}</div>
                        <div style="font-size: 0.75rem; opacity: 0.7;">${(file.size / 1024).toFixed(1)} KB</div>
                    </div>
                </div>
            `;
        }

        // Se tiver senha, tentar buscar preview real do backend
        if (password && password.length >= 4) {
            if (bStats) bStats.innerHTML += '<p id="previewLoading"><i class="fas fa-spinner fa-spin"></i> Lendo conteúdo do backup...</p>';
            try {
                const response = await apiFetch('/api/backup/preview', {
                    method: 'POST',
                    body: { encryptedData: backupFileContent, password }
                });

                if (response.success && response.preview) {
                    const p = response.preview;
                    const loading = document.getElementById('previewLoading');
                    if (loading) loading.remove();

                    bStats.innerHTML += `
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;">
                            <div style="background: var(--bg); padding: 8px; border-radius: 8px; border: 1px solid var(--border);">
                                <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Loja de Origem</div>
                                <div style="font-weight: 700;">${p.tenantName}</div>
                            </div>
                            <div style="background: var(--bg); padding: 8px; border-radius: 8px; border: 1px solid var(--border);">
                                <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Data de Exportação</div>
                                <div style="font-weight: 700;">${new Date(p.exportedAt).toLocaleDateString()}</div>
                            </div>
                        </div>
                        <div style="margin-top: 12px; font-size: 0.85rem;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span><i class="fas fa-tags"></i> Categorias</span>
                                <strong>${p.stats.categories}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span><i class="fas fa-box"></i> Produtos</span>
                                <strong>${p.stats.products}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span><i class="fas fa-image"></i> Imagens</span>
                                <strong>${p.stats.images}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span><i class="fas fa-shopping-basket"></i> Pedidos</span>
                                <strong>${p.stats.orders}</strong>
                            </div>
                        </div>
                        <p style="margin-top: 15px; font-size: 0.8rem; color: #16a34a; font-weight: 600;">
                            <i class="fas fa-check-circle"></i> Arquivo pronto para restaurar.
                        </p>
                    `;
                    if (btnImp) btnImp.disabled = false;
                }
            } catch (e) {
                const loading = document.getElementById('previewLoading');
                if (loading) loading.innerHTML = `<span style="color: var(--danger);"><i class="fas fa-exclamation-triangle"></i> Senha incorreta ou arquivo inválido.</span>`;
                if (btnImp) btnImp.disabled = true;
            }
        } else {
            if (bStats) bStats.innerHTML += '<p style="margin-top: 10px; font-size: 0.8rem; color: #f59e0b;"><i class="fas fa-key"></i> Insira a senha do backup para ver o conteúdo.</p>';
            if (btnImp) btnImp.disabled = true;
        }
    };
    reader.readAsText(file);
}

async function importBackup() {
    const passInp = document.getElementById('importPassword');
    const password = passInp?.value;
    if (!password) {
        showToast('Digite a senha do backup', 'error');
        return;
    }
    if (!backupFileContent) {
        showToast('Selecione um arquivo de backup', 'error');
        return;
    }

    const clearExisting = document.getElementById('clearExisting')?.classList.contains('active');
    if (clearExisting && !confirm('ATENCAO: Isso ira APAGAR dados existentes. Continuar?')) return;

    const btn = document.getElementById('btnImport');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restaurando...';
        btn.disabled = true;
    }

    try {
        const result = await apiFetch('/api/backup/import', {
            method: 'POST',
            body: { encryptedData: backupFileContent, password, clearExisting }
        });
        const bStats = document.getElementById('backupStats');
        if (bStats) {
            bStats.innerHTML = `
                <p style="color: #22c55e; font-weight: 700;"><i class="fas fa-check-circle"></i> Backup restaurado!</p>
                <p>Origem: <strong>${result.originalTenant}</strong></p>
                <p>Data: <strong>${new Date(result.exportedAt).toLocaleString()}</strong></p>
                <hr style="margin: 12px 0; border-color: var(--border);">
                <p>Categorias: <strong>${result.restored.categories}</strong></p>
                <p>Produtos: <strong>${result.restored.products}</strong></p>
            `;
        }
        showToast('Backup restaurado com sucesso!', 'success');
    } catch (e) {
        console.error(e);
        showToast(e.message || 'Erro ao restaurar backup', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-upload"></i> Restaurar Backup';
            btn.disabled = false;
        }
    }
}

function toggleGeminiKeyVisibility() {
    const input = document.getElementById('geminiApiKey');
    const icon = document.getElementById('geminiKeyEyeIcon');
    if (input && icon) {
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye';
        }
    }
}

async function loadAISettings() {
    try {
        const settings = currentSettings.aiReinforcement || {};
        const logToggle = document.querySelector('#toggle-ai-logging .toggle-switch');
        const dayToggle = document.querySelector('#toggle-ai-daily .toggle-switch');
        const autoToggle = document.querySelector('#toggle-ai-autoapply .toggle-switch');

        if (settings.loggingEnabled !== false) logToggle?.classList.add('active');
        else logToggle?.classList.remove('active');
        if (settings.dailyAnalysisEnabled) dayToggle?.classList.add('active');
        else dayToggle?.classList.remove('active');
        if (settings.autoApplyLessons) autoToggle?.classList.add('active');
        else autoToggle?.classList.remove('active');

        const gKey = document.getElementById('geminiApiKey');
        const gMod = document.getElementById('geminiModel');
        if (gKey) gKey.value = settings.geminiApiKey || '';
        if (gMod) gMod.value = settings.geminiModel || 'gemini-1.5-flash';

        updateAIStatus(settings);
    } catch (e) {
        console.error('Erro ao carregar config IA:', e);
    }
}

function updateAIStatus(settings) {
    const logEl = document.getElementById('aiLoggingStatus');
    const gemEl = document.getElementById('aiGeminiStatus');
    const msgEl = document.getElementById('aiMessagesCount');
    const penEl = document.getElementById('aiPendingCount');

    if (logEl) logEl.textContent = settings.loggingEnabled !== false ? '✅' : '❌';
    if (gemEl) gemEl.textContent = settings.geminiApiKey ? '✅' : '⚠️';
    if (msgEl) msgEl.textContent = settings.stats?.messages || '-';
    if (penEl) penEl.textContent = settings.stats?.pending || '-';
}

async function saveAISettings() {
    try {
        const logEnabled = document.querySelector('#toggle-ai-logging .toggle-switch')?.classList.contains('active');
        const dayEnabled = document.querySelector('#toggle-ai-daily .toggle-switch')?.classList.contains('active');
        const autoApply = document.querySelector('#toggle-ai-autoapply .toggle-switch')?.classList.contains('active');
        const apiKey = document.getElementById('geminiApiKey')?.value.trim();
        const model = document.getElementById('geminiModel')?.value;

        if (dayEnabled && !apiKey) {
            showToast('Para ativar análise diária, configure a chave API do Gemini', 'error');
            return;
        }

        currentSettings.aiReinforcement = {
            loggingEnabled: logEnabled,
            dailyAnalysisEnabled: dayEnabled,
            autoApplyLessons: autoApply,
            geminiApiKey: apiKey,
            geminiModel: model
        };

        await apiFetch(`/api/tenants/${currentTenantId}`, {
            method: 'PUT',
            body: { settings: currentSettings }
        });

        updateAIStatus(currentSettings.aiReinforcement);
        showToast('Configurações de IA salvas!', 'success');
    } catch (e) {
        console.error('Erro ao salvar config IA:', e);
        showToast('Erro ao salvar configurações', 'error');
    }
}

async function testGeminiKey() {
    const apiKey = document.getElementById('geminiApiKey')?.value.trim();
    if (!apiKey) {
        showToast('Digite uma chave API primeiro', 'error');
        return;
    }
    showToast('Testando conexão...', 'info');

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (response.ok) {
            const data = await response.json();
            const models = data.models?.map(m => m.name.split('/').pop()).filter(m => m.startsWith('gemini-') && !m.includes('vision') && !m.includes('embedding')).join(', ');
            showToast(`✅ Conexão OK! Modelos: ${models}`, 'success');
            const gStatus = document.getElementById('aiGeminiStatus');
            if (gStatus) gStatus.textContent = '✅';
        } else {
            const err = await response.json();
            showToast(`❌ Erro: ${err.error?.message || 'Chave inválida'}`, 'error');
            const gStatus = document.getElementById('aiGeminiStatus');
            if (gStatus) gStatus.textContent = '❌';
        }
    } catch (e) {
        showToast('Erro de rede ao testar', 'error');
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('storeTheme')?.addEventListener('change', updateThemePreview);

    // Trigger preview when password changes if a file is already selected
    document.getElementById('importPassword')?.addEventListener('input', () => {
        const fileInput = document.getElementById('backupFile');
        if (fileInput?.files?.length > 0) {
            previewBackup();
        }
    });

    init();
});
