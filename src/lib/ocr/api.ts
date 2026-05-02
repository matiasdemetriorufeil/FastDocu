import { ApiStatusResponse } from './types';

export class CuitApiClient {
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private readonly timeoutMs: number;

    constructor() {
        this.baseUrl = process.env.API_BASE_URL || 'https://api.cuitalizer.com/v1';
        this.apiKey = process.env.API_KEY || '';
        this.timeoutMs = 5000;
    }

    /**
     * Consulta el CUIT en la API externa. 
     * Maneja logs, Errores HTTP y Red sin romper la aplicación.
     */
    async checkStatus(cuit: string): Promise<ApiStatusResponse | null> {
        if (!this.apiKey) {
            console.warn('API_KEY no configurada. Saltando validación externa.');
            return null;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

            const response = await fetch(`${this.baseUrl}/cuit/${cuit}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.status === 404) {
                return null; // CUIT no encontrado en DB
            }

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Adaptar esto según la respuesta real de la API usada.
            return {
                active: data.estado === 'ACTIVO',
                razonSocial: data.razon_social || 'Desconocido'
            };

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.error(`[API] Timeout alcanzado (${this.timeoutMs}ms) consultando CUIT ${cuit}`);
            } else {
                console.error(`[API] Error de red consultando CUIT ${cuit}:`, error.message);
            }
            throw error; // Propagamos para que el orquestador ponga estado ERROR_API
        }
    }
}
