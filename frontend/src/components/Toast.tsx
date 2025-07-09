import React from 'react';

type ToastProps = {
  show: boolean;
  type: 'success' | 'error';
};

export default function Toast({ show, type }: ToastProps) {
  if (!show) return null;

  return (
    <div className="fixed top-20 inset-x-0 flex justify-center z-50 pointer-events-none">
      <div
        className={`flex items-center space-x-2 rounded-2xl px-4 py-2 shadow-lg opacity-95
          ${type === 'success' ? 'bg-blue-600 text-white' : 'bg-red-600 text-white'}
          animate-fade-in-out`}
      >
        {type === 'success' ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        <span className="font-medium text-sm">
          {type === 'success' ? 'Успешно!' : 'Ошибка'}
        </span>
      </div>
    </div>
  );
}
