import { CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import type { NotificationItem } from '../../app/types';

interface NotificationStackProps {
  items: NotificationItem[];
  onDismiss: (id: string) => void;
}

export function NotificationStack({ items, onDismiss }: NotificationStackProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto rounded-2xl border p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl ${
            item.variant === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10'
              : 'border-red-500/30 bg-red-500/10'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className={item.variant === 'success' ? 'text-emerald-300' : 'text-red-300'}>
              {item.variant === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5" />
              ) : (
                <XCircle className="mt-0.5 h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white">{item.title}</div>
              <div className="mt-1 break-words text-xs leading-relaxed text-zinc-200">
                {item.message}
              </div>
              {item.explorerUrl ? (
                <a
                  href={item.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-200 hover:text-white"
                >
                  View on Explorer
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              className="text-zinc-400 transition-colors hover:text-white"
              aria-label="Dismiss notification"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
