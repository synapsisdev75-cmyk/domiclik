import React, { useState } from 'react';
import { X, Plus, Phone, User } from 'lucide-react';
import { createOrder, fetchAllDrivers, fetchDispatchSettings } from '../../lib/firebase';
import { dispatchPendingOrder, getBusyDriverIds } from '../../lib/autoDispatch';
import { DomiCargoIcon } from '../ui/CustomIcons';
import { OpsPlaceSearch } from './OpsPlaceSearch';
import type { DeliveryOrder, MotorizadoDriver } from '../../types';

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders?: DeliveryOrder[];
  drivers?: MotorizadoDriver[];
}

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
  isOpen,
  onClose,
  orders = [],
  drivers: driversProp,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [pickupCoords, setPickupCoords] = useState({ lat: 4.142, lng: -73.6266 });
  const [deliveryCoords, setDeliveryCoords] = useState({ lat: 4.142, lng: -73.6266 });
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryAddress || !customerName) return;

    setIsSubmitting(true);
    setStatusMsg('Creando pedido…');
    try {
      const order = await createOrder({
        customerName,
        customerPhone,
        pickupAddress,
        deliveryAddress,
        description: description || 'Envío de paquete urgente',
        itemType: 'paquete_pequeno',
        declaredValue: 20000,
        shippingFee: 0,
        status: 'pending',
        assignedDriverId: null,
        assignedDriverName: null,
        pickupCoords: { lat: pickupCoords.lat, lng: pickupCoords.lng, addressName: pickupAddress },
        deliveryCoords: { lat: deliveryCoords.lat, lng: deliveryCoords.lng, addressName: deliveryAddress },
      });

      setStatusMsg('Asignando al conductor activo libre más cercano…');
      const drivers = driversProp?.length ? driversProp : await fetchAllDrivers();
      const settings = await fetchDispatchSettings();
      const result = await dispatchPendingOrder(order, drivers, settings, {
        busyDriverIds: getBusyDriverIds(orders),
      });
      if (result.assigned) {
        setStatusMsg(
          `Asignado a ${result.driverName} · ${result.assignedDistanceKm?.toFixed(1)} km · $${result.routePrice?.toLocaleString('es-CO')}`
        );
      } else {
        setStatusMsg(
          result.reason === 'no_free_active_driver'
            ? `Pedido creado. Sin conductor activo y libre cerca (radio ${settings.searchRadiusKm} km).`
            : `Pedido creado. Precio: $${result.routePrice?.toLocaleString('es-CO') || '—'} · ${result.reason || 'pendiente'}`
        );
      }
      setTimeout(() => onClose(), 900);
    } catch (err) {
      console.error('Error creating order:', err);
      setStatusMsg('Error al crear / despachar el pedido.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0A0F1D] border-2 border-[#FF5722] w-full max-w-lg rounded-3xl p-6 shadow-[0_0_50px_rgba(255,87,34,0.3)] relative text-white font-mono">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-[#142038] hover:bg-[#1E2E50] text-slate-300 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#FF5722]/20 border border-[#FF5722] flex items-center justify-center">
            <DomiCargoIcon className="w-7 h-7" color="#FF5722" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white italic">NUEVA SOLICITUD DE ENVÍO</h3>
            <p className="text-xs text-[#00F0FF]">
              Auto-despacho al más cercano · precio solo admin
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-slate-300 font-bold block mb-1">Nombre del Cliente</label>
            <div className="relative">
              <User className="w-4 h-4 text-[#00F0FF] absolute left-3 top-3" />
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ej. María Fernanda"
                className="w-full bg-[#111A2E] border border-[#1E2E50] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00F0FF]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-300 font-bold block mb-1">Teléfono Contacto</label>
            <div className="relative">
              <Phone className="w-4 h-4 text-[#00F0FF] absolute left-3 top-3" />
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Ej. 312 456 7890"
                className="w-full bg-[#111A2E] border border-[#1E2E50] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00F0FF]"
              />
            </div>
          </div>

          <OpsPlaceSearch
            label="Dirección de Origen"
            accent="pickup"
            required
            value={pickupAddress}
            placeholder="Restaurante, heladería, comercio…"
            onQueryChange={setPickupAddress}
            onPlacePicked={(hit) => {
              setPickupAddress(hit.label);
              setPickupCoords({ lat: hit.lat, lng: hit.lng });
            }}
          />

          <OpsPlaceSearch
            label="Dirección de Destino en Villavicencio"
            accent="delivery"
            required
            value={deliveryAddress}
            placeholder="Negocio, barrio o dirección…"
            onQueryChange={setDeliveryAddress}
            onPlacePicked={(hit) => {
              setDeliveryAddress(hit.label);
              setDeliveryCoords({ lat: hit.lat, lng: hit.lng });
            }}
          />

          <div>
            <label className="text-xs text-slate-300 font-bold block mb-1">Detalle del Paquete</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Documentos / Regalo"
              className="w-full bg-[#111A2E] border border-[#1E2E50] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00F0FF]"
            />
            <p className="text-[10px] text-slate-500 mt-1.5">
              El precio se calcula automáticamente (base + km) y solo lo ve el administrador.
            </p>
          </div>

          {statusMsg && (
            <p className="text-[11px] text-[#00E5FF] font-tech bg-[#0A1122] border border-[#1A2D52] rounded-xl px-3 py-2">
              {statusMsg}
            </p>
          )}

          <div className="pt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-[#142038] text-slate-300 hover:bg-[#1E2E50] text-xs font-bold transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#FF5722] to-[#E64A19] text-white font-black text-xs transition shadow-[0_0_20px_rgba(255,87,34,0.5)] hover:scale-105 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>{isSubmitting ? 'DESPACHANDO…' : 'CREAR Y AUTO-ASIGNAR'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
