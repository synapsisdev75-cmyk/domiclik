export type UserRole = 'admin' | 'driver' | 'pending_driver' | 'pending_admin';

export type AdminAccountStatus = 'pending' | 'active' | 'revoked';

export interface AdminAccount {
  id: string;
  email: string;
  uid?: string;
  displayName: string;
  status: AdminAccountStatus;
  /** Primer admin del sistema (auto-activado) */
  isFounder?: boolean;
  requestedAt: string;
  activatedAt?: string;
  activatedBy?: string;
  revokedAt?: string;
  revokedBy?: string;
}

export type DriverStatus = 'pending' | 'approved' | 'rejected';

export interface LocationCoords {
  lat: number;
  lng: number;
  addressName?: string;
  neighborhood?: string;
  heading?: number;
  updatedAt?: string;
}

export interface MotorizadoDriver {
  id: string;
  userId?: string;
  fullName: string;
  email: string;
  phone: string;
  documentId: string; // Cédula de Ciudadanía
  licenseNumber: string; // Licencia de Conducción
  plateNumber: string; // Placa de la moto (ej: ABC-12D)
  motoModel: string; // Modelo y marca de la moto
  photoUrl: string;
  status: DriverStatus;
  isActive: boolean; // Botón de disponibilidad (Activo / Inactivo)
  location: LocationCoords;
  rating: number;
  ratingCount?: number;
  completedDeliveries: number;
  /** Admin puede suspender sin rechazar el perfil */
  suspended?: boolean;
  /** Credencial WebAuthn (huella / Face ID del móvil) */
  webauthnCredentialId?: string;
  lastPunchType?: 'in' | 'out';
  lastPunchAt?: string;
  approvedBy?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export type OrderStatus = 'pending' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled';

/** Pedido entrante desde página de ventas autorizada (tubo / webhook) */
export interface SalesInboundOrderPayload {
  /** ID de la página/tienda autorizada */
  sourceSiteId: string;
  /** Token o firma — validado en el servidor */
  externalOrderId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress: string;
  deliveryLat?: number;
  deliveryLng?: number;
  pickupAddress?: string;
  pickupLat?: number;
  pickupLng?: number;
  description?: string;
  declaredValue?: number;
  notes?: string;
}

export interface DeliveryOrder {
  id: string;
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  pickupAddress: string;
  pickupCoords: LocationCoords;
  deliveryAddress: string;
  deliveryCoords: LocationCoords;
  description: string;
  itemType: 'documentos' | 'paquete_pequeno' | 'comida_medicamentos' | 'varios';
  declaredValue: number;
  /** Precio del recorrido — solo visible al administrador */
  shippingFee: number;
  /** Copia explícita del precio calculado (admin-only en UI) */
  routePrice?: number;
  routeDistanceKm?: number;
  routeDurationMin?: number;
  dispatchRadiusKm?: number;
  autoAssignedAt?: string;
  /** Distancia conductor → pickup al momento de auto-asignar */
  assignedDistanceKm?: number;
  status: OrderStatus;
  assignedDriverId: string | null;
  assignedDriverName: string | null;
  assignedDriverPhone?: string | null;
  notes?: string;
  /**
   * PIN aleatorio que el cliente da al repartidor.
   * Obligatorio para marcar entrega exitosa.
   */
  deliveryConfirmCode?: string;
  deliveryConfirmedAt?: string;
  /** Origen: página de ventas autorizada */
  sourceSiteId?: string;
  externalOrderId?: string;
  /** Calificación 1–5 del servicio (admin / cliente) */
  serviceRating?: number;
  ratingComment?: string;
  ratedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Reglas de despacho automático y tarifa (Firestore settings/dispatch) */
export interface DispatchSettings {
  id: 'dispatch';
  searchRadiusKm: number;
  baseFee: number;
  perKmRate: number;
  autoAssignEnabled: boolean;
  updatedAt: string;
}

export type AttendancePunchType = 'in' | 'out';

export interface AttendancePunch {
  id: string;
  driverId: string;
  driverName?: string;
  type: AttendancePunchType;
  at: string;
  dateKey: string;
  lat?: number;
  lng?: number;
  method: 'webauthn';
  credentialId: string;
}

export interface DriverReview {
  id: string;
  driverId: string;
  driverName: string;
  orderId?: string;
  trackingCode?: string;
  stars: number;
  comment: string;
  authorRole: 'admin' | 'customer';
  authorName: string;
  authorUid?: string;
  authorEmail?: string;
  createdAt: string;
}

export interface PayrollSettings {
  id: string;
  /** % del flete que se paga al motorizado (0–100) */
  commissionPercent: number;
  /** Pago fijo extra por entrega (COP) */
  payPerDelivery: number;
  /** Bono si el rating promedio del periodo ≥ umbral */
  ratingBonusThreshold: number;
  ratingBonusAmount: number;
  /** Base fija del periodo (COP), opcional */
  basePay: number;
  updatedAt: string;
}

export interface PayrollLine {
  driverId: string;
  driverName: string;
  plateNumber: string;
  documentId: string;
  deliveries: number;
  cancelled: number;
  grossFees: number;
  commission: number;
  perDeliveryPay: number;
  ratingAvg: number;
  ratingBonus: number;
  basePay: number;
  deductions: number;
  total: number;
}

export interface PayrollRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  settingsSnapshot: PayrollSettings;
  lines: PayrollLine[];
  grandTotal: number;
  createdAt: string;
  createdBy: string;
  status: 'draft' | 'approved';
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderRole: 'admin' | 'driver';
  text: string;
  timestamp: string;
}

export interface ChatRoom {
  id: string;
  driverId: string;
  driverName: string;
  driverPhoto?: string;
  driverPlate?: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadByAdmin: boolean;
  unreadByDriver: boolean;
}

export interface VillavicencioPoint {
  name: string;
  neighborhood: string;
  lat: number;
  lng: number;
  description: string;
}

export interface DriverLocationHistoryPoint {
  id: string;
  driverId: string;
  driverName?: string;
  plateNumber?: string;
  lat: number;
  lng: number;
  speed?: number; // km/h
  heading?: number;
  addressName?: string;
  timestamp: string;
  dateKey: string; // e.g. YYYY-MM-DD
}
