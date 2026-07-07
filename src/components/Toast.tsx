interface ToastProps {
  message?: string;
}

export function Toast({ message }: ToastProps) {
  if (!message) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md rounded border border-emerald-200 bg-emerald-50 p-4 text-lg text-emerald-900 shadow-lg">
      {message}
    </div>
  );
}
