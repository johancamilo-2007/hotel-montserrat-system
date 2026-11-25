/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - RUTAS DE AUTENTICACIÓN Y SESIONES
 * Endpoints protegidos para control de acceso, logout y reautenticación.
 * ============================================================================
 */

import {
    loginController,
    logoutController,
    meController,
    reauthController,
    changePasswordController
} from '../controllers/authController.js';
import { requerirAutenticacion } from '../middlewares/authMiddleware.js';

export function configurarRutasAuth(router) {
    // Rutas públicas
    router.post('/api/auth/login', loginController);
    router.post('/api/auth/logout', logoutController);

    // Rutas protegidas (Requieren sesión activa en servidor)
    router.get('/api/auth/me', requerirAutenticacion, meController);
    router.post('/api/auth/reauth', requerirAutenticacion, reauthController);
    router.post('/api/auth/change-password', requerirAutenticacion, changePasswordController);
}
