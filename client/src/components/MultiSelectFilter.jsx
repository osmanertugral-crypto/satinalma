import { X } from 'lucide-react';

/**
 * Yeniden kullanılabilir çoklu seçimli filtre pill bileşeni.
 *
 * Props:
 *   options   – string[] veya { value, label }[] listesi
 *   value     – seçili değerler string[] (boş dizi = tümü seçili)
 *   onChange  – (newValue: string[]) => void
 *   label     – opsiyonel etiket metni
 *   colorMap  – opsiyonel { [value]: 'bg-... text-...' } renk haritası
 *   className – opsiyonel wrapper sınıfı
 */
export default function MultiSelectFilter({ label, options = [], value = [], onChange, colorMap = {}, className = '' }) {
  const allSelected = value.length === 0;

  function getValue(opt) { return typeof opt === 'object' ? opt.value : opt; }
  function getLabel(opt) { return typeof opt === 'object' ? opt.label : opt; }

  function toggle(opt) {
    const v = getValue(opt);
    const next = value.includes(v) ? value.filter(x => x !== v) : [...value, v];
    onChange(next);
  }

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {label && (
        <span className="text-sm font-medium text-gray-600 shrink-0 whitespace-nowrap">{label}</span>
      )}

      {/* Tümü butonu */}
      <button
        type="button"
        onClick={() => onChange([])}
        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
          allSelected
            ? 'bg-blue-600 text-white shadow-md'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        Tümü
      </button>

      {/* Seçenek butonları */}
      {options.map(opt => {
        const v = getValue(opt);
        const lbl = getLabel(opt);
        const active = value.includes(v);
        const customColor = colorMap[v];
        return (
          <button
            type="button"
            key={v}
            onClick={() => toggle(opt)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
              active
                ? customColor
                  ? customColor + ' shadow-md ring-2 ring-offset-1 ring-current/30'
                  : 'bg-blue-600 text-white shadow-md ring-2 ring-blue-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {lbl}
            {active && <span className="ml-1 text-[10px] opacity-80">✓</span>}
          </button>
        );
      })}

      {/* Temizle butonu */}
      {!allSelected && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full transition-all border border-red-200"
        >
          <X size={11} />
          Temizle ({value.length})
        </button>
      )}
    </div>
  );
}
