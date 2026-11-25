/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - PUNTO DE ENTRADA DEL SERVIDOR HTTP
 * ============================================================================
 */

import { iniciarServidor } from './app.js';
import { env } from './config/env.js';

iniciarServidor(env.PORT).catch(err => {
    console.error('[Hotel Montserrat] Error crítico al inicializar el servidor:', err);
    process.exit(1);
});
