import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDbConnection, updateDbConnection, testDbConnection,
  getSchedulerSettings, updateSchedulerSettings, syncNow, getSyncStatus,
  getEviraDbConnection, updateEviraDbConnection, testEviraConnection,
} from '../api';
import { PageHeader, Card, Button, Spinner } from '../components/UI';
import { CheckCircle, XCircle, RefreshCw, Database, Clock, Play } from 'lucide-react';

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('tr-TR'); } catch { return iso; }
}

const INTERVAL_OPTIONS = [
  { value: 15,  label: '15 dakika' },
  { value: 30,  label: '30 dakika' },
  { value: 60,  label: '1 saat' },
  { value: 120, label: '2 saat' },
  { value: 240, label: '4 saat' },
  { value: 480, label: '8 saat' },
];

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
    />
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();

  // ── DB bağlantı ──
  const { data: savedConn, isLoading } = useQuery({
    queryKey: ['settings-conn'],
    queryFn: () => getDbConnection().then(r => r.data),
  });

  const [conn, setConn] = useState({ server: '', database: '', user: '', password: '', port: '1433' });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  useEffect(() => {
    if (savedConn) setConn({
      server:   savedConn.server   || '',
      database: savedConn.database || '',
      user:     savedConn.user     || '',
      password: savedConn.hasPassword ? '••••••••' : '',
      port:     savedConn.port     || '1433',
    });
  }, [savedConn]);

  const saveConnMut = useMutation({
    mutationFn: (d) => updateDbConnection(d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries(['settings-conn']); setSaveMsg('Kaydedildi'); setTimeout(() => setSaveMsg(null), 2500); },
    onError: (e) => { setSaveMsg('Hata: ' + (e.response?.data?.error || e.message)); setTimeout(() => setSaveMsg(null), 4000); },
  });

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const payload = { ...conn };
      if (payload.password === '••••••••') delete payload.password;
      const res = await testDbConnection(payload);
      setTestResult(res.data);
    } catch (e) {
      setTestResult({ success: false, message: e.response?.data?.message || e.message });
    } finally {
      setTesting(false);
    }
  }

  function handleSaveConn() {
    const payload = { ...conn };
    if (payload.password === '••••••••') delete payload.password;
    saveConnMut.mutate(payload);
  }

  // ── EVIRA bağlantı ──
  const { data: savedEvira } = useQuery({
    queryKey: ['settings-evira-conn'],
    queryFn: () => getEviraDbConnection().then(r => r.data),
  });

  const [eviraConn, setEviraConn] = useState({ server: '', database: '', user: '', password: '', port: '1433' });
  const [eviraTestResult, setEviraTestResult] = useState(null);
  const [eviraTestPending, setEviraTestPending] = useState(false);
  const [eviraMsg, setEviraMsg] = useState(null);

  useEffect(() => {
    if (savedEvira) setEviraConn({
      server:   savedEvira.server   || '',
      database: savedEvira.database || '',
      user:     savedEvira.user     || '',
      password: savedEvira.hasPassword ? '••••••••' : '',
      port:     savedEvira.port     || '1433',
    });
  }, [savedEvira]);

  const saveEviraConnMut = useMutation({
    mutationFn: (d) => updateEviraDbConnection(d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries(['settings-evira-conn']); setEviraMsg('Kaydedildi'); setTimeout(() => setEviraMsg(null), 2500); },
    onError: (e) => { setEviraMsg('Hata: ' + (e.response?.data?.error || e.message)); setTimeout(() => setEviraMsg(null), 4000); },
  });

  async function handleEviraTest() {
    setEviraTestPending(true);
    setEviraTestResult(null);
    try {
      const payload = { ...eviraConn };
      if (payload.password === '••••••••') delete payload.password;
      const res = await testEviraConnection(payload);
      setEviraTestResult(res.data);
    } catch (e) {
      setEviraTestResult({ success: false, message: e.response?.data?.message || e.message });
    } finally {
      setEviraTestPending(false);
    }
  }

  function handleSaveEviraConn() {
    const payload = { ...eviraConn };
    if (payload.password === '••••••••') delete payload.password;
    saveEviraConnMut.mutate(payload);
  }

  // ── Zamanlayıcı ──
  const { data: sched } = useQuery({
    queryKey: ['settings-sched'],
    queryFn: () => getSchedulerSettings().then(r => r.data),
  });

  const [schedForm, setSchedForm] = useState({ enabled: false, interval: 60 });
  useEffect(() => { if (sched) setSchedForm({ enabled: sched.enabled, interval: sched.interval || 60 }); }, [sched]);

  const saveSchedMut = useMutation({
    mutationFn: (d) => updateSchedulerSettings(d).then(r => r.data),
    onSuccess: () => qc.invalidateQueries(['settings-sched', 'settings-sync-status']),
  });

  // ── Sync durumu ──
  const { data: syncStatus, refetch: refetchSync } = useQuery({
    queryKey: ['settings-sync-status'],
    queryFn: () => getSyncStatus().then(r => r.data),
    refetchInterval: (q) => q.state.data?.isRunning ? 2000 : false,
  });

  const syncNowMut = useMutation({
    mutationFn: () => syncNow().then(r => r.data),
    onSuccess: () => { setTimeout(() => refetchSync(), 1500); },
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;

  const isRunning = syncStatus?.isRunning || syncNowMut.isPending;

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader title="Sistem Ayarları" subtitle="TIGER3 bağlantısı ve otomatik güncelleme" />

      {/* Bağlantı */}
      <Card className="mb-4 p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
          <Database size={16} className="text-blue-600 shrink-0" />
          <span className="font-semibold text-sm text-gray-800">TIGER3 Veritabanı Bağlantısı</span>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Sunucu IP">
                <TextInput value={conn.server} onChange={e => setConn(p => ({ ...p, server: e.target.value }))} placeholder="10.10.10.241" />
              </Field>
            </div>
            <Field label="Port">
              <TextInput value={conn.port} onChange={e => setConn(p => ({ ...p, port: e.target.value }))} placeholder="1433" />
            </Field>
          </div>

          <Field label="Veritabanı">
            <TextInput value={conn.database} onChange={e => setConn(p => ({ ...p, database: e.target.value }))} placeholder="TIGER3" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Kullanıcı Adı">
              <TextInput value={conn.user} onChange={e => setConn(p => ({ ...p, user: e.target.value }))} placeholder="webservices" />
            </Field>
            <Field label="Şifre">
              <TextInput type="password" value={conn.password} onChange={e => setConn(p => ({ ...p, password: e.target.value }))} placeholder="Değiştirmek için yazın" />
            </Field>
          </div>
        </div>

        {/* Test / kayıt sonucu */}
        <div className="min-h-[2rem] mt-3">
          {testing && (
            <span className="flex items-center gap-1.5 text-sm text-gray-500">
              <Spinner /><span>Test ediliyor…</span>
            </span>
          )}
          {!testing && testResult && (
            <div className={`flex items-start gap-1.5 text-sm rounded px-2 py-1.5 ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {testResult.success ? <CheckCircle size={14} className="shrink-0 mt-0.5" /> : <XCircle size={14} className="shrink-0 mt-0.5" />}
              <span className="break-words">{testResult.message}</span>
            </div>
          )}
          {!testing && !testResult && saveMsg && (
            <span className={`text-sm ${saveMsg.startsWith('Hata') ? 'text-red-600' : 'text-green-600'}`}>{saveMsg}</span>
          )}
        </div>

        <div className="flex gap-2 mt-1">
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={13} />
            Bağlantıyı Test Et
          </button>
          <Button onClick={handleSaveConn} disabled={saveConnMut.isPending} className="text-sm">
            Kaydet
          </Button>
        </div>
      </Card>

      {/* EVIRA Bağlantı */}
      <Card className="mb-4 p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
          <Database size={16} className="text-purple-600 shrink-0" />
          <span className="font-semibold text-sm text-gray-800">EVIRA Veritabanı Bağlantısı</span>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Sunucu IP">
                <TextInput value={eviraConn.server} onChange={e => setEviraConn(p => ({ ...p, server: e.target.value }))} placeholder="10.10.10.241" />
              </Field>
            </div>
            <Field label="Port">
              <TextInput value={eviraConn.port} onChange={e => setEviraConn(p => ({ ...p, port: e.target.value }))} placeholder="1433" />
            </Field>
          </div>

          <Field label="Veritabanı">
            <TextInput value={eviraConn.database} onChange={e => setEviraConn(p => ({ ...p, database: e.target.value }))} placeholder="EVIRA" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Kullanıcı Adı">
              <TextInput value={eviraConn.user} onChange={e => setEviraConn(p => ({ ...p, user: e.target.value }))} placeholder="webservices" />
            </Field>
            <Field label="Şifre">
              <TextInput type="password" value={eviraConn.password} onChange={e => setEviraConn(p => ({ ...p, password: e.target.value }))} placeholder="Değiştirmek için yazın" />
            </Field>
          </div>
        </div>

        <div className="min-h-[2rem] mt-3">
          {eviraTestPending && (
            <span className="flex items-center gap-1.5 text-sm text-gray-500"><Spinner /><span>Test ediliyor…</span></span>
          )}
          {!eviraTestPending && eviraTestResult && (
            <div className={`flex items-start gap-1.5 text-sm rounded px-2 py-1.5 ${eviraTestResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {eviraTestResult.success ? <CheckCircle size={14} className="shrink-0 mt-0.5" /> : <XCircle size={14} className="shrink-0 mt-0.5" />}
              <span className="break-words">{eviraTestResult.message}</span>
            </div>
          )}
          {!eviraTestPending && !eviraTestResult && eviraMsg && (
            <span className={`text-sm ${eviraMsg.startsWith('Hata') ? 'text-red-600' : 'text-green-600'}`}>{eviraMsg}</span>
          )}
        </div>

        <div className="flex gap-2 mt-1">
          <button
            onClick={handleEviraTest}
            disabled={eviraTestPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={13} />Bağlantıyı Test Et
          </button>
          <Button onClick={handleSaveEviraConn} disabled={saveEviraConnMut.isPending} className="text-sm">
            Kaydet
          </Button>
        </div>
      </Card>

      {/* Zamanlayıcı */}
      <Card className="mb-4 p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
          <Clock size={16} className="text-blue-600 shrink-0" />
          <span className="font-semibold text-sm text-gray-800">Otomatik Güncelleme</span>
        </div>

        <label className="flex items-center gap-2 cursor-pointer mb-3">
          <input
            type="checkbox"
            className="w-4 h-4 rounded accent-blue-600"
            checked={schedForm.enabled}
            onChange={e => setSchedForm(p => ({ ...p, enabled: e.target.checked }))}
          />
          <span className="text-sm text-gray-700">Otomatik güncellemeyi etkinleştir</span>
        </label>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-600 shrink-0">Sıklık:</span>
          <select
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={schedForm.interval}
            onChange={e => setSchedForm(p => ({ ...p, interval: +e.target.value }))}
          >
            {INTERVAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Button onClick={() => saveSchedMut.mutate(schedForm)} disabled={saveSchedMut.isPending} className="text-sm">
            Kaydet
          </Button>
        </div>

        {sched?.lastRefreshAt && (
          <p className="mt-3 text-xs text-gray-400">
            Son güncelleme: {formatDate(sched.lastRefreshAt)}
            {sched.lastRefreshStatus && ` — ${sched.lastRefreshStatus}`}
          </p>
        )}
      </Card>

      {/* Manuel güncelleme */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Play size={16} className="text-blue-600 shrink-0" />
              <span className="font-semibold text-sm text-gray-800">Manuel Güncelleme</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Tüm verileri hemen çeker:<br />
              Depo Stok · Malzeme İhtiyaç · Ciro · Finans · EVIRA Envanter
            </p>
          </div>
          <Button
            onClick={() => syncNowMut.mutate()}
            disabled={isRunning}
            className="flex items-center gap-1.5 shrink-0 text-sm"
          >
            {isRunning ? <><Spinner /><span>Güncelleniyor…</span></> : <><RefreshCw size={13} />Şimdi Güncelle</>}
          </Button>
        </div>

        {syncStatus && (
          <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <span className="text-gray-500">Son çalışma</span>
            <span className="font-medium">{formatDate(syncStatus.lastRefreshAt)}</span>
            {syncStatus.lastRefreshStatus && <>
              <span className="text-gray-500">Durum</span>
              <span className={syncStatus.lastRefreshStatus.toLowerCase().includes('hata') ? 'text-amber-600' : 'text-green-600'}>
                {syncStatus.lastRefreshStatus}
              </span>
            </>}
            <span className="text-gray-500">Zamanlayıcı</span>
            <span>
              {syncStatus.enabled
                ? <span className="text-green-600">Aktif — her {syncStatus.interval} dakika</span>
                : <span className="text-gray-400">Pasif</span>}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
