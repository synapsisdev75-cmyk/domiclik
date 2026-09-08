import {
  composeFullAddress,
  partsFromFullAddress,
  parseColombianCompoundAddress,
  type AddressParts,
} from '../lib/addressParts';
import type { LatLng } from '../lib/geo';
import { PlaceSearchField } from './PlaceSearchField';

type StructuredAddressFieldsProps = {
  title: string;
  accent: 'pickup' | 'delivery';
  inputPrefix: string;
  parts: AddressParts;
  forceClose?: boolean;
  onPartsChange: (parts: AddressParts) => void;
  onPlacePicked: (hit: LatLng & { label: string }) => void;
  onActivate?: () => void;
  mapAnchoredPin?: LatLng | null;
  onUnlockMapPin?: () => void;
};

/**
 * Solo buscador de direcciones (estilo Maps): pegar, editar, Buscar.
 * Sin campos tipo/número/letra/placa.
 */
export function StructuredAddressFields({
  title,
  accent,
  inputPrefix,
  parts,
  forceClose,
  onPartsChange,
  onPlacePicked,
  onActivate,
  mapAnchoredPin = null,
  onUnlockMapPin,
}: StructuredAddressFieldsProps) {
  // No trim aquí: si se quita el espacio final, el input controlado no deja espaciar.
  const geocodeSuffix = [parts.city || 'Villavicencio', parts.department || 'Meta']
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');

  return (
    <div className="address-fields space-y-2.5 rounded-2xl border border-[var(--domi-border)] bg-[rgba(5,8,15,0.35)] p-3">
      <p
        className="text-xs font-bold uppercase tracking-wide"
        style={{ color: accent === 'pickup' ? 'var(--domi-cyan)' : 'var(--domi-orange)' }}
      >
        {title}
      </p>

      <PlaceSearchField
        label="Buscar dirección *"
        required
        accent={accent}
        inputName={`${inputPrefix}-street`}
        value={parts.street}
        forceClose={forceClose}
        placeholder="Ej. remanso rosablanca mz 25 casa 1"
        writeBackLabel
        geocodeSuffix={geocodeSuffix}
        mapAnchoredPin={mapAnchoredPin}
        onUnlockMapPin={onUnlockMapPin}
        onQueryChange={(street) => {
          // Edición libre estilo Maps: conservar espacios; no rearmar vía estructurada.
          onPartsChange({
            ...parts,
            street,
            roadType: 'Otro',
            roadNumber: '',
            roadLetter: '',
            roadCardinal: '',
            cross: '',
            crossLetter: '',
            crossCardinal: '',
            houseNumber: '',
          });
        }}
        onPlacePicked={(hit) => {
          // “mz b2 cs 4 apto 202 urb charrascal” → pin en Charrascal + complemento.
          const typed = parseColombianCompoundAddress(parts.street);
          const complement = [typed.complement, parts.general]
            .map((s) => s.trim())
            .filter(Boolean)
            .filter((s, i, arr) => arr.indexOf(s) === i)
            .join(' · ');
          const next = partsFromFullAddress(hit.label, complement);
          onPartsChange(next);
          onPlacePicked({
            ...hit,
            label: composeFullAddress(next) || hit.label,
          });
        }}
        onActivate={onActivate}
      />

      <label className="block">
        <span className="address-label mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--domi-muted)]">
          Complemento (opcional)
        </span>
        <input
          className="field-input"
          name={`${inputPrefix}-general`}
          value={parts.general}
          onFocus={onActivate}
          onChange={(e) => onPartsChange({ ...parts, general: e.target.value })}
          placeholder="Mz, casa, apto, torre, referencia…"
        />
      </label>
    </div>
  );
}
