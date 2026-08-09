import { motion } from 'framer-motion'
import type { ActionCategory } from '@/planner/actions/types'
import { cn } from '@/shared/utils/cn'

interface CategoryDemoProps {
  category: ActionCategory
  className?: string
}

/** Lightweight shared visuals per category (not one animation per event). */
export function CategoryDemo({ category, className }: CategoryDemoProps) {
  return (
    <div
      className={cn(
        'relative h-36 overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-muted/80 via-card to-muted/40',
        className,
      )}
    >
      <DemoInner category={category} />
    </div>
  )
}

function DemoInner({ category }: { category: ActionCategory }) {
  switch (category) {
    case 'mouse':
      return <MouseDemo />
    case 'keyboard':
    case 'input':
      return <KeyboardDemo />
    case 'wait':
    case 'element':
      return <WaitDemo />
    case 'loops':
      return <LoopDemo />
    case 'conditions':
      return <BranchDemo />
    case 'browser':
      return <BrowserDemo />
    case 'ai':
      return <AiDemo />
    case 'clipboard':
    case 'downloads':
      return <CopyDemo />
    case 'flow':
      return <FlowDemo />
    default:
      return <GenericDemo />
  }
}

function MouseDemo() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <motion.div
        className="relative flex h-12 w-36 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-md"
        animate={{ scale: [1, 0.96, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        Button
        <motion.span
          className="absolute -right-1 -top-1 h-4 w-4 rounded-full border-2 border-sky-500 bg-sky-400/40"
          animate={{ x: [40, 0, 0], y: [28, 0, 0], opacity: [0, 1, 0.35] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.span
          className="absolute inset-0 rounded-xl border-2 border-sky-400/50"
          animate={{ opacity: [0, 0, 0.8, 0], scale: [1, 1, 1.08, 1.15] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
      </motion.div>
    </div>
  )
}

function KeyboardDemo() {
  const keys = ['A', 'I', '…']
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
      <div className="flex h-9 w-full max-w-xs items-center rounded-lg border border-border bg-background px-3 font-mono text-sm">
        <motion.span
          className="text-foreground"
          animate={{ opacity: [0.3, 1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          Prompt
        </motion.span>
        <motion.span
          className="ml-0.5 inline-block h-4 w-0.5 bg-primary"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
      </div>
      <div className="flex gap-1.5">
        {keys.map((key, i) => (
          <motion.span
            key={key}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-xs font-semibold"
            animate={{ y: [0, -4, 0], backgroundColor: ['', '', ''] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          >
            {key}
          </motion.span>
        ))}
      </div>
    </div>
  )
}

function WaitDemo() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-slate-400/50"
          animate={{ scale: [0.7, 1.15], opacity: [0.7, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
        />
        <motion.span
          className="absolute inset-2 rounded-full border-2 border-slate-500/40"
          animate={{ scale: [0.7, 1.15], opacity: [0.7, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut', delay: 0.35 }}
        />
        <span className="relative text-xs font-semibold text-muted-foreground">Wait</span>
      </div>
    </div>
  )
}

function LoopDemo() {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="h-10 w-10 rounded-xl border border-orange-500/40 bg-orange-500/15"
          animate={{ scale: [0.9, 1.05, 0.9], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.25 }}
        />
      ))}
      <motion.span
        className="absolute text-[11px] font-semibold text-orange-700 dark:text-orange-300"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        item 1 → 2 → 3
      </motion.span>
    </div>
  )
}

function BranchDemo() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative h-24 w-48">
        <div className="absolute left-1/2 top-2 h-8 w-16 -translate-x-1/2 rounded-lg bg-pink-500/20 text-center text-[10px] font-semibold leading-8 text-pink-700 dark:text-pink-300">
          If
        </div>
        <motion.div
          className="absolute left-4 top-14 h-8 w-14 rounded-lg bg-emerald-500/25 text-center text-[10px] font-semibold leading-8 text-emerald-700 dark:text-emerald-300"
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        >
          true
        </motion.div>
        <motion.div
          className="absolute right-4 top-14 h-8 w-14 rounded-lg bg-rose-500/25 text-center text-[10px] font-semibold leading-8 text-rose-700 dark:text-rose-300"
          animate={{ opacity: [1, 0.35, 1] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        >
          false
        </motion.div>
      </div>
    </div>
  )
}

function BrowserDemo() {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-8">
      <div className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-rose-400" />
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <motion.div
            className="ml-2 h-4 flex-1 rounded bg-muted"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
        <motion.div
          className="h-16 bg-gradient-to-r from-teal-500/20 to-transparent"
          animate={{ x: ['-10%', '10%', '-10%'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  )
}

function AiDemo() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-2 px-8">
      <div className="self-end max-w-[70%] rounded-2xl rounded-br-md bg-primary/15 px-3 py-2 text-[11px]">
        Prompt…
      </div>
      <motion.div
        className="self-start max-w-[75%] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-[11px] text-muted-foreground"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.6, repeat: Infinity }}
      >
        ● ● ● responding
      </motion.div>
    </div>
  )
}

function CopyDemo() {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-4">
      <motion.div
        className="h-14 w-20 rounded-xl border border-border bg-card p-2 text-[10px] text-muted-foreground"
        animate={{ scale: [1, 0.98, 1] }}
        transition={{ duration: 1.4, repeat: Infinity }}
      >
        Copy
      </motion.div>
      <motion.span
        className="text-xs font-semibold text-amber-600 dark:text-amber-300"
        animate={{ x: [-6, 6, -6], opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.4, repeat: Infinity }}
      >
        →
      </motion.span>
      <motion.div
        className="h-14 w-24 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2 text-[10px]"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.4, repeat: Infinity }}
      >
        story-1
      </motion.div>
    </div>
  )
}

function FlowDemo() {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-3">
      {['Start', '…', 'End'].map((label, i) => (
        <div key={label} className="flex items-center gap-3">
          <motion.div
            className="rounded-xl border border-border bg-card px-3 py-2 text-[11px] font-semibold"
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.25 }}
          >
            {label}
          </motion.div>
          {i < 2 ? <span className="text-muted-foreground">→</span> : null}
        </div>
      ))}
    </div>
  )
}

function GenericDemo() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <motion.div
        className="h-12 w-12 rounded-2xl bg-primary/20"
        animate={{ rotate: [0, 8, -8, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 2.2, repeat: Infinity }}
      />
    </div>
  )
}
