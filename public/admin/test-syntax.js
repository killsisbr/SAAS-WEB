const token=localStorage.getItem('token');
        if ( !token) window.location.href='/login';

        // Extrair slug da URL para contexto do tenant
        const TENANT_SLUG=window.location.pathname.split('/loja/')[1]?.split('/')[0] || '';
        let currentTenantId=null;

        let currentSettings= {}

        ;
        let deliveryZones=[];

        async function saveDeliverySettings() {
            if ( !currentTenantId) {
                showToast('Tenant nao carregado', 'error');
                return;
            }

            const btn=event.target;
            const originalText=btn.innerHTML;
            btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvando...';
            btn.disabled=true;

            try {
                // Verificar toggle de retirada
                const pickupToggle=document.querySelector('#toggle-pickup .toggle-switch');
                const allowPickup=pickupToggle ? pickupToggle.classList.contains('active'): true;

                // Ordenar zonas por km antes de salvar
                const sortedZones=[...deliveryZones].sort((a, b)=> (parseFloat(a.maxKm) || 0) - (parseFloat(b.maxKm) || 0));

                const newSettings= {
                    ...currentSettings,
                    storeLat: parseFloat(document.getElementById('storeLat').value) || null,
                        storeLng: parseFloat(document.getElementById('storeLng').value) || null,
                        minOrder: parseFloat(document.getElementById('minOrder').value) || 0,
                        deliveryFee: parseFloat(document.getElementById('deliveryFee').value) || 0,
                        deliveryZones: sortedZones,
                        allow_pickup: allowPickup
                }

                ;

                const data=await apiFetch(`/api/tenants/${currentTenantId}`, {

                    method: 'PUT',
                    body: {
                        settings: newSettings
                    }
                });

            currentSettings=newSettings;
            showToast('Configuracoes de entrega salvas!', 'success');
        }

        catch (e) {
            console.error(e);
            showToast(e.message || 'Erro ao salvar', 'error');
        }

        finally {
            btn.innerHTML=originalText;
            btn.disabled=false;
        }
        }

        // Salvar configuracoes de pagamento (PIX)
        async function savePaymentSettings() {
            if ( !currentTenantId) {
                showToast('Tenant nao carregado', 'error');
                return;
            }

            const btn=event.target;
            const originalText=btn.innerHTML;
            btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvando...';
            btn.disabled=true;

            try {
                const pixHolderName=document.getElementById('pixHolderName')?.value || '';
                const pixKey=document.getElementById('pixKey')?.value || '';

                // Coletar estados dos toggles
                const acceptCash=document.querySelector('#toggle-pay-cash .toggle-switch')?.classList.contains('active') !==false;
                const acceptPix=document.querySelector('#toggle-pay-pix .toggle-switch')?.classList.contains('active') !==false;
                const acceptCard=document.querySelector('#toggle-pay-card .toggle-switch')?.classList.contains('active') !==false;

                const newSettings= {
                    ...currentSettings,
                    pix_holder_name: pixHolderName,
                        pix_key: pixKey,
                        acceptCash,
                        acceptPix,
                        acceptCard
                }

                ;

                const data=await apiFetch(`/api/tenants/${currentTenantId}`, {

                    method: 'PUT',
                    body: {
                        settings: newSettings
                    }
                });

            currentSettings=newSettings;
            showToast('Configuracoes de pagamento salvas!', 'success');
        }

        catch (e) {
            console.error(e);
            showToast(e.message || 'Erro ao salvar', 'error');
        }

        finally {
            btn.innerHTML=originalText;
            btn.disabled=false;
        }
        }

        function renderDeliveryZones() {
            const container=document.getElementById('deliveryZonesList');

            if (deliveryZones.length===0) {
                container.innerHTML='<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: var(--text-muted); background: var(--bg); border-radius: 12px; border: 2px dashed var(--border);">Nenhuma zona de entrega configurada</div>';
                return;
            }

            container.innerHTML=deliveryZones.map((zone, index)=> ` <div style="background: var(--bg); border: 2px solid var(--border); border-radius: 12px; padding: 16px; position: relative;" > <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 8px;" >RAIO DA ZONA</div> <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;" > <input type="number" step="0.1" value="${zone.maxKm}" onchange="updateZone(${index}, 'maxKm', this.value)" style="flex: 1; padding: 8px; border: 2px solid var(--border); border-radius: 8px; font-weight: 700;" > <span style="font-weight: 700;" >KM</span> </div> <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 8px;" >VALOR DA ENTREGA</div> <div style="display: flex; align-items: center; gap: 8px;" > <span style="font-weight: 700;" >R$</span> <input type="number" step="0.01" value="${zone.fee}" onchange="updateZone(${index}, 'fee', this.value)" style="flex: 1; padding: 8px; border: 2px solid var(--border); border-radius: 8px; font-weight: 700; color: var(--primary);" > </div> <button onclick="removeZone(${index})" style="position: absolute; top: -10px; right: -10px; background: var(--danger); color: white; border: 2px solid var(--dark); border-radius: 50%; width: 24px; height: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.7rem;" > <i class="fas fa-times" ></i> </button> </div> `).join('');
        }

        function addZone() {
            const lastKm=deliveryZones.length>0 ? parseFloat(deliveryZones[deliveryZones.length - 1].maxKm): 0;
            const newMaxKm=Math.round((lastKm + 2.0) * 10) / 10;

            deliveryZones.push({
                maxKm: newMaxKm, fee: 7
            });
        renderDeliveryZones();
        }

        function updateZone(index, field, value) {
            deliveryZones[index][field]=parseFloat(value) || 0;
        }

        function removeZone(index) {
            deliveryZones.splice(index, 1);
            renderDeliveryZones();
        }

        function getMyLocation() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((position)=> {
                        document.getElementById('storeLat').value=position.coords.latitude.toFixed(6);
                        document.getElementById('storeLng').value=position.coords.longitude.toFixed(6);
                        showToast('Localizacao obtida com sucesso!', 'success');
                    }

                    ,
                    (error)=> {
                        showToast('Erro ao obter localizacao: ' + error.message, 'error');
                    });
            }

            else {
                showToast('Seu navegador nao suporta geolocalizacao', 'error');
            }
        }

        function switchTab(tabId) {
            document.querySelectorAll('.tab').forEach(t=> t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t=> t.classList.remove('active'));
            const buttons=document.querySelectorAll('.tab');

            for (let btn of buttons) {
                if (btn.onclick.toString().includes(tabId)) {
                    btn.classList.add('active');
                    break;
                }
            }

            const content=document.getElementById(`tab-${tabId}`);
            if (content) content.classList.add('active');
        }

        function toggleSwitch(el) {
            el.querySelector('.toggle-switch').classList.toggle('active');
        }

        async function init() {
            const data=await initStoreInfo();

            if (data && data.tenant) {
                currentTenantId=data.tenant.id;

                currentSettings=data.tenant.settings || {}

                ;

                // Preencher campos ja existentes
                document.getElementById('storeName').value=data.tenant.name || '';
                document.getElementById('storePhone').value=currentSettings.phone || '';
                document.getElementById('storeWhatsapp').value=currentSettings.whatsapp || '';
                document.getElementById('storeAddress').value=currentSettings.address || '';

                // Dados do usuario
                document.getElementById('userName').value=data.user?.name || '';
                document.getElementById('userEmail').value=data.user?.email || '';

                // Toggle loja aberta
                const openToggle=document.querySelector('#toggle-store-open .toggle-switch');

                if (openToggle && currentSettings.isOpen) {
                    openToggle.classList.add('active');
                }

                // Carregar horarios de funcionamento
                const schedule=currentSettings.schedule || {}

                ;
                const days=['seg',
                'ter',
                'qua',
                'qui',
                'sex',
                'sab',
                'dom'];

                days.forEach(day=> {
                        const daySchedule=schedule[day] || {}

                        ;

                        if (document.getElementById(`${day}-open`)) {
                            document.getElementById(`${day}-open`).value=daySchedule.open || '';

                            document.getElementById(`${day}-close`).value=daySchedule.close || '';

                            if (daySchedule.closed) {
                                toggleDayFolga(day, true);
                            }
                        }
                    });

                // Carregar barra de anuncios
                const announcementToggle=document.querySelector('#toggle-announcement .toggle-switch');

                if (announcementToggle && currentSettings.announcementEnabled) {
                    announcementToggle.classList.add('active');
                }

                document.getElementById('announcementText').value=currentSettings.announcementText || '';

                // Carregar texto do marquee/actionbar
                const marqueeToggle=document.querySelector('#toggle-marquee .toggle-switch');

                if (marqueeToggle && currentSettings.marqueeEnabled !==false) {
                    marqueeToggle.classList.add('active');
                }

                if (document.getElementById('marqueeText')) {
                    document.getElementById('marqueeText').value=currentSettings.marqueeText || '';
                }

                // Carregar configuracoes de entrega
                document.getElementById('storeLat').value=currentSettings.storeLat || '';
                document.getElementById('storeLng').value=currentSettings.storeLng || '';
                document.getElementById('minOrder').value=currentSettings.minOrder || '';
                document.getElementById('deliveryFee').value=currentSettings.deliveryFee || '';

                // Carregar zonas de entrega
                deliveryZones=currentSettings.deliveryZones || [];
                renderDeliveryZones();

                // Inicializar toggle de retirada
                const pickupToggle=document.querySelector('#toggle-pickup .toggle-switch');

                if (pickupToggle && currentSettings.allow_pickup !==false) {
                    pickupToggle.classList.add('active');
                }

                // Carregar dados do PIX
                if (document.getElementById('pixHolderName')) {
                    document.getElementById('pixHolderName').value=currentSettings.pix_holder_name || '';
                }

                if (document.getElementById('pixKey')) {
                    document.getElementById('pixKey').value=currentSettings.pix_key || '';
                }

                // Carregar toggles de pagamento
                const cashToggle=document.querySelector('#toggle-pay-cash .toggle-switch');
                if (cashToggle && currentSettings.acceptCash !==false) cashToggle.classList.add('active');

                const pixToggle=document.querySelector('#toggle-pay-pix .toggle-switch');
                if (pixToggle && currentSettings.acceptPix !==false) pixToggle.classList.add('active');

                const cardToggle=document.querySelector('#toggle-pay-card .toggle-switch');
                if (cardToggle && currentSettings.acceptCard !==false) cardToggle.classList.add('active');

                // Carregar tema salvo
                const themeSelect=document.getElementById('storeTheme');

                if (themeSelect && currentSettings.storeTheme) {
                    themeSelect.value=currentSettings.storeTheme;
                    updateThemePreview();
                }

                // Carregar logo salva
                if (currentSettings.logoType==='image') {
                    document.getElementById('logoTypeImage').checked=true;
                    document.getElementById('logoUploadSection').style.display='block';

                    if (currentSettings.logoUrl) {
                        const preview=document.getElementById('logoPreview');
                        const placeholder=document.getElementById('logoPlaceholder');
                        const sizePreviewImg=document.getElementById('logoSizePreviewImg');
                        const sizePreviewPlaceholder=document.getElementById('logoSizePreviewPlaceholder');

                        preview.src=currentSettings.logoUrl;
                        preview.style.display='block';
                        placeholder.style.display='none';

                        if (sizePreviewImg) {
                            sizePreviewImg.src=currentSettings.logoUrl;
                            sizePreviewImg.style.display='block';
                        }

                        if (sizePreviewPlaceholder) {
                            sizePreviewPlaceholder.style.display='none';
                        }
                    }

                    const savedSize=currentSettings.logoSize || 100;
                    document.getElementById('logoSize').value=savedSize;
                    document.getElementById('logoSizeValue').textContent=savedSize+'px';
                    const sizePreviewImg=document.getElementById('logoSizePreviewImg');

                    if (sizePreviewImg) {
                        sizePreviewImg.style.maxHeight=savedSize+'px';
                    }
                }

                else {
                    document.getElementById('logoTypeText').checked=true;
                }

                // Carregar modo de pedido
                const isDirect=currentSettings.enableDirect !==false;
                selectOrderMode(isDirect ? 'direct' : 'link');

                loadAISettings();
            }
        }

        // Salvar dados da loja
        async function saveStoreData() {
            if ( !currentTenantId) {
                alert('Tenant nao carregado');
                return;
            }

            const btn=event.target;
            const originalText=btn.innerHTML;
            btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvando...';
            btn.disabled=true;

            try {
                // Atualizar nome da loja
                const name=document.getElementById('storeName').value;

                // Coletar horarios de funcionamento
                const scheduleDays=['seg',
                'ter',
                'qua',
                'qui',
                'sex',
                'sab',
                'dom'];

                const schedule= {}

                ;

                scheduleDays.forEach(day=> {
                        const btnFolga=document.getElementById(`btn-folga-${day}`);

                        schedule[day]= {
                            open: document.getElementById(`${day}-open`)?.value || '',
                            close: document.getElementById(`${day}-close`)?.value || '',
                            closed: btnFolga?.classList.contains('active') || false
                        }

                        ;
                    });

                // Logo settings
                const logoType=document.getElementById('logoTypeImage').checked ? 'image' : 'text';
                let logoUrl=currentSettings.logoUrl || '';

                // Upload da logo se necessario
                if (logoType==='image') {
                    const fileInput=document.getElementById('logoFile');

                    if (fileInput.files && fileInput.files[0]) {
                        const uploadedUrl=await uploadLogo();

                        if (uploadedUrl) {
                            logoUrl=uploadedUrl;
                        }
                    }
                }

                // Atualizar settings
                const newSettings= {
                    ...currentSettings,
                    phone: document.getElementById('storePhone').value,
                        whatsapp: document.getElementById('storeWhatsapp').value,
                        address: document.getElementById('storeAddress').value,
                        isOpen: document.querySelector('#toggle-store-open .toggle-switch')?.classList.contains('active') || false,
                        schedule: schedule,
                        announcementEnabled: document.querySelector('#toggle-announcement .toggle-switch')?.classList.contains('active') || false,
                        announcementText: document.getElementById('announcementText').value,
                        marqueeEnabled: document.querySelector('#toggle-marquee .toggle-switch')?.classList.contains('active') ?? true,
                        marqueeText: document.getElementById('marqueeText')?.value || '',
                        logoType: logoType,
                        logoUrl: logoUrl,
                        logoSize: parseInt(document.getElementById('logoSize')?.value) || 100,
                        // Novo setting
                        enableDirect: document.getElementById('selectedOrderMode').value==='direct',
                }

                ;

                const data=await apiFetch(`/api/tenants/${currentTenantId}`, {

                    method: 'PUT',
                    body: {
                        name, settings: newSettings
                    }
                });

            currentSettings=newSettings;
            showToast('Configuracoes salvas com sucesso!', 'success');
        }

        catch (e) {
            console.error(e);
            showToast(e.message || 'Erro ao salvar configuracoes', 'error');
        }

        finally {
            btn.innerHTML=originalText;
            btn.disabled=false;
        }
        }

        // Salvar tema visual da loja
        async function saveTheme() {
            if ( !currentTenantId) {
                alert('Tenant nao carregado');
                return;
            }

            const btn=event.target;
            const originalText=btn.innerHTML;
            btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvando...';
            btn.disabled=true;

            try {
                const selectedTheme=document.getElementById('storeTheme').value;

                const newSettings= {
                    ...currentSettings,
                    storeTheme: selectedTheme
                }

                ;

                const data=await apiFetch(`/api/tenants/${currentTenantId}`, {

                    method: 'PUT',
                    body: {
                        settings: newSettings
                    }
                });

            currentSettings=newSettings;
            showToast('Tema salvo com sucesso!', 'success');
        }

        catch (e) {
            console.error(e);
            showToast(e.message || 'Erro ao salvar tema', 'error');
        }

        finally {
            btn.innerHTML=originalText;
            btn.disabled=false;
        }
        }

        // Atualizar preview do tema
        function updateThemePreview() {
            const theme=document.getElementById('storeTheme').value;

            // Configuracoes de cores por tema
            const themeStyles= {
                'retro': {
                    bg: '#fff9f0', text: '#1a1a1a', brand: '#d9432e', card: '#ffffff',
                        cardBorder: '#1a1a1a', btnBg: '#d9432e', btnText: '#ffffff',
                        label: 'Tema Retro'
                }

                ,
                'midnight': {
                    bg: '#0a0a0f', text: '#ffffff', brand: '#6366f1', card: '#1a1a2e',
                        cardBorder: '#333355', btnBg: '#6366f1', btnText: '#ffffff',
                        label: 'Tema Midnight'
                }

                ,
                'vibe': {
                    bg: '#0f0f2e', text: '#ffffff', brand: '#f472b6', card: '#1e1e4a',
                        cardBorder: '#3d3d7a', btnBg: '#f472b6', btnText: '#0f0f2e',
                        label: 'Tema Vibe'
                }

                ,
                'doodle': {
                    bg: '#f5f5f5', text: '#333333', brand: '#ff6b6b', card: '#ffffff',
                        cardBorder: '#333333', btnBg: '#ff6b6b', btnText: '#ffffff',
                        label: 'Tema Doodle'
                }

                ,
                'luxury': {
                    bg: '#0d0d0d', text: '#d4af37', brand: '#d4af37', card: '#1a1a1a',
                        cardBorder: '#d4af37', btnBg: '#d4af37', btnText: '#0d0d0d',
                        label: 'Tema Luxury'
                }

                ,
                'matrix': {
                    bg: '#0a0a0a', text: '#00ff00', brand: '#00ff00', card: '#0d1a0d',
                        cardBorder: '#00ff00', btnBg: '#00ff00', btnText: '#0a0a0a',
                        label: 'Tema Matrix'
                }

                ,
                'candy': {
                    bg: '#ffd6e0', text: '#ff4081', brand: '#ff4081', card: '#ffffff',
                        cardBorder: '#ff4081', btnBg: '#ff4081', btnText: '#ffffff',
                        label: 'Tema Candy'
                }
            }

            ;

            const style=themeStyles[theme] || themeStyles['retro'];

            // Atualizar elementos do preview
            const preview=document.getElementById('themePreview');
            const header=document.getElementById('previewHeader');
            const content=document.getElementById('previewContent');
            const card=document.getElementById('previewCard');
            const button=document.getElementById('previewButton');
            const label=document.getElementById('previewLabel');
            const price=document.getElementById('previewPrice');
            const storeName=document.getElementById('previewStoreName');

            if (preview) {
                preview.style.borderColor=style.brand;
            }

            if (header) {
                header.style.background=style.brand;
                header.style.color=style.btnText;
            }

            if (content) {
                content.style.background=style.bg;
                content.style.color=style.text;
            }

            if (card) {
                card.style.background=style.card;

                card.style.border=`2px solid ${style.cardBorder}`;
            }

            if (button) {
                button.style.background=style.btnBg;
                button.style.color=style.btnText;
            }

            if (label) {
                label.style.background=style.bg;
                label.style.color=style.text;
                label.innerText=style.label;
            }

            if (price) {
                price.style.color=style.brand;
            }

            if (storeName) {
                storeName.style.color=style.btnText;
            }
        }

        // ===== LOGO FUNCTIONS =====
        function toggleLogoType() {
            const useImage=document.getElementById('logoTypeImage').checked;
            const uploadSection=document.getElementById('logoUploadSection');

            if (uploadSection) {
                uploadSection.style.display=useImage ? 'block': 'none';
            }
        }

        function previewLogo(input) {
            const preview=document.getElementById('logoPreview');
            const placeholder=document.getElementById('logoPlaceholder');
            const sizePreviewImg=document.getElementById('logoSizePreviewImg');
            const sizePreviewPlaceholder=document.getElementById('logoSizePreviewPlaceholder');

            if (input.files && input.files[0]) {
                const file=input.files[0];

                // Validar tamanho (max 2MB)
                if (file.size > 2 * 1024 * 1024) {
                    showToast('Imagem muito grande! Maximo: 2MB', 'error');
                    return;
                }

                const reader=new FileReader();

                reader.onload=function (e) {
                    preview.src=e.target.result;
                    preview.style.display='block';
                    placeholder.style.display='none';

                    // Atualizar preview de tamanho
                    if (sizePreviewImg) {
                        sizePreviewImg.src=e.target.result;
                        sizePreviewImg.style.display='block';
                        const size=document.getElementById('logoSize').value;
                        sizePreviewImg.style.maxHeight=size+'px';
                    }

                    if (sizePreviewPlaceholder) {
                        sizePreviewPlaceholder.style.display='none';
                    }
                }

                reader.readAsDataURL(file);
            }
        }

        function updateLogoSizePreview(size) {
            document.getElementById('logoSizeValue').textContent=size+'px';
            const sizePreviewImg=document.getElementById('logoSizePreviewImg');

            if (sizePreviewImg && sizePreviewImg.src) {
                sizePreviewImg.style.maxHeight=size+'px';
            }
        }

        async function uploadLogo() {
            const fileInput=document.getElementById('logoFile');

            if ( !fileInput.files || !fileInput.files[0]) {
                return null;
            }

            const formData=new FormData();
            formData.append('image', fileInput.files[0]);

            try {
                const data=await apiFetch('/api/upload/image', {
                    method: 'POST',
                    body: formData
                });
            return data.url || data.path;
        }

        catch (e) {
            console.error('Erro upload logo:', e);
            showToast('Erro ao fazer upload da logo', 'error');
            return null;
        }
        }

        // ===== DAY-OFF FUNCTIONS =====
        function toggleDayFolga(day, forceState=null) {
            const btn=document.getElementById(`btn-folga-${day}`);

            const openInput=document.getElementById(`${day}-open`);

            const closeInput=document.getElementById(`${day}-close`);
            if ( !btn) return;

            const isCurrentlyActive=btn.classList.contains('active');
            const newState=forceState !==null ? forceState : !isCurrentlyActive;

            if (newState) {
                btn.classList.add('active');
                btn.innerText='FECHADO';
                btn.style.background='#ef4444';
                btn.style.color='white';
                if (openInput) openInput.disabled=true;
                if (closeInput) closeInput.disabled=true;
            }

            else {
                btn.classList.remove('active');
                btn.innerText='FOLGA';
                btn.style.background='var(--bg)';
                btn.style.color='var(--text)';
                if (openInput) openInput.disabled=false;
                if (closeInput) closeInput.disabled=false;
            }
        }

        // ===== ORDER MODE FUNCTION =====
        function selectOrderMode(mode) {
            const linkCard=document.getElementById('modeLinkCard');
            const directCard=document.getElementById('modeDirectCard');
            const input=document.getElementById('selectedOrderMode');
            const hint=document.getElementById('modeHint');

            // Reset styles
            const inactiveStyle="background: transparent; border-color: #1a1a1a; box-shadow: none;";
            const activeStyle="background: #ffb800; border-color: #1a1a1a; box-shadow: 4px 4px 0 #1a1a1a;";
            // Direct active is white background? Or green? Let's use user screenshot style.
            // Screenshot: Link is Yellow (Primary/Secondary). Direct is White.
            // When Direct is active, maybe make it green?
            // User screenshot shows 'Modo Link' selected and yellow. 'Modo Direto' is white.

            input.value=mode;

            if (mode==='link') {
                linkCard.style.cssText=linkCard.getAttribute('style')+activeStyle;
                directCard.style.cssText=directCard.getAttribute('style')+inactiveStyle;
                // Highlight text color?
                hint.textContent="Dica: O modo link é ideal para cardápios visuais e fotos grandes!";
            }

            else {
                linkCard.style.cssText=linkCard.getAttribute('style')+inactiveStyle;
                // Make Direct Green when active? Or keeping yellow theme?
                // Let's stick to yellow highlight for consistency, or maybe green since it's "Whatsapp".
                // Screenshot used yellow for Link. I'll use Green for Direct to differentiate or Yellow for active.
                // Let's use Yellow for active constant.
                directCard.style.cssText=directCard.getAttribute('style')+activeStyle;
                hint.textContent="Dica: O modo direto é mais rápido para clientes frequentes!";
            }
        }

        // Event listener para preview do tema
        document.getElementById('storeTheme')?.addEventListener('change', updateThemePreview);

        async function saveDeliverySettings() {
            if ( !currentTenantId) {
                alert('Tenant nao carregado');
                return;
            }

            const btn=event.target;
            const originalText=btn.innerHTML;
            btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvando...';
            btn.disabled=true;

            try {
                // Verificar toggle de retirada
                const pickupToggle=document.querySelector('#toggle-pickup .toggle-switch');
                const allowPickup=pickupToggle ? pickupToggle.classList.contains('active'): true;

                // Ordenar zonas por km antes de salvar
                const sortedZones=[...deliveryZones].sort((a, b)=> (parseFloat(a.maxKm) || 0) - (parseFloat(b.maxKm) || 0));

                const newSettings= {
                    ...currentSettings,
                    storeLat: parseFloat(document.getElementById('storeLat').value) || null,
                        storeLng: parseFloat(document.getElementById('storeLng').value) || null,
                        minOrder: parseFloat(document.getElementById('minOrder').value) || 0,
                        deliveryFee: parseFloat(document.getElementById('deliveryFee').value) || 0,
                        deliveryZones: sortedZones,
                        allow_pickup: allowPickup
                }

                ;

                const data=await apiFetch(`/api/tenants/${currentTenantId}`, {

                    method: 'PUT',
                    body: {
                        settings: newSettings
                    }
                });

            currentSettings=newSettings;
            showToast('Configuracoes de entrega salvas!', 'success');
        }

        catch (e) {
            console.error(e);
            showToast(e.message || 'Erro ao salvar', 'error');
        }

        finally {
            btn.innerHTML=originalText;
            btn.disabled=false;
        }
        }

        // Salvar configuracoes de pagamento (PIX)
        async function savePaymentSettings() {
            if ( !currentTenantId) {
                alert('Tenant nao carregado');
                return;
            }

            const btn=event.target;
            const originalText=btn.innerHTML;
            btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvando...';
            btn.disabled=true;

            try {
                const pixHolderName=document.getElementById('pixHolderName')?.value || '';
                const pixKey=document.getElementById('pixKey')?.value || '';

                // Coletar estados dos toggles
                const acceptCash=document.querySelector('#toggle-pay-cash .toggle-switch')?.classList.contains('active') !==false;
                const acceptPix=document.querySelector('#toggle-pay-pix .toggle-switch')?.classList.contains('active') !==false;
                const acceptCard=document.querySelector('#toggle-pay-card .toggle-switch')?.classList.contains('active') !==false;

                const newSettings= {
                    ...currentSettings,
                    pix_holder_name: pixHolderName,
                        pix_key: pixKey,
                        acceptCash,
                        acceptPix,
                        acceptCard
                }

                ;

                const data=await apiFetch(`/api/tenants/${currentTenantId}`, {

                    method: 'PUT',
                    body: {
                        settings: newSettings
                    }
                });

            currentSettings=newSettings;
            showToast('Configuracoes de pagamento salvas!', 'success');
        }

        catch (e) {
            console.error(e);
            showToast(e.message || 'Erro ao salvar', 'error');
        }

        finally {
            btn.innerHTML=originalText;
            btn.disabled=false;
        }
        }

        // showToast is now handled by shared.js

        // ========================================
        // BACKUP FUNCTIONS
        // ========================================

        let backupFileContent=null;

        async function exportBackup() {
            const password=document.getElementById('exportPassword').value;

            if ( !password || password.length < 4) {
                showToast('Senha obrigatoria (minimo 4 caracteres)', 'error');
                return;
            }

            const btn=document.getElementById('btnExport');
            btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Exportando...';
            btn.disabled=true;

            try {
                const response=await fetch(`/api/backup/export?password=${encodeURIComponent(password)}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });

            if ( !response.ok) {
                const err=await response.json();
                throw new Error(err.error || 'Erro ao exportar');
            }

            // Baixar arquivo
            const blob=await response.blob();
            const url=window.URL.createObjectURL(blob);
            const a=document.createElement('a');
            a.href=url;
            a.download=response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'backup.dhub';
 document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();

                showToast('Backup exportado com sucesso!', 'success');
            }

            catch (e) {
                console.error(e);
                showToast(e.message || 'Erro ao exportar backup', 'error');
            }

            finally {
                btn.innerHTML='<i class="fas fa-download"></i> Baixar Backup';
                btn.disabled=false;
            }
        }

        async function previewBackup() {
            const fileInput=document.getElementById('backupFile');
            const file=fileInput.files[0];
            if ( !file) return;

            const reader=new FileReader();

            reader.onload=function (e) {
                backupFileContent=e.target.result;
                document.getElementById('btnImport').disabled=false;
                document.getElementById('backupPreview').style.display='block';

                document.getElementById('backupStats').innerHTML=` <p style="color: var(--text-muted);" >Arquivo carregado: <strong>${file.name}

                </strong></p> <p style="color: var(--text-muted);" >Tamanho: <strong>${
                    (file.size / 1024).toFixed(1)
                }

                KB</strong></p> <p style="margin-top: 8px; font-size: 0.9rem;" >Digite a senha e clique em "Restaurar Backup" para continuar.</p> `;
            }

            ;
            reader.readAsText(file);
        }

        async function importBackup() {
            const password=document.getElementById('importPassword').value;

            if ( !password) {
                showToast('Digite a senha do backup', 'error');
                return;
            }

            if ( !backupFileContent) {
                showToast('Selecione um arquivo de backup', 'error');
                return;
            }

            const clearExisting=document.getElementById('clearExisting').classList.contains('active');

            if (clearExisting) {
                if ( !confirm('ATENCAO: Isso ira APAGAR todos os produtos e categorias existentes antes de restaurar. Deseja continuar?')) {
                    return;
                }
            }

            const btn=document.getElementById('btnImport');
            btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Restaurando...';
            btn.disabled=true;

            try {
                const result=await apiFetch('/api/backup/import', {

                    method: 'POST',
                    body: JSON.stringify({
                        encryptedData: backupFileContent,
                        password,
                        clearExisting
                    })
            });

        document.getElementById('backupStats').innerHTML=` <p style="color: #22c55e; font-weight: 700;" ><i class="fas fa-check-circle" ></i> Backup restaurado !</p> <p>Origem: <strong>${result.originalTenant}

        </strong></p> <p>Data do backup: <strong>${
            new Date(result.exportedAt).toLocaleString()
        }

        </strong></p> <hr style="margin: 12px 0; border-color: var(--border);" > <p>Categorias restauradas: <strong>${result.restored.categories}

        </strong></p> <p>Produtos restaurados: <strong>${result.restored.products}

        </strong></p> <p>Itens buffet: <strong>${result.restored.buffetItems}

        </strong></p> <p>Adicionais acai: <strong>${result.restored.acaiAdicionais}

        </strong></p> `;

        showToast('Backup restaurado com sucesso!', 'success');
        }

        catch (e) {
            console.error(e);
            showToast(e.message || 'Erro ao restaurar backup', 'error');
        }

        finally {
            btn.innerHTML='<i class="fas fa-upload"></i> Restaurar Backup';
            btn.disabled=false;
        }
        }

        // ============================================================
        // FUNÇÕES DE IA / MELHORIAS
        // ============================================================

        function toggleGeminiKeyVisibility() {
            const input=document.getElementById('geminiApiKey');
            const icon=document.getElementById('geminiKeyEyeIcon');

            if (input.type==='password') {
                input.type='text';
                icon.className='fas fa-eye-slash';
            }

            else {
                input.type='password';
                icon.className='fas fa-eye';
            }
        }

        async function loadAISettings() {
            try {
                const settings=currentSettings.aiReinforcement || {}

                ;

                // Preencher toggles
                const loggingToggle=document.querySelector('#toggle-ai-logging .toggle-switch');
                const dailyToggle=document.querySelector('#toggle-ai-daily .toggle-switch');
                const autoApplyToggle=document.querySelector('#toggle-ai-autoapply .toggle-switch');

                if (settings.loggingEnabled !==false) loggingToggle?.classList.add('active');
                else loggingToggle?.classList.remove('active');

                if (settings.dailyAnalysisEnabled) dailyToggle?.classList.add('active');
                else dailyToggle?.classList.remove('active');

                if (settings.autoApplyLessons) autoApplyToggle?.classList.add('active');
                else autoApplyToggle?.classList.remove('active');

                // Preencher campos
                document.getElementById('geminiApiKey').value=settings.geminiApiKey || '';
                document.getElementById('geminiModel').value=settings.geminiModel || 'gemini-1.5-flash';

                // Atualizar status
                updateAIStatus(settings);
            }

            catch (e) {
                console.error('Erro ao carregar config IA:', e);
            }
        }

        function updateAIStatus(settings) {
            const loggingEl=document.getElementById('aiLoggingStatus');
            const geminiEl=document.getElementById('aiGeminiStatus');
            const messagesEl=document.getElementById('aiMessagesCount');
            const pendingEl=document.getElementById('aiPendingCount');

            // Status Logging
            if (settings.loggingEnabled !==false) {
                loggingEl.textContent='✅';
            }

            else {
                loggingEl.textContent='❌';
            }

            // Status Gemini
            if (settings.geminiApiKey) {
                geminiEl.textContent='✅';
            }

            else {
                geminiEl.textContent='⚠️';
            }

            // Stats (placeholder - idealmente viria do backend)
            messagesEl.textContent=settings.stats?.messages || '-';
            pendingEl.textContent=settings.stats?.pending || '-';
        }

        async function saveAISettings() {
            try {
                const loggingEnabled=document.querySelector('#toggle-ai-logging .toggle-switch').classList.contains('active');
                const dailyEnabled=document.querySelector('#toggle-ai-daily .toggle-switch').classList.contains('active');
                const autoApply=document.querySelector('#toggle-ai-autoapply .toggle-switch').classList.contains('active');
                const apiKey=document.getElementById('geminiApiKey').value.trim();
                const model=document.getElementById('geminiModel').value;

                // Validar: se ativar daily, precisa de API key
                if (dailyEnabled && !apiKey) {
                    showToast('Para ativar análise diária, configure a chave API do Gemini', 'error');
                    return;
                }

                // Atualizar settings localmente
                currentSettings.aiReinforcement= {
                    loggingEnabled,
                    dailyAnalysisEnabled: dailyEnabled,
                    autoApplyLessons: autoApply,
                    geminiApiKey: apiKey,
                    geminiModel: model
                }

                ;

                // Salvar no servidor
                const data=await apiFetch(`/api/tenants/${currentTenantId}`, {

                    method: 'PUT',
                    body: {
                        settings: currentSettings
                    }
                });

            updateAIStatus(currentSettings.aiReinforcement);
            showToast('Configurações de IA salvas!', 'success');
        }

        catch (e) {
            console.error('Erro ao salvar config IA:', e);
            showToast('Erro ao salvar configurações', 'error');
        }
        }

        async function testGeminiKey() {
            const apiKey=document.getElementById('geminiApiKey').value.trim();

            if ( !apiKey) {
                showToast('Digite uma chave API primeiro', 'error');
                return;
            }

            showToast('Testando conexão...', 'info');

            try {
                const response=await fetch(`https: //generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

                    if (response.ok) {
                        const data=await response.json();
                        // Filtrar apenas modelos gemini relevantes e remover o limite de 5
                        const models=data.models ?.map(m=> m.name.split('/').pop()) .filter(m=> m.startsWith ('gemini-') && !m.includes('vision') && !m.includes('embedding')) .join(', ');

                        showToast(`✅ Conexão OK ! Modelos: ${models}`, 'success');
                        document.getElementById('aiGeminiStatus').textContent='✅';
                    }

                    else {
                        const err=await response.json();

                        showToast(`❌ Erro: ${
                                err.error?.message || 'Chave inválida'
                            }

                            `, 'error');
                        document.getElementById('aiGeminiStatus').textContent='❌';
                    }
                }

                catch (e) {
                    showToast('Erro de rede ao testar', 'error');
                }
            }

            init();
            