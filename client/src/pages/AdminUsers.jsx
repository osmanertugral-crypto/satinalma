import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, createUser, updateUser, resetUserPassword, deleteUser } from '../api';
import { PageHeader, Card, Button, Badge, Modal, Input, Select, Table, Spinner } from '../components/UI';
import { Plus, Pencil, Trash2, Key, Shield, CheckSquare, Square } from 'lucide-react';

const ALL_PAGES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'finance', label: 'Finans' },
  { key: 'suppliers', label: 'Tedarikçiler' },
  { key: 'products', label: 'Ürünler' },
  { key: 'po', label: 'Siparişler (PO)' },
  { key: 'inventory', label: 'Envanter' },
  { key: 'depo', label: 'Depo Stok' },
  { key: 'malzeme-ihtiyac', label: 'Malzeme İhtiyaç' },
  { key: 'price-analysis', label: 'Fiyat Analizi' },
  { key: 'projects', label: 'Projeler' },
  { key: 'damage-reports', label: 'Hasar Tutanakları' },
  { key: 'outlook-tasks', label: 'Outlook Yapılacaklar' },
];

const EMPTY = { name: '', email: '', password: '', role: 'user', allowed_pages: null };

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [pwModal, setPwModal] = useState(null);
  const [newPw, setNewPw] = useState('');
  const [deleteId, setDeleteId] = useState(null);

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: () => getUsers().then(r => r.data) });

  const saveMutation = useMutation({
    mutationFn: (data) => modal?.id ? updateUser(modal.id, data) : createUser(data),
    onSuccess: () => { qc.invalidateQueries(['users']); setModal(null); }
  });
  const pwMutation = useMutation({
    mutationFn: ({ id, pw }) => resetUserPassword(id, { newPassword: pw }),
    onSuccess: () => { setPwModal(null); setNewPw(''); }
  });
  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => { qc.invalidateQueries(['users']); setDeleteId(null); }
  });

  function openAdd() { setForm(EMPTY); setModal('add'); }
  function openEdit(u) {
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      active: u.active,
      allowed_pages: u.allowed_pages || null,
    });
    setModal({ id: u.id });
  }
  function handleChange(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })); }

  function togglePage(key) {
    setForm(f => {
      const current = f.allowed_pages || [];
      const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
      return { ...f, allowed_pages: next.length === 0 ? null : next };
    });
  }

  function toggleAllPages() {
    setForm(f => {
      const current = f.allowed_pages;
      if (current === null || current.length === ALL_PAGES.length) {
        return { ...f, allowed_pages: null };
      }
      return { ...f, allowed_pages: ALL_PAGES.map(p => p.key) };
    });
  }

  const isRestrictedMode = form.allowed_pages !== null;

  return (
    <div className="p-6">
      <PageHeader
        title="Kullanıcı Yönetimi"
        subtitle={`${users.length} kullanıcı`}
        action={<Button onClick={openAdd}><Plus size={16} /> Yeni Kullanıcı</Button>}
      />

      <Card>
        {isLoading ? <Spinner /> : (
          <Table headers={['Ad', 'E-posta', 'Rol', 'Menü İzinleri', 'Durum', 'Oluşturulma', 'İşlem']}
            empty={users.length === 0 && 'Kullanıcı yok'}>
            {users.map(u => (
              <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <Badge color={u.role === 'admin' ? 'purple' : u.role === 'user' ? 'blue' : 'gray'}>
                    {u.role === 'admin' ? 'Admin' : u.role === 'user' ? 'Kullanıcı' : 'İzleyici'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {u.role === 'admin' ? (
                    <span className="text-xs text-purple-600 font-medium">Tüm Menüler</span>
                  ) : !u.allowed_pages ? (
                    <span className="text-xs text-green-600 font-medium">Tüm Menüler</span>
                  ) : (
                    <div className="flex items-center gap-1 flex-wrap">
                      <Shield size={12} className="text-amber-500 shrink-0" />
                      <span className="text-xs text-amber-700">{u.allowed_pages.length} menü</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3"><Badge color={u.active ? 'green' : 'gray'}>{u.active ? 'Aktif' : 'Pasif'}</Badge></td>
                <td className="px-4 py-3 text-sm text-gray-500">{new Date(u.created_at).toLocaleDateString('tr-TR')}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(u)} className="text-amber-500 hover:text-amber-700"><Pencil size={16} /></button>
                    <button onClick={() => { setPwModal(u.id); setNewPw(''); }} className="text-blue-400 hover:text-blue-600"><Key size={16} /></button>
                    <button onClick={() => setDeleteId(u.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* Kullanıcı Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Kullanıcı Düzernle' : 'Yeni Kullanıcı'} size="lg">
        <Input label="Ad Soyad *" name="name" value={form.name} onChange={handleChange} />
        <Input label="E-posta *" name="email" type="email" value={form.email} onChange={handleChange} className="mt-3" />
        {!modal?.id && <Input label="Şifre *" name="password" type="password" value={form.password} onChange={handleChange} className="mt-3" />}
        <Select label="Rol *" name="role" value={form.role} onChange={handleChange} className="mt-3">
          <option value="admin">Admin</option>
          <option value="user">Kullanıcı</option>
          <option value="viewer">İzleyici</option>
        </Select>
        {modal?.id && (
          <label className="flex items-center gap-2 mt-3 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
            Aktif hesap
          </label>
        )}

        {/* Menü İzin Ayarı – Admin ise gösterme */}
        {form.role !== 'admin' && (
          <div className="mt-4 border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shield size={15} className="text-amber-500" />
                <span className="text-sm font-semibold text-gray-700">Menü Erişim İzinleri</span>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isRestrictedMode}
                  onChange={e => setForm(f => ({ ...f, allowed_pages: e.target.checked ? [] : null }))}
                  className="rounded border-gray-300 text-amber-500"
                />
                <span className={isRestrictedMode ? 'text-amber-600 font-medium' : 'text-gray-500'}>
                  {isRestrictedMode ? 'Kısıtlanmış mod' : 'Tüm menülere erişim var'}
                </span>
              </label>
            </div>
            {isRestrictedMode ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={toggleAllPages}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    {form.allowed_pages?.length === ALL_PAGES.length
                      ? <><CheckSquare size={13} /> Tümünü Kaldır</>
                      : <><Square size={13} /> Tümünü Seç</>
                    }
                  </button>
                  <span className="text-xs text-gray-400">{form.allowed_pages?.length || 0} / {ALL_PAGES.length} seçili</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_PAGES.map(page => {
                    const checked = form.allowed_pages?.includes(page.key);
                    return (
                      <label key={page.key} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-gray-50 border border-transparent hover:border-gray-200">
                        <input
                          type="checkbox"
                          checked={!!checked}
                          onChange={() => togglePage(page.key)}
                          className="rounded border-gray-300 text-blue-600"
                        />
                        <span className={`text-sm ${checked ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                          {page.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400">
                Kullanıcı tüm menüleri görebilir. Kısıtlamak için "Kısıtlanmış mod" seçeneğini açın.
              </p>
            )}
          </div>
        )}

        {saveMutation.error && <p className="text-red-500 text-sm mt-2">{saveMutation.error.response?.data?.error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setModal(null)}>İptal</Button>
          <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>Kaydet</Button>
        </div>
      </Modal>

      {/* Şifre Sıfırlama Modal */}
      <Modal open={!!pwModal} onClose={() => setPwModal(null)} title="Şifre Sıfırla" size="sm">
        <Input label="Yeni Şifre" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min. 6 karakter" />
        {pwMutation.error && <p className="text-red-500 text-sm mt-2">{pwMutation.error.response?.data?.error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setPwModal(null)}>İptal</Button>
          <Button onClick={() => pwMutation.mutate({ id: pwModal, pw: newPw })} disabled={newPw.length < 6 || pwMutation.isPending}>Sıfırla</Button>
        </div>
      </Modal>

      {/* Silme */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Kullanıcı Sil" size="sm">
        <p className="text-gray-600">Bu kullanıcıyı silmek istediğinize emin misiniz?</p>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>İptal</Button>
          <Button variant="danger" onClick={() => deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>Sil</Button>
        </div>
      </Modal>
    </div>
  );
}
