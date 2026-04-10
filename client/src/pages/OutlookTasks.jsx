import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, RefreshCcw, CheckSquare, Square, MailOpen } from 'lucide-react';
import {
  getOutlookStatus,
  getOutlookConnectUrl,
  getOutlookTasks,
  syncOutlookTasks,
  updateOutlookTaskStatus,
} from '../api';
import { Badge, Button, Card, PageHeader, Spinner, Table } from '../components/UI';

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('tr-TR');
}

export default function OutlookTasksPage() {
  const qc = useQueryClient();

  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['outlook-status'],
    queryFn: () => getOutlookStatus().then((r) => r.data),
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['outlook-tasks'],
    queryFn: () => getOutlookTasks().then((r) => r.data),
  });

  const connectMutation = useMutation({
    mutationFn: () => getOutlookConnectUrl().then((r) => r.data),
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      }
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => syncOutlookTasks().then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outlook-tasks'] });
      qc.invalidateQueries({ queryKey: ['outlook-status'] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateOutlookTaskStatus(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outlook-tasks'] });
    },
  });

  const isConnected = !!statusData?.connected;
  const isLoading = statusLoading || tasksLoading;

  return (
    <div className="p-6">
      <PageHeader
        title="Outlook Yapılacaklar"
        subtitle="Outlook'ta önemli işaretlediğiniz maillerden görev listesi"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={!isConnected || syncMutation.isPending}
            >
              <RefreshCcw size={16} />
              {syncMutation.isPending ? 'Senkronize ediliyor...' : 'Outlook ile Senkronize Et'}
            </Button>
            <Button
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
            >
              <Link2 size={16} />
              {isConnected ? 'Hesabı Yeniden Bağla' : 'Outlook Hesabını Bağla'}
            </Button>
          </div>
        }
      />

      <Card className="p-4 mb-6">
        {statusLoading ? (
          <p className="text-sm text-gray-500">Bağlantı durumu kontrol ediliyor...</p>
        ) : isConnected ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge color="green">Bağlı</Badge>
              <p className="text-sm text-gray-600">Outlook hesabınız bağlı. Senkronizasyon ile görevleri güncelleyebilirsiniz.</p>
            </div>
            {statusData?.updated_at && (
              <p className="text-xs text-gray-500">Son bağlantı güncelleme: {formatDate(statusData.updated_at)}</p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-600">Önemli işaretli mailleri görev listesine almak için önce Outlook hesabını bağlayın.</p>
            <Badge color="yellow">Bağlı değil</Badge>
          </div>
        )}
      </Card>

      <Card>
        {isLoading ? (
          <Spinner />
        ) : (
          <Table
            headers={['Durum', 'Konu', 'Gönderen', 'Alınma Tarihi', 'Bekleyen Gün', 'Ayrıntı']}
            empty={!isConnected ? 'Önce Outlook hesabınızı bağlayın.' : tasks.length === 0 && 'Önemli işaretli mail bulunamadı. "Senkronize Et" ile güncelleyin.'}
          >
            {tasks.map((task) => {
              const isDone = task.status === 'done';
              return (
                <tr key={task.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => statusMutation.mutate({ id: task.id, status: isDone ? 'pending' : 'done' })}
                      className="text-gray-600 hover:text-gray-900"
                      title={isDone ? 'Görevi tekrar bekleyen yap' : 'Görevi tamamlandı yap'}
                    >
                      {isDone ? <CheckSquare size={18} className="text-emerald-600" /> : <Square size={18} />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <p className={`text-sm font-medium ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                      {task.subject}
                    </p>
                    {isDone && <p className="text-xs text-emerald-700 mt-1">Tamamlandı</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{task.sender || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatDate(task.received_at)}</td>
                  <td className="px-4 py-3 text-sm">
                    <Badge color={isDone ? 'gray' : task.waiting_days > 7 ? 'red' : task.waiting_days > 2 ? 'yellow' : 'blue'}>
                      {Math.max(0, task.waiting_days || 0)} gün
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {task.web_link ? (
                      <a
                        href={task.web_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                        title="Mail detayını Outlook'ta aç"
                      >
                        <MailOpen size={14} />
                        Mailde Aç
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">Link yok</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
