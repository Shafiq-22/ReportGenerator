import { Children, cloneElement, isValidElement, type ReactElement } from 'react'
import { cn } from '@/lib/utils'

/**
 * Minimal `asChild` support: merges props onto a single child element.
 * Enough for wrapping links in button styles without pulling in Radix.
 */
export function Slot({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  const child = Children.only(children) as ReactElement<Record<string, unknown>>
  if (!isValidElement(child)) return null

  const childProps = child.props as { className?: string }

  return cloneElement(child, {
    ...props,
    className: cn(className, childProps.className),
  })
}
