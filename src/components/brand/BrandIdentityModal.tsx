import React from 'react';
import { X, Sparkles, Check, MousePointer, MapPin, Shield, Zap, Shirt, Package, Smartphone, Copy } from 'lucide-react';
import { DomiClickBrandHeader } from '../DomiClickBrandHeader';

interface BrandIdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BrandIdentityModal: React.FC<BrandIdentityModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const copyHex = (hex: string) => {
    navigator.clipboard.writeText(hex);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-[#0d121d] border border-[#334155] rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative text-[#f1f5f9] domiclick-flow-pattern">
        {/* Header Stream Bar */}
        <div className="h-2 w-full bg-gradient-to-r from-[#0052FF] via-[#FF5722] to-[#0052FF]" />

        {/* Modal Top Bar */}
        <div className="p-6 border-b border-[#1E293B] flex items-center justify-between sticky top-0 bg-[#0f172a]/95 backdrop-blur-md z-10">
          <DomiClickBrandHeader compact showSlogan={true} />
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-[#1E293B] hover:bg-[#334155] text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 space-y-8">
          {/* Concept Header */}
          <div className="bg-[#1E293B]/80 border border-[#334155] rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none text-8xl font-black">
              ⚡
            </div>
            <span className="text-xs font-bold text-[#FF5722] uppercase tracking-wider block mb-1">
              Manual de Identidad Visual & Estrategia de Marca
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              Ecosistema Visual DomiClick
            </h2>
            <p className="text-sm text-slate-300 mt-2 leading-relaxed">
              DomiClick nace de la fusión entre la inmediatez (<strong>Click</strong>) y la eficiencia del servicio a domicilio (<strong>Domicilio</strong>). Transmite rapidez, confianza, tecnología y excelencia en cada entrega en Villavicencio, Colombia.
            </p>
          </div>

          {/* Section 1: Slogans */}
          <div className="space-y-4">
            <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#FF5722]" />
              <span>1. Esloganes de Posicionamiento</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#1E293B] border-2 border-[#FF5722] p-5 rounded-2xl relative shadow-lg">
                <span className="bg-[#FF5722] text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider absolute -top-3 left-4">
                  Opción Principal
                </span>
                <p className="text-base font-black text-white mt-1">
                  "DomiClick: Excelencia a un click de ti."
                </p>
                <p className="text-xs text-slate-300 mt-2">
                  Enfocado en la facilidad, la inmediatez y la máxima calidad del servicio.
                </p>
              </div>

              <div className="bg-[#1E293B] border border-[#334155] p-5 rounded-2xl relative shadow-md">
                <span className="bg-[#0052FF] text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider absolute -top-3 left-4">
                  Enfocado en Velocidad
                </span>
                <p className="text-base font-extrabold text-white mt-1">
                  "Tu pedido seguro, en un DomiClick."
                </p>
                <p className="text-xs text-slate-300 mt-2">
                  Asocia la marca con una acción rápida, segura y sin complicaciones.
                </p>
              </div>

              <div className="bg-[#1E293B] border border-[#334155] p-5 rounded-2xl relative shadow-md">
                <span className="bg-slate-700 text-slate-200 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider absolute -top-3 left-4">
                  B2B Corporativo
                </span>
                <p className="text-base font-extrabold text-white mt-1">
                  "Logística y reparto de excelencia."
                </p>
                <p className="text-xs text-slate-300 mt-2">
                  Comunicación comercial sólida para alianzas con empresas.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Isotype Breakdown */}
          <div className="space-y-4">
            <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
              <MousePointer className="w-5 h-5 text-[#0052FF]" />
              <span>2. Diseño del Logotipo e Isotipo</span>
            </h3>

            <div className="bg-[#1E293B]/60 border border-[#334155] p-6 rounded-2xl grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
              <div className="flex flex-col items-center justify-center p-6 bg-[#0f172a] rounded-2xl border border-[#334155] text-center">
                {/* Logo Preview */}
                <div className="w-20 h-20 rounded-3xl bg-[#0052FF] text-white flex items-center justify-center border-4 border-[#FF5722] shadow-2xl relative mb-4">
                  <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                  </svg>
                  <MousePointer className="w-6 h-6 text-[#FF5722] absolute bottom-1 right-1 drop-shadow-md" />
                </div>
                <h4 className="font-black text-2xl text-white italic">Domi<span className="text-[#FF5722]">Click</span></h4>
                <p className="text-xs text-slate-400 font-medium">Excelencia a un click de ti</p>
              </div>

              <div className="space-y-3 text-xs text-slate-300">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-[#0052FF]/20 text-[#0052FF] border border-[#0052FF]/30 shrink-0">
                    <MousePointer className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-bold text-white">Puntero de Click / Flecha Diagonal</h5>
                    <p className="text-slate-400 mt-0.5">Simula velocidad, dinamismo y la inmediatez de un click digital.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-[#FF5722]/20 text-[#FF5722] border border-[#FF5722]/30 shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-bold text-white">PIN GPS Integrado</h5>
                    <p className="text-slate-400 mt-0.5">Representa la precisión geográfica del rastreo en tiempo real.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-slate-700 text-white shrink-0">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-bold text-white">Tipografía Sans Serif Italic</h5>
                    <p className="text-slate-400 mt-0.5">Inclinada sutilmente a la derecha para comunicar aceleración y modernidad.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Official Color Palette */}
          <div className="space-y-4">
            <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#FF5722]" />
              <span>3. Paleta Cromática Corporativa</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Electric Blue */}
              <div className="bg-[#1E293B] border border-[#334155] rounded-2xl overflow-hidden shadow-lg">
                <div className="h-24 bg-[#0052FF] p-3 flex items-end justify-between text-white font-mono font-bold text-xs">
                  <span>Azul Eléctrico</span>
                  <button onClick={() => copyHex('#0052FF')} className="hover:opacity-80">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4 space-y-1">
                  <div className="font-mono text-sm font-black text-white">#0052FF</div>
                  <p className="text-[11px] text-slate-300">
                    Seguridad, tecnología, confianza y profesionalismo. Color primario base.
                  </p>
                </div>
              </div>

              {/* Neon Orange */}
              <div className="bg-[#1E293B] border border-[#334155] rounded-2xl overflow-hidden shadow-lg">
                <div className="h-24 bg-[#FF5722] p-3 flex items-end justify-between text-white font-mono font-bold text-xs">
                  <span>Naranja Neón</span>
                  <button onClick={() => copyHex('#FF5722')} className="hover:opacity-80">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4 space-y-1">
                  <div className="font-mono text-sm font-black text-white">#FF5722</div>
                  <p className="text-[11px] text-slate-300">
                    Energía, rapidez e inmediatez. Utilizado para llamados a la acción (CTA).
                  </p>
                </div>
              </div>

              {/* Slate Graphite */}
              <div className="bg-[#1E293B] border border-[#334155] rounded-2xl overflow-hidden shadow-lg">
                <div className="h-24 bg-[#1E293B] p-3 flex items-end justify-between text-white font-mono font-bold text-xs border-b border-[#334155]">
                  <span>Gris Grafito</span>
                  <button onClick={() => copyHex('#1E293B')} className="hover:opacity-80">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4 space-y-1">
                  <div className="font-mono text-sm font-black text-white">#1E293B</div>
                  <p className="text-[11px] text-slate-300">
                    Elegancia y legibilidad premium para textos y fondos de interfaz.
                  </p>
                </div>
              </div>

              {/* Pure White */}
              <div className="bg-[#1E293B] border border-[#334155] rounded-2xl overflow-hidden shadow-lg">
                <div className="h-24 bg-white p-3 flex items-end justify-between text-slate-900 font-mono font-bold text-xs">
                  <span>Blanco Puro</span>
                  <button onClick={() => copyHex('#FFFFFF')} className="hover:opacity-80">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4 space-y-1">
                  <div className="font-mono text-sm font-black text-white">#FFFFFF</div>
                  <p className="text-[11px] text-slate-300">
                    Contraste, claridad y limpieza gráfica en componentes digitales.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Physical & Digital Brand Applications */}
          <div className="space-y-4">
            <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
              <Shirt className="w-5 h-5 text-[#0052FF]" />
              <span>4. Aplicaciones Físicas y Digitales de Marca</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="bg-[#1E293B]/80 border border-[#334155] p-5 rounded-2xl space-y-2">
                <div className="p-2.5 bg-[#0052FF]/20 text-[#0052FF] rounded-xl w-fit border border-[#0052FF]/30">
                  <Shirt className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-white text-sm">Uniformes de Reparto</h4>
                <p className="text-slate-300 leading-relaxed">
                  Chaqueta o chaleco de alta visibilidad en <strong>Azul Eléctrico (#0052FF)</strong> con isotipo reflectivo en <strong>Naranja Neón (#FF5722)</strong> en pecho y espalda.
                </p>
              </div>

              <div className="bg-[#1E293B]/80 border border-[#334155] p-5 rounded-2xl space-y-2">
                <div className="p-2.5 bg-[#FF5722]/20 text-[#FF5722] rounded-xl w-fit border border-[#FF5722]/30">
                  <Package className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-white text-sm">Maletines Térmicos</h4>
                <p className="text-slate-300 leading-relaxed">
                  Cajas térmicas en Azul con bordes reflectivos Naranja Neón, destacando el eslogan <em>"Excelencia a un click de ti"</em> en los laterales.
                </p>
              </div>

              <div className="bg-[#1E293B]/80 border border-[#334155] p-5 rounded-2xl space-y-2">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl w-fit border border-indigo-500/30">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-white text-sm">Interfaz Web y App</h4>
                <p className="text-slate-300 leading-relaxed">
                  Botones de acción principales (CTA) en Naranja Neón sobre fondos limpios o Grafito (#1E293B), garantizando agilidad a <strong>"un solo click"</strong>.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-[#1E293B] bg-[#0f172a] rounded-b-3xl flex items-center justify-between text-xs text-slate-400">
          <span>DomiClick Logística • Villavicencio, Colombia</span>
          <button
            onClick={onClose}
            className="bg-[#0052FF] hover:bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl transition shadow-lg shadow-[#0052FF]/30"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
