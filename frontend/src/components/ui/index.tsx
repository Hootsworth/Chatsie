import React from 'react';

// ----------------------------------------------------
// 1. BUTTON
// ----------------------------------------------------
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary-text' | 'icon-circular' | 'icon-circular-inverse' | 'magenta-promo';
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
  const baseStyle = 'inline-flex items-center justify-center transition-transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:pointer-events-none text-button';
  
  const variants = {
    primary: 'bg-primary text-on-primary rounded-pill px-[20px] py-[10px]',
    secondary: 'bg-canvas text-ink rounded-pill px-[18px] pt-[8px] pb-[10px]',
    'tertiary-text': 'bg-canvas text-ink hover:bg-surface-soft rounded-full px-[12px] py-[8px]',
    'icon-circular': 'bg-surface-soft text-ink rounded-full w-[40px] h-[40px]',
    'icon-circular-inverse': 'bg-on-inverse-soft text-inverse-ink rounded-full w-[40px] h-[40px]',
    'magenta-promo': 'bg-accent-magenta text-on-primary rounded-pill px-[18px] py-[10px]',
  };

  // Override sizes for specific variants if needed, or keep generic if user specifies
  let appliedSize = '';
  if (variant === 'primary' || variant === 'secondary' || variant === 'magenta-promo') {
    // Rely on variant's explicit padding as per DESIGN.md
  } else if (variant === 'tertiary-text') {
    // padding included in variant
  } else if (variant.startsWith('icon-circular')) {
    // size included in variant
  } else {
    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2.5 text-sm',
      lg: 'px-6 py-3.5 text-base'
    };
    appliedSize = sizes[size];
  }

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyle} ${variants[variant]} ${appliedSize} ${className}`}
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
          <label className="block text-body font-semibold text-ink mb-1.5">
            {label}
          </label>
        ) : null}
        <input
          type={type}
          ref={ref}
          className={`w-full px-[14px] py-[12px] text-body rounded-md bg-canvas border border-hairline text-ink placeholder-ink/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 ${
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
      className={`bg-canvas border border-hairline rounded-lg overflow-hidden ${className}`}
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
    brand: 'bg-block-lilac text-ink',
    green: 'bg-block-mint text-ink',
    red: 'bg-block-pink text-ink',
    yellow: 'bg-block-cream text-ink',
    gray: 'bg-surface-soft text-ink'
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-caption rounded-sm ${colors[color]} ${className}`}>
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
        className="fixed inset-0 bg-overlay-scrim/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className={`relative w-full ${sizes[size]} bg-canvas text-ink rounded-xl shadow-2xl border border-hairline overflow-hidden transform transition-all z-10 animate-in fade-in zoom-in-95 duration-200`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
          <h3 className="text-card-title text-ink tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="text-ink/60 hover:text-ink transition-colors p-1 rounded-full hover:bg-surface-soft"
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

