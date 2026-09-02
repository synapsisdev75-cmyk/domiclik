import React, { useEffect, useMemo, useState } from 'react';
import {
  DeliveryOrder,
  DriverReview,
  MotorizadoDriver,
  PayrollRun,
  PayrollSettings,
} from '../../types';
import {
  subscribeDriverReviews,
  submitDriverReview,
  subscribePayrollSettings,
  savePayrollSettings,
  subscribePayrollRuns,
  savePayrollRun,
  setDriverSuspended,
  toggleDriverActiveState,
} from '../../lib/firebase';
import { isLiveOrderStatus } from '../../lib/orderFlow';
import {
  DEFAULT_PAYROLL_SETTINGS,
  buildDriverStats,
  buildMetricsSeries,
  chartSeriesCaption,
  computePayrollLines,
  downloadExcel,
  downloadTextFile,
  filterOrdersInRange,
  formatCOP,
  inRange,
  startOfDayISO,
  startOfMonthISO,
  startOfWeekISO,
} from '../../lib/adminMetrics';
import {
  Star,
  Download,
  Wallet,
  BarChart3,
  Users,
  Shield,
  Ban,
  CheckCircle2,
  Save,
  FileSpreadsheet,
  FileJson,
  Power,
  ChevronDown,
  UsersRound,
} from 'lucide-react';
import { DomiHelmetIcon } from '../ui/CustomIcons';

type ControlTab = 'metricas' | 'repartidores' | 'nomina' | 'informes';

