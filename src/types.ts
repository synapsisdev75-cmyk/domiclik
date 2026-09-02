export type UserRole =
  | 'admin'
  | 'secretary'
  | 'driver'
  | 'pending_driver'
  | 'pending_admin'
  | 'pending_secretary';

export type StaffRole = 'admin' | 'secretary';

export type AdminAccountStatus = 'pending' | 'active' | 'revoked';

export interface AdminAccount {
  id: string;
  email: string;
  uid?: string;
  displayName: string;
  status: AdminAccountStatus;
  /** admin = control total · secretary = torre lectura + informes */
  role?: StaffRole;
  /** Primer admin del sistema (auto-activado) */
  isFounder?: boolean;
  requestedAt: string;
  activatedAt?: string;
  activatedBy?: string;
  revokedAt?: string;
  revokedBy?: string;
}

/** Documento de secretaría (informes, actas, soporte). */
export interface SecretariatFile {
  id: string;
  title: string;
  category: string;
  fileName: string;
  storagePath: string;
  downloadUrl: string;
  sizeBytes?: number;
  uploadedBy: string;
  uploadedByRole: StaffRole;
  createdAt: string;
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
  /** Fecha de nacimiento (YYYY-MM-DD). */
  birthDate?: string;
  /** Licencia de conducción (A2) — la registra el transportista. */
  licenseNumber?: string;
  /** Placa — la asigna el administrador al vincular moto. */
  plateNumber?: string;
  /** Modelo moto — lo registra el administrador al vincular moto. */
  motoModel?: string;
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
  /** Credencial WebAuthn registrada en terminal tablet compartida */
  webauthnKioskCredentialId?: string;
  lastPunchType?: 'in' | 'out';
  lastPunchAt?: string;
  /** Último km de odómetro marcado (entrada o salida). */
  lastOdometerKm?: number;
  /** Rendimiento manual km/galón (si difiere del catálogo por modelo). */
  motoKmPerGallon?: number;
  /** Vehículo de flota asignado por admin (catálogo personalizado). */
  fleetVehicleId?: string;
  /** Moto física asignada (inventario fleet_motos). */
  assignedMotoId?: string;
  /** Último cambio de aceite — km odómetro. */
  lastOilChangeKm?: number;
  /** Último cambio de aceite — fecha ISO. */
  lastOilChangeAt?: string;
  approvedBy?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export type OrderStatus =
  | 'pending'
  | 'assigned'
  | 'accepted'
  | 'en_route_origin'
  | 'at_origin'
  | 'picked_up'
  | 'in_transit'
  | 'at_destination'
  | 'delivered'
  | 'cancelled';

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
  /** Forma de pago informada por el cliente (sin pasarela). */
  paymentMethod?: 'efectivo' | 'transferencia' | 'ya_pagado' | 'otro';
  paymentNote?: string;
  couponCode?: string;
  couponDiscount?: number;
  /** Número de factura / orden de compra prepagada */
  invoiceNumber?: string;
  /** Foto de la factura para validar en el establecimiento */
  invoicePhotoUrl?: string;
  /** Trazabilidad de estados (matriz maestra) */
  timeline?: Array<{
    at: string;
    from?: string;
    to: string;
    byRole?: string;
    byName?: string;
    note?: string;
  }>;
  /**
   * PIN aleatorio que el cliente da al repartidor.
   * Obligatorio para marcar entrega exitosa.
   */
  deliveryConfirmCode?: string;
  deliveryConfirmedAt?: string;
  /** Entrega programada (ISO). Hasta 15 días desde la solicitud. */
  scheduledFor?: string;
  pricingBand?: 'peak' | 'normal';
  pricePerKm?: number;
  peakMultiplier?: number;
  /** Si true, el precio viene de la cotización del cliente (no recalcular en dispatch). */
  clientQuoted?: boolean;
  /** Origen: página de ventas autorizada */
  sourceSiteId?: string;
  externalOrderId?: string;
  /** Calificación 1–5 del servicio (promedio de encuesta del cliente) */
  serviceRating?: number;
  ratingComment?: string;
  ratedAt?: string;
  ratedByUid?: string;
  ratingSurvey?: {
    punctuality: number;
    care: number;
    attention: number;
  };
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

export type AttendancePunchMethod = 'webauthn' | 'webauthn_kiosk' | 'pin_kiosk';

/** PIN diario del kiosco (rota a la 01:00, jornada sede). */
export interface AttendanceDailyPin {
  id: string;
  driverId: string;
  driverName?: string;
  /** Día operativo: cambia a la 01:00 locales. */
  pinDayKey: string;
  /** PIN de 6 dígitos; solo se revela tras foto de rostro. */
  pin: string;
  createdAt: string;
  /** Primera foto de llegada a sede que desbloqueó el PIN hoy. */
  revealFacePhotoUrl?: string;
  revealedAt?: string;
  expiresAt: string;
}

export interface AttendancePunch {
  id: string;
  driverId: string;
  driverName?: string;
  type: AttendancePunchType;
  at: string;
  dateKey: string;
  lat?: number;
  lng?: number;
  method: AttendancePunchMethod;
  /** WebAuthn credentialId, o el PIN usado en kiosco. */
  credentialId?: string;
  /** Kilometraje del odómetro al marcar (km reales de la moto). */
  odometerKm?: number;
  /** Foto del tablero / odómetro (celular vía QR). */
  odometerPhotoUrl?: string;
  /** Foto de la placa de la moto (celular vía QR; obligatoria en entrada). */
  platePhotoUrl?: string;
  /** Foto de rostro en sede (obligatoria para revelar PIN en tablet). */
  facePhotoUrl?: string;
  pinDayKey?: string;
  /** Calculado al marcar salida. */
  shiftKmDriven?: number;
  shiftGallons?: number;
  shiftLiters?: number;
  shiftFuelCostCop?: number;
  kmPerGallonUsed?: number;
  kmPerLiterUsed?: number;
  litersPerKmUsed?: number;
  copPerKmUsed?: number;
  fuelPricePerGallonUsed?: number;
  motoCatalogId?: string;
  /** Marca kiosco sin fotos móviles aún. */
  mobilePhotosPending?: boolean;
}

/** Resumen del turno laboral del día (entrada + salida + km). */
export interface WorkShiftDay {
  driverId: string;
  driverName: string;
  dateKey: string;
  inAt?: string;
  outAt?: string;
  kmIn?: number;
  kmOut?: number;
  kmDriven: number;
  hoursWorked: number;
  expectedHours: number;
  fuelEstimateCop: number;
  gallonsUsed?: number;
  litersUsed?: number;
  litersPerKm?: number;
  copPerKm?: number;
  fuelPricePerGallonCop?: number;
  kmPerGallonUsed?: number;
  kmPerLiterUsed?: number;
  motoCatalogId?: string;
  photoInUrl?: string;
  photoOutUrl?: string;
  open: boolean;
}

export interface DriverReview {
  id: string;
  driverId: string;
  driverName: string;
  orderId?: string;
  trackingCode?: string;
  stars: number;
  comment: string;
  survey?: {
    punctuality: number;
    care: number;
    attention: number;
  };
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
  /** Costo estimado de gasolina por km (COP). Uso empresa vs personal. */
  fuelCostPerKm?: number;
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

/** Vehículo de flota definido por el administrador (Firestore). */
export interface FleetVehicleSpec {
  id: string;
  label: string;
  /** Palabras para auto-detectar desde motoModel (ej. "boxer", "125"). */
  matchKeywords: string[];
  kmPerLiter: number;
  kmPerGallonMin?: number;
  kmPerGallonMax?: number;
  fuelType: 'gasolina' | 'diesel';
  maintenance: {
    firstServiceKm: number;
    firstServiceDays: number;
    oilChangeKm: number;
    chainLubeKm: number;
    airFilterCleanKm: number;
    airFilterReplaceKm: number;
    sparkPlugReplaceKm: number;
    fuelBowlCleanKm: number;
    carbBowlCleanKm: number;
    engineOilLiters?: number;
    tankLiters?: number;
    notes?: string;
  };
  tankLiters?: number;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

/** Estado operativo de una moto física. */
export type FleetMotoStatus = 'available' | 'assigned' | 'maintenance' | 'unavailable';

/** Moto física de la flota (placa, odómetro, asignación). */
export interface FleetMoto {
  id: string;
  plateNumber: string;
  label: string;
  motoModel: string;
  /** Perfil técnico (FleetVehicleSpec). */
  fleetVehicleId?: string;
  fuelType: 'gasolina' | 'diesel';
  status: FleetMotoStatus;
  currentDriverId?: string;
  lastOdometerKm?: number;
  /** Km odómetro al momento de vincular la moto al transportista. */
  assignedAtOdometerKm?: number;
  /** Fecha vinculación al transportista actual. */
  assignedAt?: string;
  lastOilChangeKm?: number;
  lastOilChangeAt?: string;
  /** Último tanque lleno — km odómetro. */
  lastFuelFillOdometerKm?: number;
  /** Promedio km/L de turnos recientes. */
  avgKmPerLiter?: number;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

/** Configuración de rotación semanal de motos. @deprecated Sin rotación — vinculación fija moto ↔ transportista. */
export interface FleetRotationSettings {
  enabled: boolean;
  intervalDays: number;
  dayOfWeek: number;
  lastRunAt?: string;
  lastRunWeekKey?: string;
}

/** Ajustes de flota: combustible y mantenimiento. */
export interface FleetSettings {
  id: 'fleet';
  /** Precio galón gasolina/diésel (COP). */
  fuelPricePerGallonCop: number;
  /** Rendimiento por defecto km/galón si el modelo no está en catálogo. */
  defaultKmPerGallon: number;
  /** Intervalo cambio de aceite (km). */
  oilChangeIntervalKm: number;
  /** Intervalo cambio de aceite (días). */
  oilChangeIntervalDays: number;
  /** Motos/vehículos agregados por el administrador. */
  customVehicles?: FleetVehicleSpec[];
  updatedAt: string;
}

export type MotoMaintenanceType = 'aceite' | 'llantas' | 'frenos' | 'cadena' | 'general' | 'otro';

export interface MotoMaintenanceLog {
  id: string;
  driverId: string;
  fleetMotoId?: string;
  driverName?: string;
  plateNumber?: string;
  motoModel?: string;
  type: MotoMaintenanceType;
  description: string;
  odometerKm: number;
  costCop?: number;
  at: string;
  createdBy?: string;
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

/** Incidencia operativa (retraso, cliente ausente, etc.). Solo admin resuelve. */
export type IncidentStatus = 'open' | 'resolved';

export interface OpsIncident {
  id: string;
  orderId?: string;
  trackingCode?: string;
  driverId?: string;
  driverName?: string;
  reportedByRole: 'admin' | 'driver';
  reportedByName: string;
  category?: string;
  title: string;
  description: string;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  /** Botón de pánico del transportista */
  isPanic?: boolean;
  lat?: number;
  lng?: number;
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

/** Videos de la pantalla secundaria (monitor radar). */
export interface MapWallSettings {
  id: 'map_wall';
  /** Video corto (~6 s) — se reproduce completo, luego mapa. */
  videoAUrl: string;
  videoALabel?: string;
  /** Video largo (~8 s) — se reproduce completo, luego mapa. */
  videoBUrl: string;
  videoBLabel?: string;
  /** Cuánto tiempo mostrar el mapa entre videos (ms). */
  mapDurationMs: number;
  updatedAt: string;
}
