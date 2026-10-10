import { useCallback, useState } from 'react';
export interface ToastAction { label: string; onAction: () => void }
export interface ToastMessage { id: string; message: string; kind?: 'success' | 'error' | 'info'; duration?: number; action?: ToastAction }
export type ToastInput = Omit<ToastMessage, 'id'>;
export interface ToastQueue { items: readonly ToastMessage[]; enqueue: (message: ToastInput) => string; dismiss: (id: string) => void; clear: () => void }
export function useToastQueue(): ToastQueue {
  const [items, setItems] = useState<readonly ToastMessage[]>([]);
  const enqueue = useCallback((message: ToastInput) => { const id = crypto.randomUUID(); setItems(items => [...items, { ...message, id }]); return id; }, []);
  const dismiss = useCallback((id: string) => setItems(items => items.filter(item => item.id !== id)), []);
  const clear = useCallback(() => setItems([]), []);
  return { items, enqueue, dismiss, clear };
}
