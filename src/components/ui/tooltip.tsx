import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/shared/utils/cn'

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 10, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-[200] max-w-[240px] origin-[var(--radix-tooltip-content-transform-origin)]',
        'rounded-2xl border border-border/70 bg-card px-3.5 py-2.5 text-card-foreground shadow-panel',
        'data-[state=closed]:opacity-0 data-[state=delayed-open]:opacity-100 data-[state=instant-open]:opacity-100',
        'transition-[opacity,transform] duration-150 ease-out',
        'data-[side=bottom]:translate-y-0.5 data-[side=top]:-translate-y-0.5',
        'data-[side=left]:-translate-x-0.5 data-[side=right]:translate-x-0.5',
        className,
      )}
      {...props}
    >
      {children}
      <TooltipPrimitive.Arrow
        className="fill-card drop-shadow-[0_1px_0_hsl(var(--border)/0.7)]"
        width={12}
        height={7}
      />
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName
