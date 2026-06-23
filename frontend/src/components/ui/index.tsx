import React from 'react';

// ----------------------------------------------------
// 1. BUTTON
// ----------------------------------------------------
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyle = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:pointer-events-none font-sans active:scale-97';
  
  const variants = {
    primary: 'bg-primary hover:bg-primary-active text-white shadow-sm active:scale-95',
    secondary: 'bg-canvas hover:bg-surface-soft text-ink border border-hairline shadow-sm hover:border-muted-soft',
    danger: 'bg-red-650 hover:bg-red-700 text-white shadow-sm active:scale-95',
    ghost: 'hover:bg-surface-soft text-body hover:text-ink',
    glass: 'bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/10 active:scale-95'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : null}
      {children}
    </button>
  );
};

// ----------------------------------------------------
// 2. INPUT
// ----------------------------------------------------
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', type = 'text', ...props }, ref) => {
    return (
      <div className="w-full">
        {label ? (
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
            {label}
          </label>
        ) : null}
        <input
          type={type}
          ref={ref}
          className={`w-full px-3.5 py-2 text-sm rounded-lg bg-canvas border border-hairline text-ink placeholder-muted-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 ${
            error ? 'border-red-500 focus:ring-red-500' : ''
          } ${className}`}
          {...props}
        />
        {error ? (
          <p className="mt-1 text-xs text-red-500 font-medium">{error}</p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = 'Input';

// ----------------------------------------------------
// 3. CARD
// ----------------------------------------------------
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`bg-surface-card border border-hairline rounded-xl shadow-sm overflow-hidden ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

// ----------------------------------------------------
// 4. BADGE
// ----------------------------------------------------
interface BadgeProps {
  children: React.ReactNode;
  color?: 'brand' | 'green' | 'red' | 'yellow' | 'gray';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  color = 'gray',
  className = ''
}) => {
  const colors = {
    brand: 'bg-primary/10 text-primary border-primary/20',
    green: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    red: 'bg-red-500/10 text-red-600 border-red-500/20',
    yellow: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    gray: 'bg-surface-soft text-muted border-hairline'
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-md border ${colors[color]} ${className}`}>
      {children}
    </span>
  );
};

// ----------------------------------------------------
// 5. MODAL
// ----------------------------------------------------
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md'
}) => {
  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-ink/45 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className={`relative w-full ${sizes[size]} bg-canvas rounded-xl shadow-2xl border border-hairline overflow-hidden transform transition-all z-10 animate-in fade-in zoom-in-95 duration-200`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
          <h3 className="text-xl font-serif text-ink font-normal tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink transition-colors p-1 rounded-lg hover:bg-surface-soft"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {footer ? (
          <div className="px-5 py-3.5 bg-surface-soft border-t border-hairline flex items-center justify-end space-x-2.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
};
