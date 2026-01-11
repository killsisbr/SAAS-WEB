// ============================================================
// Rotas de Delivery (Taxa de Entrega)
// ============================================================
// Implementacao com OpenRouteService para calculo de rota real
// ============================================================

import { Router } from 'express';
import { tenantResolver } from '../middleware/tenant.js';

// Chave da API OpenRouteService (gratis em https://openrouteservice.org)
const ORS_API_KEY = process.env.ORS_API_KEY || '5b3ce3597851110001cf6248cfa0914bbad64af78bc4d5aad8b296fb';

// ============================================================
// FUNCAO: Calcular distancia por ROTA REAL de carro (OpenRouteService)
// ============================================================
async function calculateRouteDistance(originLat, originLng, destLat, destLng) {
    try {
        // Verificar se coordenadas sao identicas
        if (originLat === destLat && originLng === destLng) {
            return { distance: 0, duration: 0, type: 'route' };
        }

        const url = 'https://api.openrouteservice.org/v2/directions/driving-car';
        const body = {
            coordinates: [
                [parseFloat(originLng), parseFloat(originLat)],
                [parseFloat(destLng), parseFloat(destLat)]
            ]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': ORS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        // Verificar se a resposta tem dados de rota validos
        if (data && data.routes && data.routes[0] && data.routes[0].summary) {
            const distanceMeters = data.routes[0].summary.distance;
            const durationSeconds = data.routes[0].summary.duration;

            return {
                distance: distanceMeters / 1000, // Converter metros para km
                duration: Math.round(durationSeconds / 60), // Converter para minutos
                type: 'route'
            };
        }

        throw new Error('Resposta invalida da API ORS');
    } catch (error) {
        console.error('[ORS] Erro ao calcular rota:', error.message);
        // Fallback para Haversine
        const haversineDist = haversineDistance(originLat, originLng, destLat, destLng);
        return {
            distance: haversineDist,
            duration: null,
            type: 'haversine_fallback'
        };
    }
}

export default function (db) {
    const router = Router();

    // ========================================
    // POST /api/delivery/reverse-geocode - Geocodificacao reversa com ORS
    // ========================================
    router.post('/reverse-geocode', async (req, res) => {
        try {
            const { latitude, longitude } = req.body;

            if (!latitude || !longitude) {
                return res.status(400).json({ error: 'Latitude e longitude sao obrigatorios' });
            }

            // Chamar API do OpenRouteService
            const url = `https://api.openrouteservice.org/geocode/reverse?api_key=${ORS_API_KEY}&point.lat=${latitude}&point.lon=${longitude}&size=5&layers=address,street,venue`;

            const response = await fetch(url);
            const data = await response.json();

            if (!data.features || data.features.length === 0) {
                return res.json({
                    success: false,
                    error: 'Endereco nao encontrado para estas coordenadas'
                });
            }

            // Encontrar melhor resultado (priorizar enderecos com numero)
            let bestMatch = null;
            let bestScore = -1;

            for (const feature of data.features) {
                const props = feature.properties;
                let score = 0;

                if (props.housenumber) score += 10;
                if (props.layer === 'address') score += 8;
                if (props.layer === 'venue') score += 5;
                if (props.accuracy === 'point') score += 5;

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = feature;
                }
            }

            const selected = bestMatch || data.features[0];
            const props = selected.properties;

            // Extrair informacoes do endereco
            const street = props.street || props.name || '';
            const number = props.housenumber || '';
            const neighborhood = props.neighbourhood || props.locality || '';
            const city = props.localadmin || props.county || '';
            const state = props.region || '';
            const label = props.label || '';

            res.json({
                success: true,
                address: {
                    street: street,
                    number: number,
                    neighborhood: neighborhood,
                    city: city,
                    state: state,
                    fullAddress: label,
                    formatted: street + (number ? ', ' + number : '') + (city ? ' - ' + city : '')
                },
                coordinates: {
                    lat: selected.geometry.coordinates[1],
                    lng: selected.geometry.coordinates[0]
                }
            });
        } catch (error) {
            console.error('Reverse geocode error:', error);
            res.status(500).json({
                success: false,
                error: 'Erro ao buscar endereco'
            });
        }
    });

    // ========================================
    // POST /api/delivery/calculate-fee - Calcular taxa (Haversine - compatibilidade)
    // ========================================
    router.post('/calculate-fee', async (req, res) => {
        try {
            const { tenantId, latitude, longitude, address } = req.body;

            if (!tenantId) {
                return res.status(400).json({ error: 'Tenant ID e obrigatorio' });
            }

            const tenant = await db.get('SELECT settings FROM tenants WHERE id = ?', [tenantId]);
            if (!tenant) {
                return res.status(404).json({ error: 'Loja nao encontrada' });
            }

            const settings = JSON.parse(tenant.settings || '{}');

            // Se nao tem coordenadas, retornar taxa fixa
            if (!latitude || !longitude) {
                return res.json({
                    fee: settings.deliveryFee || 0,
                    type: 'fixed'
                });
            }

            // Se tem endereco da loja e taxa por KM
            if (settings.address && settings.deliveryFeePerKm) {
                const storeAddress = settings.address;
                const storeLat = storeAddress.latitude;
                const storeLng = storeAddress.longitude;

                if (storeLat && storeLng) {
                    // Calcular distancia usando Haversine
                    const distance = haversineDistance(
                        storeLat, storeLng,
                        latitude, longitude
                    );

                    let fee = distance * settings.deliveryFeePerKm;

                    // Aplicar minimo e maximo
                    if (settings.minDeliveryFee && fee < settings.minDeliveryFee) {
                        fee = settings.minDeliveryFee;
                    }
                    if (settings.maxDeliveryFee && fee > settings.maxDeliveryFee) {
                        fee = settings.maxDeliveryFee;
                    }

                    // Verificar raio de entrega
                    if (settings.maxDeliveryRadius && distance > settings.maxDeliveryRadius) {
                        return res.json({
                            fee: 0,
                            distance,
                            outOfRange: true,
                            maxRadius: settings.maxDeliveryRadius,
                            message: 'Endereco fora da area de entrega'
                        });
                    }

                    return res.json({
                        fee: Math.round(fee * 100) / 100,
                        distance: Math.round(distance * 100) / 100,
                        type: 'distance'
                    });
                }
            }

            // Fallback para taxa fixa
            res.json({
                fee: settings.deliveryFee || 0,
                type: 'fixed'
            });
        } catch (error) {
            console.error('Calculate fee error:', error);
            res.status(500).json({ error: 'Erro ao calcular taxa' });
        }
    });

    // ========================================
    // POST /api/delivery/calculate-route - Calcular taxa com ROTA REAL (ORS)
    // ========================================
    router.post('/calculate-route', async (req, res) => {
        try {
            const { tenantId, storeLat, storeLng, customerLat, customerLng } = req.body;

            // Validar parametros
            if (!tenantId) {
                return res.status(400).json({ error: 'Tenant ID e obrigatorio' });
            }
            if (!storeLat || !storeLng || !customerLat || !customerLng) {
                return res.status(400).json({ error: 'Coordenadas da loja e cliente sao obrigatorias' });
            }

            // Buscar configuracoes da loja
            const tenant = await db.get('SELECT settings FROM tenants WHERE id = ?', [tenantId]);
            if (!tenant) {
                return res.status(404).json({ error: 'Loja nao encontrada' });
            }

            const settings = JSON.parse(tenant.settings || '{}');

            // ============================================================
            // CONFIGURACOES DE TAXA HIBRIDA
            // ============================================================
            // baseFeeDistance: Distancia ate onde aplica taxa base (ex: 4 km)
            // baseFee: Taxa fixa ate a distancia base (ex: R$ 7,00)
            // feePerKm: Taxa adicional por km apos distancia base (ex: R$ 2,00)
            // maxDeliveryDistance: Distancia maxima de entrega (ex: 70 km)
            // ============================================================
            const baseFeeDistance = parseFloat(settings.baseFeeDistance) || 5; // Ate 5km
            const baseFee = parseFloat(settings.baseFee) || 7; // R$ 7,00 base
            const feePerKm = parseFloat(settings.feePerKm) || 2; // R$ 2,00 por km adicional
            const maxDeliveryDistance = parseFloat(settings.maxDeliveryDistance) || 70; // Maximo 70km
            const deliveryZones = settings.deliveryZones || []; // Zonas legadas (opcional)

            // Calcular distancia por ROTA REAL
            console.log(`[ORS] Calculando rota: Loja(${storeLat}, ${storeLng}) -> Cliente(${customerLat}, ${customerLng})`);
            const routeResult = await calculateRouteDistance(
                parseFloat(storeLat),
                parseFloat(storeLng),
                parseFloat(customerLat),
                parseFloat(customerLng)
            );

            const distance = routeResult.distance;
            const duration = routeResult.duration;
            const calculationType = routeResult.type;

            console.log(`[ORS] Distancia calculada: ${distance.toFixed(2)}km (${calculationType}), Tempo: ${duration || 'N/A'} min`);

            // Verificar se esta fora da area de entrega
            if (distance > maxDeliveryDistance) {
                return res.json({
                    fee: 0,
                    distance: Math.round(distance * 100) / 100,
                    duration: duration,
                    outOfRange: true,
                    maxRadius: maxDeliveryDistance,
                    message: `Endereco fora da area de entrega (${distance.toFixed(1)}km, maximo ${maxDeliveryDistance}km)`,
                    calculationType: calculationType
                });
            }

            // ============================================================
            // CALCULO HIBRIDO: Taxa base + Taxa por km adicional
            // ============================================================
            let fee = baseFee;
            let extraKm = 0;
            let extraFee = 0;
            let pricingType = 'hybrid';

            // Se tem deliveryZones configuradas, usar sistema antigo de zonas
            if (deliveryZones.length > 0 && !settings.useHybridPricing) {
                const sortedZones = [...deliveryZones].sort((a, b) => parseFloat(a.maxKm) - parseFloat(b.maxKm));
                let zoneFound = false;

                for (const zone of sortedZones) {
                    if (distance <= parseFloat(zone.maxKm)) {
                        fee = parseFloat(zone.fee);
                        zoneFound = true;
                        pricingType = 'zone';
                        console.log(`[ORS] Zona encontrada: ate ${zone.maxKm}km = R$ ${zone.fee}`);
                        break;
                    }
                }

                if (!zoneFound) {
                    const maxZone = sortedZones[sortedZones.length - 1];
                    return res.json({
                        fee: 0,
                        distance: Math.round(distance * 100) / 100,
                        duration: duration,
                        outOfRange: true,
                        maxRadius: parseFloat(maxZone.maxKm),
                        message: `Endereco fora da area de entrega (${distance.toFixed(1)}km, maximo ${maxZone.maxKm}km)`,
                        calculationType: calculationType
                    });
                }
            } else {
                // Sistema HIBRIDO: Taxa base ate X km, depois km TOTAL x feePerKm
                if (distance > baseFeeDistance) {
                    // Acima da distancia base: calcula KM TOTAL × taxa por km
                    fee = distance * feePerKm;
                    console.log(`[ORS] Hibrido: ${distance.toFixed(2)}km TOTAL x R$ ${feePerKm} = R$ ${fee.toFixed(2)}`);
                } else {
                    // Dentro da distancia base: taxa fixa
                    fee = baseFee;
                    console.log(`[ORS] Hibrido: Distancia ${distance.toFixed(2)}km dentro da base (${baseFeeDistance}km) = R$ ${baseFee}`);
                }
            }

            // Regra de Arredondamento (sem centavos)
            if (distance > 10) {
                // Acima de 10km: Arredonda para baixo
                fee = Math.floor(fee);
                console.log(`[ORS] Arredondado para baixo (>10km): R$ ${fee}`);
            } else {
                // Ate 10km: Arredonda para cima
                fee = Math.ceil(fee);
                console.log(`[ORS] Arredondado para cima (<=10km): R$ ${fee}`);
            }

            res.json({
                fee: fee,
                distance: Math.round(distance * 100) / 100,
                duration: duration,
                type: pricingType,
                calculationType: calculationType,
                outOfRange: false,
                // Info adicional para debug
                breakdown: {
                    baseFee: baseFee,
                    baseFeeDistance: baseFeeDistance,
                    feePerKm: feePerKm,
                    totalKm: Math.round(distance * 100) / 100
                }
            });

        } catch (error) {
            console.error('[ORS] Erro ao calcular rota:', error);
            res.status(500).json({ error: 'Erro ao calcular taxa de entrega' });
        }
    });

    return router;
}

/**
 * Calcular distancia entre dois pontos usando formula Haversine
 * Retorna distancia em KM
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em KM
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}

