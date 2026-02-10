import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

type GenerationState = 'pending' | 'processing' | 'completed' | 'failed';

interface StatusBadgeProps {
  state: GenerationState;
  className?: string;
}

const variants: Record<GenerationState, {
  icon: typeof Clock;
  className: string;
  label: string;
  animate?: boolean;
}> = {
  pending: {
    icon: Clock,
    className: 'bg-gray-800 text-gray-400',
    label: 'Queued',
  },
  processing: {
    icon: Loader2,
    className: 'bg-blue-500/10 text-blue-400',
    label: 'Processing',
    animate: true,
  },
  completed: {
    icon: CheckCircle2,
    className: 'bg-emerald-500/10 text-emerald-400',
    label: 'Complete',
  },
  failed: {
    icon: XCircle,
    className: 'bg-red-500/10 text-red-400',
    label: 'Failed',
  },
};

export function StatusBadge({ state, className = '' }: StatusBadgeProps) {
  const variant = variants[state];
  const Icon = variant.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${variant.className} ${className}`}
    >
      <Icon className={`w-3 h-3 ${variant.animate ? 'animate-spin' : ''}`} />
      {variant.label}
    </span>
  );
}
