import React from 'react';

const BLUE = '#1A8FD8';
const BLUE_DARK = '#1579BC';
const BLUE_LIGHT = '#E8F4FC';

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#1E1E1E' }}>{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${className}`}>
      {children}
    </div>
  );
}

export function Button({ children, variant = 'primary', size = 'md', onClick, type = 'button', disabled, className = '' }) {
  const base = 'inline-flex items-center gap-2 font-medium rounded-lg transition-all disabled:opacity-50';
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5' };

  const styles = {
    primary:   { background: BLUE, color: '#fff', border: 'none' },
    secondary: { background: '#F3F4F6', color: '#374151', border: 'none' },
    danger:    { background: '#DC2626', color: '#fff', border: 'none' },
    outline:   { background: 'transparent', color: '#374151', border: '1px solid #D1D5DB' },
    success:   { background: '#059669', color: '#fff', border: 'none' },
  };

  const hoverStyles = {
    primary:   { background: BLUE_DARK },
    secondary: { background: '#E5E7EB' },
    danger:    { background: '#B91C1C' },
    outline:   { background: '#F9FAFB' },
    success:   { background: '#047857' },
  };

  const [hovered, setHovered] = React.useState(false);
  const style = { ...styles[variant] || styles.primary, ...(hovered && !disabled ? hoverStyles[variant] || {} : {}) };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={`${base} ${sizes[size]} ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  );
}

export function Badge({ children, color = 'gray' }) {
  const colors = {
    gray:   { background: '#F3F4F6', color: '#374151' },
    blue:   { background: BLUE_LIGHT, color: BLUE_DARK },
    green:  { background: '#D1FAE5', color: '#065F46' },
    yellow: { background: '#FEF3C7', color: '#92400E' },
    red:    { background: '#FEE2E2', color: '#991B1B' },
    purple: { background: '#EDE9FE', color: '#5B21B6' },
    orange: { background: '#FFEDD5', color: '#9A3412' },
    indigo: { background: '#E0E7FF', color: '#3730A3' },
  };
  const style = colors[color] || colors.gray;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={style}
    >
      {children}
    </span>
  );
}

const focusStyle = {
  outline: 'none',
};

function inputClass(error) {
  return `w-full border rounded-lg px-3 py-2 text-sm ${error ? 'border-red-400' : 'border-gray-300'}`;
}

export function Input({ label, error, className = '', ...props }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <input
        className={inputClass(error)}
        style={focusStyle}
        onFocus={e => { e.target.style.borderColor = BLUE; e.target.style.boxShadow = `0 0 0 3px ${BLUE}22`; }}
        onBlur={e => { e.target.style.borderColor = error ? '#F87171' : '#D1D5DB'; e.target.style.boxShadow = 'none'; }}
        {...props}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

export function Select({ label, error, children, className = '', ...props }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <select
        className={`${inputClass(error)} bg-white`}
        style={focusStyle}
        onFocus={e => { e.target.style.borderColor = BLUE; e.target.style.boxShadow = `0 0 0 3px ${BLUE}22`; }}
        onBlur={e => { e.target.style.borderColor = error ? '#F87171' : '#D1D5DB'; e.target.style.boxShadow = 'none'; }}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, className = '', ...props }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <textarea
        className={`${inputClass(error)} resize-y`}
        style={focusStyle}
        rows={3}
        onFocus={e => { e.target.style.borderColor = BLUE; e.target.style.boxShadow = `0 0 0 3px ${BLUE}22`; }}
        onBlur={e => { e.target.style.borderColor = error ? '#F87171' : '#D1D5DB'; e.target.style.boxShadow = 'none'; }}
        {...props}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}>
      <div
        className={`bg-white rounded-xl shadow-2xl w-full ${sizes[size]} max-h-[90vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#E5E7EB' }}>
          <h2 className="text-base font-semibold" style={{ color: '#1E1E1E' }}>{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

export function Table({ headers, children, empty }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {headers.map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children}
          {empty && (
            <tr><td colSpan={headers.length} className="text-center text-gray-400 py-12">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Spinner() {
  return (
    <div
      className="animate-spin rounded-full h-8 w-8 mx-auto my-12"
      style={{ borderWidth: 2, borderStyle: 'solid', borderColor: `${BLUE} transparent transparent transparent` }}
    />
  );
}

export function StatCard({ label, value, icon: Icon, color = 'blue', active, onClick }) {
  const colors = {
    blue:   { bg: BLUE_LIGHT, fg: BLUE },
    green:  { bg: '#D1FAE5', fg: '#059669' },
    orange: { bg: '#FFEDD5', fg: '#EA580C' },
    red:    { bg: '#FEE2E2', fg: '#DC2626' },
    purple: { bg: '#EDE9FE', fg: '#7C3AED' },
    yellow: { bg: '#FEF3C7', fg: '#D97706' },
    gray:   { bg: '#F3F4F6', fg: '#6B7280' },
  };
  const c = colors[color] || colors.blue;

  return (
    <div
      className="bg-white rounded-xl border p-5 transition-all cursor-pointer"
      style={{
        borderColor: active ? BLUE : '#E5E7EB',
        boxShadow: active ? `0 0 0 2px ${BLUE}33` : '0 1px 3px rgba(0,0,0,0.06)',
      }}
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        <div className="p-2.5 rounded-xl" style={{ background: c.bg }}>
          <Icon size={20} style={{ color: c.fg }} />
        </div>
        <div>
          <p className="text-2xl font-bold" style={{ color: '#1E1E1E' }}>{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
