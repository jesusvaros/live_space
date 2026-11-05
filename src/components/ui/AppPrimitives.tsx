import * as Dialog from '@radix-ui/react-dialog';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const joinClasses = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(' ');

type PageProps = React.HTMLAttributes<HTMLDivElement>;

export const Page = React.forwardRef<HTMLDivElement, PageProps>(function Page(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={joinClasses('relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden', className)}
      {...props}
    />
  );
});

type ContentProps = React.HTMLAttributes<HTMLElement> & {
  fullscreen?: boolean;
  scrollY?: boolean;
};

export const Content = React.forwardRef<HTMLElement, ContentProps>(function Content(
  { className, fullscreen: _fullscreen, scrollY = true, ...props },
  ref,
) {
  return (
    <main
      ref={ref}
      className={joinClasses(
        'relative min-h-0 flex-1 bg-app-bg',
        scrollY ? 'overflow-y-auto overscroll-y-contain' : 'overflow-hidden',
        className,
      )}
      {...props}
    />
  );
});

type SpinnerProps = React.HTMLAttributes<HTMLSpanElement> & {
  label?: string;
};

export const Spinner: React.FC<SpinnerProps> = ({ className, label = 'Cargando', ...props }) => (
  <span
    className={joinClasses(
      'inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent align-middle motion-reduce:animate-pulse',
      className,
    )}
    role="status"
    aria-label={label}
    {...props}
  />
);

/** Shape of a detail screen (hero, title, a few rows) while its data arrives, instead of a spinner. */
export const DetailSkeleton: React.FC = () => (
  <div className="animate-pulse motion-reduce:animate-none" role="status" aria-label="Cargando">
    <div className="h-[340px] w-full bg-white/[0.06]" />
    <div className="flex flex-col gap-3 p-4">
      <div className="h-3 w-32 rounded-full bg-white/[0.08]" />
      <div className="h-9 w-3/4 rounded-lg bg-white/[0.08]" />
      <div className="mt-3 flex gap-3">
        <div className="h-11 w-28 rounded-full bg-white/[0.08]" />
        <div className="h-11 w-11 rounded-full bg-white/[0.06]" />
        <div className="h-11 w-11 rounded-full bg-white/[0.06]" />
      </div>
      {[0, 1, 2].map(row => (
        <div key={row} className="mt-2 h-[76px] rounded-2xl bg-white/[0.05]" />
      ))}
    </div>
  </div>
);

type ModalProps = {
  isOpen: boolean;
  onDidDismiss: () => void;
  children: React.ReactNode;
  className?: string;
  initialBreakpoint?: number;
  breakpoints?: number[];
  title?: string;
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onDidDismiss,
  children,
  className,
  initialBreakpoint,
  title = 'Diálogo',
}) => {
  const isSheet = typeof initialBreakpoint === 'number' || className?.includes('sheet');

  return (
    <Dialog.Root open={isOpen} onOpenChange={open => (!open ? onDidDismiss() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-app-overlay
          className="fixed inset-0 z-[2990] bg-black/70 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in"
        />
        <Dialog.Content
          className={joinClasses(
            'fixed z-[3000] overflow-hidden bg-app-bg text-white shadow-2xl outline-none',
            isSheet
              ? 'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-3xl border border-white/10'
              : 'inset-0 h-dvh w-screen',
            className,
          )}
          onOpenAutoFocus={event => event.preventDefault()}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Dialog.Close data-modal-close className="sr-only" aria-label="Cerrar diálogo">
            Cerrar
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

type ToastOptions = {
  message: string;
  duration?: number;
  position?: 'top' | 'bottom' | 'middle';
};

type ToastItem = ToastOptions & { id: number };
type ToastContextValue = { presentToast: (options: ToastOptions) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<number>());

  useEffect(() => () => timers.current.forEach(timer => window.clearTimeout(timer)), []);

  const presentToast = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setToasts(current => [...current, { ...options, id }]);
    const timer = window.setTimeout(() => {
      setToasts(current => current.filter(toast => toast.id !== id));
      timers.current.delete(timer);
    }, options.duration ?? 2500);
    timers.current.add(timer);
  }, []);

  const value = useMemo(() => ({ presentToast }), [presentToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(16px+env(safe-area-inset-top,0px))] z-[6000] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={joinClasses(
              'max-w-md rounded-xl border border-white/15 bg-[#17171b]/95 px-4 py-3 text-sm text-white shadow-xl backdrop-blur',
              toast.position === 'bottom' && 'fixed bottom-[calc(24px+env(safe-area-inset-bottom,0px))]',
              toast.position === 'middle' && 'fixed top-1/2 -translate-y-1/2',
            )}
            role="status"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
};
