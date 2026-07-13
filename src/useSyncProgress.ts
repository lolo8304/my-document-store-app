import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { apiBaseUrl, getAdminStatus, SyncProgress } from './api';

const idleProgress: SyncProgress = {
  running: false,
  current: 0,
  total: 0,
  imported: 0,
  skipped: 0,
  markedDeleted: 0,
  failed: 0,
  status: 'idle',
};

export function useSyncProgress() {
  const [progress, setProgress] = useState<SyncProgress>(idleProgress);

  useEffect(() => {
    let active = true;

    getAdminStatus()
      .then((status) => {
        if (!active) {
          return;
        }
        setProgress((current) => ({
          ...current,
          running: status.sync.running,
          current: status.sync.current,
          total: status.sync.total,
          status: status.sync.status ?? (status.sync.running ? 'running' : current.status),
          phase: status.sync.phase,
          fileName: status.sync.fileName,
          fileElapsedSeconds: status.sync.fileElapsedSeconds,
          stepCurrent: status.sync.stepCurrent,
          stepTotal: status.sync.stepTotal,
          stepUnit: status.sync.stepUnit,
          startedAt: status.sync.startedAt,
        }));
      })
      .catch(() => undefined);

    const socket = io(apiBaseUrl, {
      transports: ['websocket', 'polling'],
    });

    socket.on('sync.progress', (next: SyncProgress) => {
      setProgress(next);
    });

    return () => {
      active = false;
      socket.disconnect();
    };
  }, []);

  return progress;
}
