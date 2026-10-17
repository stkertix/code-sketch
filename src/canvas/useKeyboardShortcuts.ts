import { useEffect } from 'react'
import { useDiagramStore } from '@/diagram/store'

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
  '',
])

/** True only when the user is editing text (not color/checkbox/button/select). */
function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
    return true
  }

  const field = target.closest('textarea, input')
  if (!field) return false

  if (field instanceof HTMLTextAreaElement) {
    return !field.readOnly && !field.disabled
  }

  if (field instanceof HTMLInputElement) {
    if (field.readOnly || field.disabled) return false
    return TEXT_INPUT_TYPES.has(field.type)
  }

  return false
}

function blurTextEditors() {
  const active = document.activeElement
  if (active instanceof HTMLElement && isTextEditingTarget(active)) {
    active.blur()
  }
}

/**
 * Diagram keyboard shortcuts. Uses capture so React Flow / focused nodes cannot
 * swallow Delete / ⌘A before we handle them.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const typing = isTextEditingTarget(e.target)
      const mod = e.metaKey || e.ctrlKey
      const key = e.key
      const code = e.code
      const store = useDiagramStore.getState()

      // Escape always leaves text fields so the next shortcut hits the canvas
      if (key === 'Escape') {
        if (typing) {
          e.preventDefault()
          blurTextEditors()
        }
        return
      }

      // While typing in a field, leave text editing to the browser
      // (⌘A selects field text, Backspace deletes characters, etc.)
      if (typing) return

      if (mod && !e.shiftKey && (key.toLowerCase() === 'z' || code === 'KeyZ')) {
        e.preventDefault()
        e.stopPropagation()
        store.undo()
        return
      }
      if (
        (mod && (key.toLowerCase() === 'y' || code === 'KeyY')) ||
        (mod && e.shiftKey && (key.toLowerCase() === 'z' || code === 'KeyZ'))
      ) {
        e.preventDefault()
        e.stopPropagation()
        store.redo()
        return
      }
      if (mod && (key.toLowerCase() === 'd' || code === 'KeyD')) {
        e.preventDefault()
        e.stopPropagation()
        store.duplicateSelected()
        return
      }
      if (mod && !e.shiftKey && (key.toLowerCase() === 'a' || code === 'KeyA')) {
        e.preventDefault()
        e.stopPropagation()
        store.selectAll()
        return
      }
      if (mod && e.shiftKey && (key.toLowerCase() === 'l' || code === 'KeyL')) {
        e.preventDefault()
        e.stopPropagation()
        store.autoLayout()
        return
      }
      if (mod && (key === ']' || code === 'BracketRight')) {
        e.preventDefault()
        e.stopPropagation()
        store.bringToFront()
        return
      }
      if (mod && (key === '[' || code === 'BracketLeft')) {
        e.preventDefault()
        e.stopPropagation()
        store.sendToBack()
        return
      }
      if (key === 'Delete' || key === 'Backspace' || code === 'Delete' || code === 'Backspace') {
        e.preventDefault()
        e.stopPropagation()
        store.deleteSelected()
      }
    }

    // Capture phase: run before React Flow / focused node handlers
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
}

/** Call from the canvas so clicking the diagram returns focus from inspector/toolbar fields. */
export function blurActiveTextEditor() {
  blurTextEditors()
}
