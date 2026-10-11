import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full text-[14px] font-semibold tracking-[-0.01em] transition-[background-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-fg text-bg hover:opacity-90',
        accent: 'bg-accent text-accent-fg hover:bg-accent-hover',
        secondary: 'bg-surface-2 text-fg hover:bg-line',
        outline: 'border border-line-strong bg-bg text-fg hover:bg-surface-2',
        ghost: 'text-fg hover:bg-surface-2',
        soft: 'border border-line-strong text-fg hover:bg-surface-2',
        destructive: 'border border-line-strong text-danger hover:bg-surface-2',
        link: 'h-auto px-0 text-accent hover:underline underline-offset-4',
      },
      size: {
        default: 'h-10 px-5',
        sm: 'h-8 px-3.5 text-[13px]',
        lg: 'h-14 px-7 text-[16px]',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
