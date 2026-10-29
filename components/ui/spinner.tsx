import { cn } from '@/lib/utils';
import { Loader2Icon } from 'lucide-react';

type SpinnerProps = React.ComponentProps<'svg'> & { hidden?: boolean };

function Spinner({
  className,
  role,
  'aria-label': label,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-live': live,
  'aria-atomic': atomic,
  'aria-busy': busy,
  'aria-hidden': hiddenFromAT,
  ...props
}: SpinnerProps) {
  const statusRole = role === undefined || role === 'status';
  const name = label ?? (labelledBy ? undefined : 'Loading');
  const interactive = props.tabIndex !== undefined || props.focusable === true || props.focusable === 'true' ||
    ('title' in props && props.title !== undefined) || props.children !== undefined ||
    Object.entries(props).some(([key, value]) =>
      (key.startsWith('aria-') && value !== undefined) || (/^on[A-Z]/.test(key) && typeof value === 'function'));
  const visuallyHidden = props.hidden || props.style?.display === 'none' ||
    props.style?.visibility === 'hidden' || props.style?.visibility === 'collapse';
  const iconHidden = hiddenFromAT ?? !interactive;
  const namedIcon = iconHidden === false || iconHidden === 'false';
  return (
    <output
      data-slot="spinner-status"
      form=""
      role={role}
      aria-label={name}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-live={live ?? (statusRole ? 'polite' : undefined)}
      aria-atomic={atomic ?? (statusRole ? true : undefined)}
      aria-busy={busy}
      aria-hidden={visuallyHidden ? true : hiddenFromAT}
      hidden={props.hidden}
      style={visuallyHidden ? { display: props.style?.display, visibility: props.style?.visibility } : undefined}
      className="inline-flex shrink-0 items-center justify-center align-middle"
    >
      <Loader2Icon
        data-slot="spinner"
        aria-hidden={iconHidden}
        aria-label={namedIcon ? name : undefined}
        aria-labelledby={namedIcon ? labelledBy : undefined}
        aria-describedby={namedIcon ? describedBy : undefined}
        className={cn('size-4 animate-spin', className)}
        {...props}
      />
    </output>
  );
}

export { Spinner };
