import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type InputHTMLAttributes,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from './Icon';
import { cx } from './ui';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & {
  /** Muestra la pista de teclado "/" y enfoca el campo al pulsarla. */
  shortcut?: boolean;
  /** Se llama al pulsar el botón de limpiar (además de vaciar el campo). */
  onClear?: () => void;
  size?: 'small' | 'medium';
};

/**
 * Buscador estándar: icono dentro del campo, botón de limpiar animado y
 * atajo de teclado opcional. Funciona controlado (value/onChange) o no
 * controlado (defaultValue).
 */
export const SearchInput = forwardRef<HTMLInputElement, Props>(function SearchInput(
  {
    shortcut,
    onClear,
    size = 'medium',
    className,
    value,
    defaultValue,
    onChange,
    onKeyDown,
    ...rest
  },
  ref,
) {
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLInputElement);
  const controlled = value !== undefined;
  const [local, setLocal] = useState(String(defaultValue ?? ''));
  const current = controlled ? String(value ?? '') : local;

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      const isSlash = e.key === '/' && !typing;
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isSlash || isCmdK) {
        e.preventDefault();
        inner.current?.focus();
        inner.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);

  const clear = () => {
    const input = inner.current;
    if (!input) return;
    if (!controlled) setLocal('');
    // Notifica a un onChange controlado con un evento nativo.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    onClear?.();
    input.focus();
  };

  return (
    <div className={cx('search-field', size === 'small' && 'small', className)}>
      <Icon name="search" className="search-field-icon" />
      <input
        {...rest}
        ref={inner}
        type="search"
        value={controlled ? value : local}
        onChange={(e) => {
          if (!controlled) setLocal(e.target.value);
          onChange?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && current) {
            e.preventDefault();
            clear();
          }
          onKeyDown?.(e);
        }}
      />
      <AnimatePresence initial={false} mode="popLayout">
        {current ? (
          <motion.button
            key="clear"
            type="button"
            className="search-field-clear"
            aria-label="Limpiar búsqueda"
            onClick={clear}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
          >
            <Icon name="close" />
          </motion.button>
        ) : shortcut ? (
          <motion.kbd
            key="kbd"
            className="search-field-kbd"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            /
          </motion.kbd>
        ) : null}
      </AnimatePresence>
    </div>
  );
});
