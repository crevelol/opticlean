import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Popover } from 'radix-ui';
import { Icon } from './Icon';
import { ExitGhost } from '../motion/ExitGhost';
import { exitParts } from '../motion/exitAnimation';
import './select.css';

type SelectOption = {
  value: string;
  label: string;
  disabled: boolean;
  group?: string;
};

function nodeText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children);
  return '';
}

function readOptions(children: ReactNode, group?: string): SelectOption[] {
  const options: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as {
      value?: string | number;
      disabled?: boolean;
      label?: string;
      children?: ReactNode;
    };
    if (child.type === 'option') {
      const label = nodeText(props.children).replace(/\s+/g, ' ').trim();
      const value = props.value != null ? String(props.value) : label;
      options.push({ value, label: label || value, disabled: !!props.disabled, group });
      return;
    }
    if (child.type === 'optgroup') {
      options.push(...readOptions(props.children, props.label || group));
    }
  });
  return options;
}

function changeEvent(value: string, name = ''): ChangeEvent<HTMLSelectElement> {
  return { target: { value, name }, currentTarget: { value, name } } as ChangeEvent<HTMLSelectElement>;
}

export type SelectProps = {
  id?: string;
  name?: string;
  value?: string | number;
  defaultValue?: string | number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  onBlur?: (event: FocusEvent<HTMLButtonElement>) => void;
};

export function Select({
  id,
  name,
  value,
  defaultValue,
  required,
  disabled,
  className,
  children,
  onChange,
  onBlur,
  ...aria
}: SelectProps) {
  const uid = useId();
  const listId = `${uid}-list`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const options = useMemo(() => readOptions(children), [children]);
  const controlled = value !== undefined;
  const [uncontrolled, setUncontrolled] = useState(defaultValue != null ? String(defaultValue) : '');
  const current = controlled ? String(value) : uncontrolled;
  const selected = options.find((option) => option.value === current);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, query]);

  const searchable = options.length > 8;

  // Posición, volteo, clic fuera, Escape y capas anidadas (p. ej. dentro de un
  // Dialog) los resuelve Radix Popover.
  useEffect(() => {
    if (!open) return;
    const index = filtered.findIndex((option) => option.value === current && !option.disabled);
    setActive(index >= 0 ? index : Math.max(0, filtered.findIndex((option) => !option.disabled)));
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    const node = menuRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [open, active, filtered.length]);

  const choose = (option: SelectOption) => {
    if (option.disabled || disabled) return;
    if (!controlled) setUncontrolled(option.value);
    onChange?.(changeEvent(option.value, name));
    setOpen(false);
    setQuery('');
  };

  const move = (direction: 1 | -1) => {
    if (!filtered.length) return;
    let next = active;
    for (let step = 0; step < filtered.length; step += 1) {
      next = (next + direction + filtered.length) % filtered.length;
      if (!filtered[next]?.disabled) {
        setActive(next);
        return;
      }
    }
  };

  const onMenuKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(Math.max(0, filtered.findIndex((option) => !option.disabled)));
    } else if (event.key === 'End') {
      event.preventDefault();
      for (let index = filtered.length - 1; index >= 0; index -= 1) {
        if (!filtered[index].disabled) {
          setActive(index);
          break;
        }
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[active];
      if (option) choose(option);
    }
  };

  let lastGroup: string | undefined;
  const label = selected?.label || 'Seleccionar';

  const openMenu = () => {
    if (disabled) return;
    setQuery('');
    setOpen(true);
  };

  return (
    <div className={['ui-select', className].filter(Boolean).join(' ')}>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery('');
        }}
      >
        <Popover.Trigger asChild>
          <button
            ref={buttonRef}
            id={id}
            type="button"
            className="ui-select-trigger"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={aria['aria-label']}
            aria-labelledby={aria['aria-labelledby']}
            aria-describedby={aria['aria-describedby']}
            aria-invalid={aria['aria-invalid']}
            onKeyDown={(event) => {
              if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
                event.preventDefault();
                openMenu();
              }
            }}
            onBlur={onBlur}
          >
            <span className={selected ? '' : 'is-placeholder'}>{label}</span>
            <Icon name="chevron" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            ref={menuRef}
            className="ui-select-menu"
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={8}
            tabIndex={-1}
            style={
              {
                minWidth: 'var(--radix-popover-trigger-width)',
                maxHeight: 'min(320px, var(--radix-popover-content-available-height))',
              } as CSSProperties
            }
            onOpenAutoFocus={(event) => {
              // El foco va al buscador o al menú (para navegar con flechas).
              event.preventDefault();
              (searchable ? searchRef.current : menuRef.current)?.focus();
            }}
            onKeyDown={onMenuKey}
            onMouseDown={(event) => {
              if ((event.target as HTMLElement).closest('input')) return;
              event.preventDefault();
            }}
          >
            {searchable ? (
              <div className="ui-select-search">
                <Icon name="search" />
                <input
                  ref={searchRef}
                  value={query}
                  placeholder="Buscar…"
                  aria-label="Buscar opción"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                />
              </div>
            ) : null}
            <div id={listId} role="listbox" aria-label={aria['aria-label']}>
              {filtered.length ? (
                filtered.map((option, index) => {
                  const showGroup = option.group && option.group !== lastGroup;
                  lastGroup = option.group;
                  const isSelected = option.value === current;
                  return (
                    <div key={`${option.group ?? ''}-${option.value}-${index}`}>
                      {showGroup ? <div className="ui-select-group">{option.group}</div> : null}
                      <button
                        type="button"
                        role="option"
                        className="ui-select-option"
                        aria-selected={isSelected}
                        aria-disabled={option.disabled || undefined}
                        data-active={index === active}
                        disabled={option.disabled}
                        tabIndex={-1}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(option)}
                      >
                        <span>{option.label}</span>
                        {isSelected ? <Icon name="check" /> : null}
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="ui-select-empty">Sin coincidencias</p>
              )}
            </div>
            <ExitGhost
              closest="[data-radix-popper-content-wrapper]"
              parts={exitParts.popover('.ui-select-menu')}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <select
        className="ui-select-native"
        tabIndex={-1}
        aria-hidden
        name={name}
        required={required}
        disabled={disabled}
        value={current}
        onChange={() => undefined}
        onInvalid={(event) => {
          event.preventDefault();
          buttonRef.current?.focus();
          openMenu();
        }}
      >
        {options.some((option) => option.value === current) ? null : <option value={current} />}
        {children}
      </select>
    </div>
  );
}
