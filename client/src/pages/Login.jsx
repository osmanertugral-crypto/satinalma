import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login } from '../api';

export default function LoginPage() {
  const { login: authLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login({ email, password });
      authLogin(res.data.token, res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Giriş yapılamadı');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#F0F4F8' }}>
      {/* Sol panel — marka */}
      <div
        className="hidden lg:flex flex-col justify-between p-12 w-[480px] shrink-0"
        style={{ background: '#1E1E1E' }}
      >
        <div>
          <img src="/RESTAR.png" alt="RESTAR" className="h-12 object-contain" />
          <div
            className="mt-2 h-0.5 w-16 rounded"
            style={{ background: '#1A8FD8' }}
          />
        </div>

        <div>
          <h2 className="text-3xl font-bold text-white leading-snug mb-4">
            Satın Alma<br />
            <span style={{ color: '#1A8FD8' }}>Yönetim Sistemi</span>
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: '#9A9A9A' }}>
            Tedarik zinciri, stok takibi ve maliyet yönetimini tek platformdan yönetin.
          </p>
        </div>

        <div className="text-xs" style={{ color: '#555' }}>
          © {new Date().getFullYear()} RESTAR Automotive A.Ş.
        </div>
      </div>

      {/* Sağ panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobilde logo */}
          <div className="flex justify-center mb-8 lg:hidden">
            <img src="/RESTAR.png" alt="RESTAR" className="h-10 object-contain" />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="mb-7">
              <h1 className="text-xl font-bold" style={{ color: '#1E1E1E' }}>Giriş Yap</h1>
              <p className="text-sm mt-1 text-gray-400">Hesabınıza erişmek için bilgilerinizi girin</p>
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-lg text-sm text-red-700 bg-red-50 border border-red-200">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#3C3C3C' }}>
                  E-posta
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="ornek@restar.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
                  style={{ color: '#1E1E1E' }}
                  onFocus={e => { e.target.style.borderColor = '#1A8FD8'; e.target.style.boxShadow = '0 0 0 3px #1A8FD822'; }}
                  onBlur={e => { e.target.style.borderColor = '#D1D5DB'; e.target.style.boxShadow = 'none'; }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#3C3C3C' }}>
                  Şifre
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
                  style={{ color: '#1E1E1E' }}
                  onFocus={e => { e.target.style.borderColor = '#1A8FD8'; e.target.style.boxShadow = '0 0 0 3px #1A8FD822'; }}
                  onBlur={e => { e.target.style.borderColor = '#D1D5DB'; e.target.style.boxShadow = 'none'; }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full text-white font-semibold py-2.5 rounded-lg transition-all disabled:opacity-60 mt-2"
                style={{ background: loading ? '#1579BC' : '#1A8FD8' }}
                onMouseEnter={e => !loading && (e.target.style.background = '#1579BC')}
                onMouseLeave={e => !loading && (e.target.style.background = '#1A8FD8')}
              >
                {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-5">
            Varsayılan: admin@satinalma.com / admin123
          </p>
        </div>
      </div>
    </div>
  );
}
