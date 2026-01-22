
import { v4 as uuidv4 } from 'uuid';

const ORS_API_KEY = process.env.ORS_API_KEY || '5b3ce3597851110001cf6248cfa0914bbad64af78bc4d5aad8b296fb';

export class DeliveryService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Geocodificar endereço (Texto -> Lat/Lng)
     * @param {string} address 
     */
    async geocodeAddress(address) {
        try {
            console.log(`[DeliveryService] Geocodificando: ${address}`);
            const url = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(address)}&size=1`;

            const response = await fetch(url);
            const data = await response.json();

            if (data && data.features && data.features.length > 0) {
                const feature = data.features[0];
                const [lng, lat] = feature.geometry.coordinates;
                const label = feature.properties.label;

                console.log(`[DeliveryService] Encontrado: ${label} (${lat}, ${lng})`);
                return {
                    latitude: lat,
                    longitude: lng,
                    formattedAddress: label
                };
            }

            console.warn('[DeliveryService] Endereço não encontrado');
            return null;
        } catch (error) {
            console.error('[DeliveryService] Erro na geocodificação:', error);
            return null;
        }
    }

    /**
     * Calcular taxa de entrega
     */
    async calculateFee(tenantId, customerAddressObj) {
        try {
            // 1. Obter configurações do tenant
            const tenant = await this.db.get('SELECT settings FROM tenants WHERE id = ?', [tenantId]);
            if (!tenant) throw new Error('Tenant não encontrado');

            const settings = JSON.parse(tenant.settings || '{}');

            // Se não tiver configurações de entrega ou endereço da loja, retorne taxa fixa padrão
            const storeLat = parseFloat(settings.address?.latitude || settings.addressLatitude || settings.storeLat);
            const storeLng = parseFloat(settings.address?.longitude || settings.addressLongitude || settings.storeLng);

            if (isNaN(storeLat) || isNaN(storeLng)) {
                return {
                    fee: settings.deliveryFee || 0,
                    type: 'fixed',
                    message: 'Taxa fixa (Loja sem local definido)'
                };
            }

            // 2. Geocodificar endereço do cliente se necessário
            let customerLat = customerAddressObj.latitude;
            let customerLng = customerAddressObj.longitude;
            let formattedAddress = customerAddressObj.formattedAddress || customerAddressObj.text;

            if (!customerLat || !customerLng) {
                // Tenta geocodificar o texto
                const geoResult = await this.geocodeAddress(customerAddressObj.text);
                if (!geoResult) {
                    return {
                        fee: settings.deliveryFee || 0,
                        type: 'fixed',
                        addressNotFound: true
                    };
                }
                customerLat = geoResult.latitude;
                customerLng = geoResult.longitude;
                formattedAddress = geoResult.formattedAddress;
            }

            // 3. Calcular distância e rota (reutilizando lógica similar ao route/delivery.js)
            let distance = this.haversineDistance(storeLat, storeLng, customerLat, customerLng);
            let duration = 0;
            let calculationType = 'haversine';

            // Tentar ORS para rota real se possível
            try {
                const route = await this.calculateRouteORS(storeLat, storeLng, customerLat, customerLng);
                if (route) {
                    distance = route.distance;
                    duration = route.duration;
                    calculationType = 'route';
                }
            } catch (e) {
                console.error('[DeliveryService] Falha no cálculo de rota ORS, usando Haversine:', e.message);
            }

            // 4. Calcular preço baseado nas regras
            const maxDist = parseFloat(settings.maxDeliveryDistance) || 70;
            if (distance > maxDist) {
                return {
                    fee: 0,
                    outOfRange: true,
                    expectedFee: 0,
                    distance,
                    maxDistance: maxDist,
                    formattedAddress
                };
            }

            let fee = 0;
            const baseFeeDist = parseFloat(settings.baseFeeDistance) || 5;
            const baseFee = parseFloat(settings.baseFee) || 7;
            const feePerKm = parseFloat(settings.feePerKm) || 2;

            if (distance <= baseFeeDist) {
                fee = baseFee;
            } else {
                fee = distance * feePerKm;
                // Alternativa: baseFee + (distance - baseFeeDist) * feePerKm? 
                // O código original faz distance * feePerKm total se passar da base. Seguindo essa lógica.
            }

            // Arredondamento
            if (distance > 10) fee = Math.floor(fee);
            else fee = Math.ceil(fee);

            // Respeitar min/max se configurado (legado)
            if (settings.minDeliveryFee && fee < settings.minDeliveryFee) fee = settings.minDeliveryFee;
            if (settings.maxDeliveryFee && fee > settings.maxDeliveryFee) fee = settings.maxDeliveryFee;

            return {
                fee,
                distance: parseFloat(distance.toFixed(2)),
                duration,
                formattedAddress,
                type: 'calculated'
            };

        } catch (error) {
            console.error('[DeliveryService] Erro fatal no cálculo:', error);
            return { fee: 0, error: true };
        }
    }

    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    async calculateRouteORS(lat1, lon1, lat2, lon2) {
        if (lat1 === lat2 && lon1 === lon2) return { distance: 0, duration: 0 };

        const url = 'https://api.openrouteservice.org/v2/directions/driving-car';
        const body = {
            coordinates: [[lon1, lat1], [lon2, lat2]]
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': ORS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await res.json();
        if (data.routes && data.routes[0]) {
            return {
                distance: data.routes[0].summary.distance / 1000,
                duration: Math.round(data.routes[0].summary.duration / 60)
            };
        }
        return null;
    }
}