interface Props {
  drivers: MotorizadoDriver[];
  orders: DeliveryOrder[];
  initialTab?: ControlTab;
  adminName?: string;
  readOnly?: boolean;
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const full = Math.round(value);
  return (
    <span className="inline-flex items-center gap-0.5" title={`${value.toFixed(1)} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className="shrink-0"
          width={size}
          height={size}
          fill={n <= full ? '#F59E0B' : 'transparent'}
          stroke={n <= full ? '#F59E0B' : '#475569'}
        />
      ))}
    </span>
  );
}

function chartLabelStep(pointCount: number): number {
  if (pointCount <= 7) return 1;
  if (pointCount <= 12) return 2;
  if (pointCount <= 24) return 4;
  return Math.max(1, Math.ceil(pointCount / 6));
}

function LineChart({
  points,
  valueKey,
  color,
  label,
}: {
  points: { label: string; created: number; delivered: number; revenue: number }[];
  valueKey: 'created' | 'delivered' | 'revenue';
  color: string;
  label: string;
}) {
  const w = 560;
  const h = 200;
  const padX = 32;
  const padTop = 20;
  const padBottom = 40;
  const plotH = h - padTop - padBottom;

  if (points.length === 0) {
    return (
      <div>
        <div className="text-[11px] text-slate-400 font-tech uppercase mb-2">{label}</div>
        <div className="h-[180px] flex items-center justify-center text-xs text-slate-500 border border-dashed border-[#1a2744] rounded-xl">
          Sin datos en este periodo
        </div>
      </div>
    );
  }

  const vals = points.map((p) => p[valueKey]);
  const max = Math.max(1, ...vals);
  const labelEvery = chartLabelStep(points.length);
  const showDots = points.length <= 14;

  const coords = points.map((p, i) => {
    const x = padX + (i * (w - padX * 2)) / Math.max(1, points.length - 1);
    const y = padTop + plotH - (p[valueKey] / max) * plotH;
    return { x, y, p, i };
  });
  const d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const area = `${d} L ${coords[coords.length - 1]?.x || padX} ${h - padBottom} L ${padX} ${h - padBottom} Z`;

  const total = vals.reduce((s, v) => s + v, 0);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <div className="text-[11px] text-slate-400 font-tech uppercase">{label}</div>
        <div className="text-[10px] text-slate-500 font-tech">
          Total periodo:{' '}
          <span className="text-slate-300 font-bold">
            {valueKey === 'revenue' ? formatCOP(total) : total}
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[200px]" role="img" aria-label={label}>
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={w - padX}
            y1={padTop + plotH - t * plotH}
            y2={padTop + plotH - t * plotH}
            stroke="#1a2744"
            strokeWidth="1"
          />
        ))}
        <path d={area} fill={color} opacity="0.12" />
        <path d={d} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" />
        {coords.map((c) => {
          const showLabel =
            c.i % labelEvery === 0 || c.i === points.length - 1;
          return (
            <g key={c.i}>
              {showDots && <circle cx={c.x} cy={c.y} r="3" fill={color} />}
              {showLabel && (
                <text
                  x={c.x}
                  y={h - 10}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="9"
                >
                  {c.p.label}
                </text>
              )}
              <title>
                {c.p.label}: {valueKey === 'revenue' ? formatCOP(c.p[valueKey]) : c.p[valueKey]}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function BarChart({
  items,
}: {
  items: { name: string; delivered: number; rating: number }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.delivered));
  const top = items.slice(0, 8);
  return (
    <div className="space-y-2.5">
      {top.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">Sin entregas en el periodo.</p>
      ) : (
        top.map((item) => (
          <div key={item.name}>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-slate-200 truncate max-w-[70%]">{item.name}</span>
              <span className="text-white font-tech font-bold">{item.delivered}</span>
            </div>
            <div className="h-2 rounded-full bg-[#121D36] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#2B6CFF] to-[#00E5FF]"
                style={{ width: `${(item.delivered / max) * 100}%` }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export const AdminControlCenter: React.FC<Props> = ({
  drivers,
  orders,
  initialTab = 'metricas',
  adminName = 'Admin DomiClick',
  readOnly = false,
}) => {
  const [tab, setTab] = useState<ControlTab>(initialTab);
  const [reviews, setReviews] = useState<DriverReview[]>([]);
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>(DEFAULT_PAYROLL_SETTINGS);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'all'>('week');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [driverMenuOpen, setDriverMenuOpen] = useState(false);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [orderIdForRating, setOrderIdForRating] = useState('');
  const [saving, setSaving] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<PayrollSettings>(DEFAULT_PAYROLL_SETTINGS);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const u1 = subscribeDriverReviews(setReviews);
    const u2 = subscribePayrollSettings((s) => {
      setPayrollSettings(s);
      setSettingsDraft(s);
    });
    const u3 = subscribePayrollRuns(setPayrollRuns);
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const range = useMemo(() => {
    const now = new Date();
    if (period === 'all') {
      return { from: new Date('2020-01-01'), to: now, label: 'Todo el historial' };
    }
    if (period === 'month') {
      return { from: startOfMonthISO(now), to: now, label: 'Mes en curso' };
    }
    if (period === 'day') {
      return { from: startOfDayISO(now), to: now, label: 'Hoy (diario)' };
    }
    return { from: startOfWeekISO(now), to: now, label: 'Semana en curso (lun–hoy)' };
  }, [period]);

  const approvedDrivers = useMemo(
    () => drivers.filter((d) => d.status === 'approved'),
    [drivers]
  );

  /** Pedidos del transportador seleccionado, o toda la flota si está en "Todos". */
  const scopedOrders = useMemo(() => {
    if (!selectedDriverId) return orders;
    return orders.filter((o) => o.assignedDriverId === selectedDriverId);
  }, [orders, selectedDriverId]);

  const daily = useMemo(
    () => buildMetricsSeries(scopedOrders, period, range.from, range.to),
    [scopedOrders, period, range.from, range.to]
  );

  const seriesCaption = chartSeriesCaption(period);

  const periodOrders = useMemo(
    () => filterOrdersInRange(scopedOrders, range.from, range.to),
    [scopedOrders, range.from, range.to]
  );

  const stats = useMemo(
    () => buildDriverStats(drivers, orders, reviews, range.from, range.to),
    [drivers, orders, reviews, range]
  );
  const displayStats = useMemo(() => {
    if (!selectedDriverId) return stats;
    return stats.filter((s) => s.driver.id === selectedDriverId);
  }, [stats, selectedDriverId]);
  const payrollLines = useMemo(
    () => computePayrollLines(drivers, orders, reviews, payrollSettings, range.from, range.to),
    [drivers, orders, reviews, payrollSettings, range]
  );
  const scopedPayrollLines = useMemo(() => {
    if (!selectedDriverId) return payrollLines;
    return payrollLines.filter((l) => l.driverId === selectedDriverId);
  }, [payrollLines, selectedDriverId]);
  const payrollTotal = scopedPayrollLines.reduce((s, l) => s + l.total, 0);

  const delivered = periodOrders.filter(
    (o) => o.status === 'delivered' && inRange(o.updatedAt || o.createdAt, range.from, range.to)
  ).length;
  const pending = periodOrders.filter((o) => o.status === 'pending').length;
  const transit = periodOrders.filter((o) => isLiveOrderStatus(o.status)).length;
  const cancelled = periodOrders.filter(
    (o) =>
      o.status === 'cancelled' && inRange(o.updatedAt || o.createdAt, range.from, range.to)
  ).length;
  const revenue = periodOrders
    .filter(
      (o) =>
        o.status === 'delivered' && inRange(o.updatedAt || o.createdAt, range.from, range.to)
    )
    .reduce((s, o) => s + (Number(o.shippingFee) || 0), 0);
  const avgRating = useMemo(() => {
    if (displayStats.length === 0) return 0;
    return Math.round((displayStats.reduce((s, x) => s + x.rating, 0) / displayStats.length) * 10) / 10;
  }, [displayStats]);
  const satisfactionPct = useMemo(() => {
    const rated = periodOrders.filter(
      (o) =>
        Number(o.serviceRating) > 0 &&
        inRange(o.updatedAt || o.createdAt, range.from, range.to)
    );
    if (rated.length === 0) return null;
    const avg = rated.reduce((s, o) => s + Number(o.serviceRating), 0) / rated.length;
    return Math.round((avg / 5) * 100);
  }, [periodOrders, range.from, range.to]);
  const cancelRatePct = useMemo(() => {
    const total = periodOrders.length;
    if (!total) return null;
    return Math.round((cancelled / total) * 1000) / 10;
  }, [periodOrders.length, cancelled]);
  const avgAssignMin = useMemo(() => {
    const vals = displayStats.map((s) => s.avgAssignMin).filter((n): n is number => n != null);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }, [displayStats]);
  const topPerformer = useMemo(() => {
    if (!displayStats.length) return null;
    return [...displayStats].sort((a, b) => b.performanceIndex - a.performanceIndex)[0];
  }, [displayStats]);

  const selected = selectedDriverId
    ? stats.find((s) => s.driver.id === selectedDriverId) || null
    : null;
  const selectedDriverProfile =
    approvedDrivers.find((d) => d.id === selectedDriverId) || null;
  const selectedOrders = selected
    ? orders.filter((o) => o.assignedDriverId === selected.driver.id)
    : [];
  const selectedReviews = selected ? reviews.filter((r) => r.driverId === selected.driver.id) : [];

  const selectedDriverLabel = selectedDriverProfile
    ? selectedDriverProfile.fullName
    : 'Toda la flota';

  const handleRate = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const ord = selectedOrders.find((o) => o.id === orderIdForRating);
      await submitDriverReview({
        driverId: selected.driver.id,
        driverName: selected.driver.fullName,
        orderId: ord?.id,
        trackingCode: ord?.trackingCode,
        stars,
        comment: comment.trim(),
        authorRole: 'admin',
        authorName: adminName,
      });
      setComment('');
      setStars(5);
    } finally {
      setSaving(false);
    }
  };

  const exportDriverReport = () => {
    const rows = displayStats.map((s) => ({
      Motorizado: s.driver.fullName,
      Placa: s.driver.plateNumber || '',
      Cedula: s.driver.documentId || '',
      Email: s.driver.email || '',
      Estado: s.driver.suspended ? 'Suspendido' : s.driver.isActive ? 'Activo' : 'Inactivo',
      Entregas: s.delivered,
      Cancelados: s.cancelled,
      En_curso: s.inProgress,
      Exito_pct: s.successPct,
      Indice_desempeno: s.performanceIndex,
      Gestion_avg_min: s.avgAssignMin ?? '',
      Calificacion: s.rating,
      Resenas: s.reviewCount,
      Recaudo_COP: Math.round(s.revenue),
      Ticket_promedio_COP: Math.round(s.avgFee),
    }));
    downloadExcel(
      `domiclick-metricas-repartidores-${range.from.toISOString().slice(0, 10)}.xls`,
      rows,
      'Metricas'
    );
  };

  const exportPayrollCsv = () => {
    const rows = scopedPayrollLines.map((l) => ({
      Motorizado: l.driverName,
      Placa: l.plateNumber,
      Cedula: l.documentId,
      Entregas: l.deliveries,
      Cancelados: l.cancelled,
      Recaudo_fletes_COP: Math.round(l.grossFees),
      Comision_COP: Math.round(l.commission),
      Pago_por_entrega_COP: Math.round(l.perDeliveryPay),
      Bono_rating_COP: Math.round(l.ratingBonus),
      Base_COP: Math.round(l.basePay),
      Rating: l.ratingAvg,
      Total_a_pagar_COP: Math.round(l.total),
    }));
    downloadExcel(
      `domiclick-nomina-${range.from.toISOString().slice(0, 10)}.xls`,
      rows,
      'Nomina'
    );
  };

  const exportFullJson = () => {
    downloadTextFile(
      `domiclick-informe-avanzado-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          period: range.label,
          kpis: { delivered, pending, transit, cancelled, revenue, avgRating, fleet: stats.length },
          drivers: stats,
          payroll: { settings: payrollSettings, lines: payrollLines, grandTotal: payrollTotal },
          reviews,
        },
        null,
        2
      ),
      'application/json'
    );
  };

  const exportOrdersCsv = () => {
    const rows = scopedOrders.map((o) => ({
      Tracking: o.trackingCode || o.id,
      Cliente: o.customerName,
      Destino: o.deliveryAddress,
      Estado: o.status,
      Motorizado: o.assignedDriverName || '',
      Flete_COP: o.shippingFee || 0,
      Calificacion: o.serviceRating || '',
      Creado: o.createdAt,
      Actualizado: o.updatedAt,
    }));
    downloadExcel(`domiclick-envios-${new Date().toISOString().slice(0, 10)}.xls`, rows, 'Envios');
  };

  const persistPayroll = async (status: 'draft' | 'approved') => {
    setSaving(true);
    try {
      await savePayrollRun({
        periodStart: range.from.toISOString(),
        periodEnd: range.to.toISOString(),
        periodLabel: range.label,
        settingsSnapshot: payrollSettings,
        lines: payrollLines,
        grandTotal: payrollTotal,
        createdBy: adminName,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  const allTabs: { id: ControlTab; label: string; icon: React.ReactNode }[] = [
    { id: 'metricas', label: 'Métricas', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'repartidores', label: 'Repartidores', icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'nomina', label: 'Nómina', icon: <Wallet className="w-3.5 h-3.5" /> },
    { id: 'informes', label: 'Informes', icon: <Download className="w-3.5 h-3.5" /> },
  ];
  const tabs = readOnly ? allTabs.filter((t) => t.id === 'informes') : allTabs;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#142340] pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white font-display italic tracking-tight flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#2B6CFF]" />
            Control Supremo
          </h2>
          <p className="text-xs text-slate-400 font-tech mt-1">
            {readOnly
              ? 'Descarga informes operativos · solo lectura'
              : 'Métricas reales · calificaciones · nómina · informes descargables'}
          </p>
          <p className="text-[11px] text-[#00E5FF] font-tech font-bold mt-1.5">
            Vista: {selectedDriverLabel}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-[#0A1122] p-1 rounded-xl border border-[#1A2D52] text-[11px] font-bold">
          {(['day', 'week', 'month', 'all'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === p ? 'bg-[#2B6CFF] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {p === 'day' ? 'Diario' : p === 'week' ? 'Semana' : p === 'month' ? 'Mes' : 'Todo'}
            </button>
          ))}
        </div>
      </div>

      {/* Dropdown transportador con foto de perfil */}
      <div className="space-y-2">
        <div className="text-[10px] text-slate-500 font-tech uppercase tracking-wider">
          Transportadores · elige uno para ver sus datos
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedDriverId('');
              setDriverMenuOpen(false);
            }}
            className={`px-3 py-2 rounded-xl text-[11px] font-black transition border ${
              !selectedDriverId
                ? 'bg-[#2B6CFF] border-[#2B6CFF] text-white shadow-[0_0_16px_rgba(43,108,255,0.35)]'
                : 'bg-[#0A1122] border-[#1A2D52] text-slate-400 hover:text-white hover:border-[#2B6CFF]/50'
            }`}
          >
            Todos ({approvedDrivers.length})
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setDriverMenuOpen((o) => !o)}
              className={`flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-2xl text-[11px] font-bold transition border min-w-[12rem] ${
                selectedDriverId
                  ? 'bg-[#FF5722] border-[#FF5722] text-white shadow-[0_0_16px_rgba(255,87,34,0.35)]'
                  : 'bg-[#0A1122] border-[#1A2D52] text-slate-300 hover:border-[#FF5722]/50'
              }`}
            >
              {selectedDriverProfile?.photoUrl ? (
                <img
                  src={selectedDriverProfile.photoUrl}
                  alt={selectedDriverProfile.fullName}
                  className="w-9 h-9 rounded-xl object-cover border border-white/20 shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-[#121D36] border border-[#1A2D52] flex items-center justify-center shrink-0">
                  <UsersRound className="w-4 h-4 text-slate-400" />
                </div>
              )}
              <div className="min-w-0 text-left flex-1">
                <div className="truncate font-black">
                  {selectedDriverProfile?.fullName || 'Seleccionar transportador'}
                </div>
                <div className="text-[9px] opacity-80 font-tech truncate">
                  {selectedDriverProfile
                    ? `Placa ${selectedDriverProfile.plateNumber || '—'}`
                    : `${approvedDrivers.length} disponibles`}
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 shrink-0 transition ${driverMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {driverMenuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Cerrar menú"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setDriverMenuOpen(false)}
                />
                <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[min(100vw-2rem,20rem)] max-h-72 overflow-y-auto rounded-2xl border border-[#1A2D52] bg-[#0A1020] shadow-[0_16px_40px_rgba(0,0,0,0.65)]">
                  {approvedDrivers.length === 0 ? (
                    <p className="text-[11px] text-slate-500 px-3 py-4 text-center">
                      Sin motorizados aprobados aún
                    </p>
                  ) : (
                    approvedDrivers.map((d) => {
                      const active = selectedDriverId === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setSelectedDriverId(d.id);
                            setDriverMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition border-b border-[#121D36] last:border-0 ${
                            active
                              ? 'bg-[#FF5722]/20'
                              : 'hover:bg-[#121D36]'
                          }`}
                        >
                          {d.photoUrl ? (
                            <img
                              src={d.photoUrl}
                              alt={d.fullName}
                              className="w-10 h-10 rounded-xl object-cover border border-[#1A2D52] shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-[#121D36] flex items-center justify-center shrink-0">
                              <DomiHelmetIcon
                                className="w-5 h-5"
                                color={d.isActive ? '#00E676' : '#2B6CFF'}
                              />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-white truncate">{d.fullName}</div>
                            <div className="text-[10px] text-slate-400 font-tech truncate">
                              {d.plateNumber || 'Sin placa'} ·{' '}
                              {d.suspended ? 'Suspendido' : d.isActive ? 'Activo' : 'Inactivo'}
                            </div>
                          </div>
                          {active && (
                            <CheckCircle2 className="w-4 h-4 text-[#FF5722] shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2.5">
        {[
          { label: 'Entregados', value: delivered, color: 'text-[#00E676]' },
          { label: 'En tránsito', value: transit, color: 'text-[#00E5FF]' },
          { label: 'Pendientes', value: pending, color: 'text-amber-400' },
          { label: 'Cancelación %', value: cancelRatePct != null ? `${cancelRatePct}%` : '—', color: 'text-red-300' },
          { label: 'Recaudo', value: formatCOP(revenue), color: 'text-white' },
          {
            label: selectedDriverId ? 'Satisfacción' : 'Satisfacción central',
            value:
              satisfactionPct != null
                ? `${satisfactionPct}%`
                : avgRating
                  ? `${avgRating}★`
                  : '—',
            color: 'text-amber-300',
          },
          {
            label: 'Gestión avg',
            value: avgAssignMin != null ? `${avgAssignMin} min` : '—',
            color: 'text-[#7aa2ff]',
          },
          { label: 'Nómina periodo', value: formatCOP(payrollTotal), color: 'text-[#FF5722]' },
        ].map((k) => (
          <div key={k.label} className="bg-[#0A1020] border border-[#162748] rounded-2xl p-3">
            <div className="text-[10px] text-slate-500 font-tech uppercase">{k.label}</div>
            <div className={`text-lg font-black font-tech mt-0.5 ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {topPerformer && topPerformer.delivered > 0 && (
        <div className="bg-[#0A1020] border border-amber-500/35 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] text-amber-300/90 font-tech uppercase tracking-wider">
              Mejor desempeño del periodo
            </div>
            <div className="text-sm font-black text-white mt-0.5">
              {topPerformer.driver.fullName}{' '}
              <span className="text-amber-300 font-tech">
                · índice {topPerformer.performanceIndex}/100
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {topPerformer.delivered} entregas · {topPerformer.successPct}% éxito ·{' '}
              {topPerformer.rating.toFixed(1)}★
            </div>
          </div>
          <div className="text-[10px] text-slate-500 font-tech max-w-xs text-right">
            Índice = entregas + éxito + rating − cancelaciones (plan de reconocimiento mensual)
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 bg-[#0A1122] p-1 rounded-2xl border border-[#1A2D52] w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              tab === t.id ? 'bg-[#2B6CFF] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'metricas' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#0A1020] border border-[#162748] rounded-2xl p-4">
            <LineChart
              points={daily}
              valueKey="delivered"
              color="#00E676"
              label={`Entregas · ${seriesCaption}${selectedDriverId ? ` · ${selectedDriverLabel}` : ''}`}
            />
          </div>
          <div className="bg-[#0A1020] border border-[#162748] rounded-2xl p-4">
            <LineChart
              points={daily}
              valueKey="created"
              color="#2B6CFF"
              label={`Solicitudes creadas · ${seriesCaption}${selectedDriverId ? ` · ${selectedDriverLabel}` : ''}`}
            />
          </div>
          <div className="bg-[#0A1020] border border-[#162748] rounded-2xl p-4">
            <LineChart
              points={daily}
              valueKey="revenue"
              color="#FF5722"
              label={`Recaudo (COP) · ${seriesCaption}${selectedDriverId ? ` · ${selectedDriverLabel}` : ''}`}
            />
          </div>
          <div className="bg-[#0A1020] border border-[#162748] rounded-2xl p-4">
            <div className="text-[11px] text-slate-400 font-tech uppercase mb-3">
              Ranking de entregas · {range.label}
              {selectedDriverId ? ` · ${selectedDriverLabel}` : ''}
            </div>
            <BarChart
              items={displayStats.map((s) => ({
                name: s.driver.fullName,
                delivered: s.delivered,
                rating: s.rating,
              }))}
            />
          </div>
          <div className="lg:col-span-2 bg-[#0A1020] border border-[#162748] rounded-2xl p-4">
            <div className="text-[11px] text-slate-400 font-tech uppercase mb-3">
              Distribución operativa · {range.label}
              {selectedDriverId ? ` · ${selectedDriverLabel}` : ''}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Entregados', n: delivered, color: 'bg-[#00E676]' },
                { label: 'Tránsito', n: transit, color: 'bg-[#2B6CFF]' },
                { label: 'Pendientes', n: pending, color: 'bg-[#FF5722]' },
                { label: 'Cancelados', n: cancelled, color: 'bg-red-500' },
              ].map((row) => {
                const totalInPeriod = delivered + transit + pending + cancelled;
                const pct = totalInPeriod
                  ? Math.round((row.n / totalInPeriod) * 100)
                  : 0;
                return (
                  <div key={row.label}>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-300">{row.label}</span>
                      <span className="text-white font-tech font-bold">
                        {row.n} · {pct}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#121D36] overflow-hidden">
                      <div className={`h-full ${row.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'repartidores' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-7 space-y-2">
            {stats.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-400 border border-dashed border-[#1a2744] rounded-2xl">
                Sin motorizados aprobados. Aprueba perfiles en Usuarios.
              </div>
            ) : (
              stats.map((s) => (
                <button
                  key={s.driver.id}
                  type="button"
                  onClick={() => setSelectedDriverId(s.driver.id)}
                  className={`w-full text-left bg-[#0A1020] border rounded-2xl p-3.5 transition ${
                    selected?.driver.id === s.driver.id
                      ? 'border-[#2B6CFF]'
                      : 'border-[#162748] hover:border-[#2B6CFF]/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <DomiHelmetIcon
                        className="w-8 h-8 shrink-0"
                        color={s.driver.suspended ? '#F87171' : s.driver.isActive ? '#00E676' : '#2B6CFF'}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{s.driver.fullName}</div>
                        <div className="text-[10px] text-slate-500 font-tech">
                          {s.driver.plateNumber} · {s.delivered} entregas · índice{' '}
                          {s.performanceIndex}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Stars value={s.rating} />
                      <div className="text-[10px] text-slate-400 font-tech mt-0.5">
                        {s.successPct}% éxito · {formatCOP(s.revenue)}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="xl:col-span-5 bg-[#0A1020] border border-[#162748] rounded-2xl p-4 space-y-4">
            {!selected ? (
              <p className="text-xs text-slate-400 py-8 text-center">Selecciona un repartidor.</p>
            ) : (
              <>
                <div>
                  <h3 className="text-base font-black text-white">{selected.driver.fullName}</h3>
                  <p className="text-[11px] text-slate-400 font-tech">
                    {selected.driver.email} · CC {selected.driver.documentId}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Stars value={selected.rating} size={16} />
                    <span className="text-xs text-amber-300 font-tech">
                      {selected.rating.toFixed(1)} ({selected.reviewCount} reseñas)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { l: 'Índice', v: `${selected.performanceIndex}/100` },
                    { l: 'Gestión avg', v: selected.avgAssignMin != null ? `${selected.avgAssignMin} min` : '—' },
                    { l: 'Entregas', v: selected.delivered },
                    { l: 'En curso', v: selected.inProgress },
                    { l: 'Cancelados', v: selected.cancelled },
                    { l: 'Éxito', v: `${selected.successPct}%` },
                    { l: 'Recaudo', v: formatCOP(selected.revenue) },
                    { l: 'Ticket prom.', v: formatCOP(selected.avgFee) },
                  ].map((x) => (
                    <div key={x.l} className="bg-[#070B16] border border-[#162748] rounded-xl p-2.5">
                      <div className="text-[10px] text-slate-500 uppercase">{x.l}</div>
                      <div className="text-sm font-black text-white font-tech">{x.v}</div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      toggleDriverActiveState(selected.driver.id, !selected.driver.isActive)
                    }
                    className="text-[11px] font-bold px-3 py-2 rounded-xl border border-[#1a2744] text-slate-200 hover:border-[#00E5FF]/50 flex items-center gap-1"
                  >
                    <Power className="w-3.5 h-3.5" />
                    {selected.driver.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDriverSuspended(selected.driver.id, !selected.driver.suspended)}
                    className="text-[11px] font-bold px-3 py-2 rounded-xl border border-red-500/30 text-red-300 hover:bg-red-950/30 flex items-center gap-1"
                  >
                    {selected.driver.suspended ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Rehabilitar
                      </>
                    ) : (
                      <>
                        <Ban className="w-3.5 h-3.5" /> Suspender
                      </>
                    )}
                  </button>
                </div>

                <div className="border-t border-[#162748] pt-3 space-y-2">
                  <div className="text-[11px] font-tech uppercase text-slate-400">Calificar servicio</div>
                  <select
                    className="w-full bg-[#070B16] border border-[#1a2744] rounded-lg text-xs px-2 py-2 text-white"
                    value={orderIdForRating}
                    onChange={(e) => setOrderIdForRating(e.target.value)}
                  >
                    <option value="">Sin pedido asociado</option>
                    {selectedOrders.slice(0, 20).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.trackingCode} · {o.status}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setStars(n)}
                        className="p-1"
                      >
                        <Star
                          className="w-6 h-6"
                          fill={n <= stars ? '#F59E0B' : 'transparent'}
                          stroke={n <= stars ? '#F59E0B' : '#475569'}
                        />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Comentario de desempeño (puntualidad, trato, estado del paquete…)"
                    className="w-full bg-[#070B16] border border-[#1a2744] rounded-xl text-xs px-3 py-2 text-white min-h-[72px]"
                  />
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleRate}
                    className="w-full py-2.5 rounded-xl bg-[#2B6CFF] text-white text-xs font-black"
                  >
                    Guardar calificación en Firebase
                  </button>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto">
                  <div className="text-[11px] font-tech uppercase text-slate-400">Historial de reseñas</div>
                  {selectedReviews.length === 0 ? (
                    <p className="text-[11px] text-slate-500">Aún no hay reseñas.</p>
                  ) : (
                    selectedReviews.map((r) => (
                      <div key={r.id} className="bg-[#070B16] rounded-xl p-2.5 border border-[#162748]">
                        <div className="flex justify-between">
                          <Stars value={r.stars} size={12} />
                          <span className="text-[10px] text-slate-500">
                            {new Date(r.createdAt).toLocaleString('es-CO')}
                          </span>
                        </div>
                        {r.comment && <p className="text-[11px] text-slate-300 mt-1">{r.comment}</p>}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'nomina' && (
        <div className="space-y-4">
          <div className="bg-[#0A1020] border border-[#162748] rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <label className="text-[11px] text-slate-400 space-y-1">
              % comisión sobre flete
              <input
                type="number"
                min={0}
                max={100}
                value={settingsDraft.commissionPercent}
                onChange={(e) =>
                  setSettingsDraft({ ...settingsDraft, commissionPercent: Number(e.target.value) })
                }
                className="w-full bg-[#070B16] border border-[#1a2744] rounded-lg px-2 py-2 text-white text-sm"
              />
            </label>
            <label className="text-[11px] text-slate-400 space-y-1">
              Pago fijo / entrega (COP)
              <input
                type="number"
                min={0}
                value={settingsDraft.payPerDelivery}
                onChange={(e) =>
                  setSettingsDraft({ ...settingsDraft, payPerDelivery: Number(e.target.value) })
                }
                className="w-full bg-[#070B16] border border-[#1a2744] rounded-lg px-2 py-2 text-white text-sm"
              />
            </label>
            <label className="text-[11px] text-slate-400 space-y-1">
              Umbral rating bono
              <input
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={settingsDraft.ratingBonusThreshold}
                onChange={(e) =>
                  setSettingsDraft({ ...settingsDraft, ratingBonusThreshold: Number(e.target.value) })
                }
                className="w-full bg-[#070B16] border border-[#1a2744] rounded-lg px-2 py-2 text-white text-sm"
              />
            </label>
            <label className="text-[11px] text-slate-400 space-y-1">
              Bono rating (COP)
              <input
                type="number"
                min={0}
                value={settingsDraft.ratingBonusAmount}
                onChange={(e) =>
                  setSettingsDraft({ ...settingsDraft, ratingBonusAmount: Number(e.target.value) })
                }
                className="w-full bg-[#070B16] border border-[#1a2744] rounded-lg px-2 py-2 text-white text-sm"
              />
            </label>
            <label className="text-[11px] text-slate-400 space-y-1">
              Base del periodo (COP)
              <input
                type="number"
                min={0}
                value={settingsDraft.basePay}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, basePay: Number(e.target.value) })}
                className="w-full bg-[#070B16] border border-[#1a2744] rounded-lg px-2 py-2 text-white text-sm"
              />
            </label>
            <div className="md:col-span-2 lg:col-span-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => savePayrollSettings(settingsDraft)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2B6CFF] text-white text-xs font-black"
              >
                <Save className="w-3.5 h-3.5" /> Guardar reglas en Firebase
              </button>
              <span className="text-[11px] text-slate-500 self-center">
                Periodo: {range.label} · Total estimado {formatCOP(payrollTotal)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto bg-[#0A1020] border border-[#162748] rounded-2xl">
            <table className="w-full text-[11px] min-w-[760px]">
              <thead>
                <tr className="text-left text-slate-400 border-b border-[#162748] font-tech uppercase">
                  <th className="p-3">Motorizado</th>
                  <th className="p-3">Entregas</th>
                  <th className="p-3">Rating</th>
                  <th className="p-3">Fletes</th>
                  <th className="p-3">Comisión</th>
                  <th className="p-3">Bono</th>
                  <th className="p-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {scopedPayrollLines.map((l) => (
                  <tr key={l.driverId} className="border-b border-[#121D36] text-slate-200">
                    <td className="p-3">
                      <div className="font-bold text-white">{l.driverName}</div>
                      <div className="text-slate-500">{l.plateNumber} · {l.documentId}</div>
                    </td>
                    <td className="p-3 font-tech">{l.deliveries}</td>
                    <td className="p-3">{l.ratingAvg.toFixed(1)}★</td>
                    <td className="p-3">{formatCOP(l.grossFees)}</td>
                    <td className="p-3">{formatCOP(l.commission + l.perDeliveryPay)}</td>
                    <td className="p-3">{formatCOP(l.ratingBonus)}</td>
                    <td className="p-3 font-black text-[#00E676]">{formatCOP(l.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-black text-white">
                  <td className="p-3" colSpan={6}>
                    Total nómina
                  </td>
                  <td className="p-3 text-[#FF5722]">{formatCOP(payrollTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportPayrollCsv}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#1a2744] text-xs font-bold text-slate-200 hover:border-[#00E5FF]/40"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Descargar CSV nómina
            </button>
            <button
              type="button"
              disabled={saving || payrollLines.length === 0}
              onClick={() => persistPayroll('draft')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#1a2744] text-xs font-bold text-slate-200"
            >
              Guardar borrador
            </button>
            <button
              type="button"
              disabled={saving || payrollLines.length === 0}
              onClick={() => persistPayroll('approved')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FF5722] text-white text-xs font-black"
            >
              Aprobar y registrar nómina
            </button>
          </div>

          {payrollRuns.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-tech uppercase text-slate-400">Nóminas registradas</h3>
              {payrollRuns.slice(0, 8).map((r) => (
                <div
                  key={r.id}
                  className="bg-[#0A1020] border border-[#162748] rounded-xl p-3 flex justify-between text-xs"
                >
                  <div>
                    <div className="text-white font-bold">{r.periodLabel}</div>
                    <div className="text-slate-500">
                      {new Date(r.createdAt).toLocaleString('es-CO')} · {r.createdBy}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-[#00E676]">{formatCOP(r.grandTotal)}</div>
                    <div className="text-[10px] uppercase text-slate-500">{r.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'informes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            {
              title: 'Métricas por repartidor',
              desc: 'Entregas, éxito, recaudo, rating y estado de flota.',
              action: exportDriverReport,
              icon: <FileSpreadsheet className="w-5 h-5 text-[#00E5FF]" />,
            },
            {
              title: 'Nómina del periodo',
              desc: 'Comisiones, bonos y total a pagar en CSV (Excel).',
              action: exportPayrollCsv,
              icon: <Wallet className="w-5 h-5 text-[#FF5722]" />,
            },
            {
              title: 'Listado de envíos',
              desc: 'Todos los pedidos con estado, flete y calificación.',
              action: exportOrdersCsv,
              icon: <FileSpreadsheet className="w-5 h-5 text-[#00E676]" />,
            },
            {
              title: 'Informe avanzado JSON',
              desc: 'Paquete completo: KPIs, stats, reseñas y nómina.',
              action: exportFullJson,
              icon: <FileJson className="w-5 h-5 text-amber-300" />,
            },
          ].map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={card.action}
              className="text-left bg-[#0A1020] border border-[#162748] hover:border-[#2B6CFF]/50 rounded-2xl p-5 transition"
            >
              <div className="flex items-start gap-3">
                {card.icon}
                <div>
                  <div className="text-sm font-black text-white">{card.title}</div>
                  <p className="text-[12px] text-slate-400 mt-1">{card.desc}</p>
                  <span className="inline-flex items-center gap-1 text-[11px] text-[#2B6CFF] font-bold mt-3">
                    <Download className="w-3.5 h-3.5" /> Descargar
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
