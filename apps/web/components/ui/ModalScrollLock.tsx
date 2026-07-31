'use client'
import { useEffect } from 'react'

/**
 * Stops the page behind a modal from scrolling, for every modal in the app at once.
 *
 * Mounted once in the dashboard layout rather than wired into each modal: there are ~40
 * modal backdrops across ~18 files, almost all of them inline JSX rather than a shared
 * component, so a per-modal hook would mean 40 edits and would still be missed by the next
 * modal somebody writes. Watching the DOM covers all of them and keeps covering them.
 *
 * The selector is the convention every modal in this codebase already follows: a full-screen
 * backdrop, `fixed inset-0` with a `bg-black/NN` scrim. The `bg-black` part is what makes it
 * specific — plain `fixed inset-0` also matches click-away layers behind dropdown menus,
 * which should NOT lock scrolling. A new modal only needs to keep using the same backdrop
 * classes, which is what copying any existing modal already gives you.
 *
 * The modal's own panel is unaffected: it is its own scroll container (`overflow-y-auto`),
 * and locking the BODY does not touch it. Scroll the sheet, not the page behind it.
 */
const MODAL_BACKDROP = '.fixed.inset-0[class*="bg-black"]'

export default function ModalScrollLock() {
  useEffect(() => {
    const body = document.body
    let queued: ReturnType<typeof setTimeout> | null = null

    const sync = () => {
      queued = null
      const modalOpen = document.querySelector(MODAL_BACKDROP) !== null
      const locked = body.dataset.modalScrollLocked === '1'
      if (modalOpen === locked) return

      if (modalOpen) {
        // Replace the scrollbar's width with padding, or the page visibly jumps sideways
        // as it vanishes — most noticeable on a wide table like Students, where the whole
        // grid shifts under the modal.
        const scrollbar = window.innerWidth - document.documentElement.clientWidth
        body.dataset.modalScrollLocked = '1'
        body.style.overflow = 'hidden'
        if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
      } else {
        delete body.dataset.modalScrollLocked
        body.style.overflow = ''
        body.style.paddingRight = ''
      }
    }

    // Coalesced into a single pass per tick: the observer watches class attributes across the
    // whole tree, which React re-renders touch constantly, and re-querying on every one of
    // those would be pure waste. A timeout rather than requestAnimationFrame deliberately —
    // nothing here is tied to painting, and rAF stops firing in a backgrounded or headless
    // tab, which would strand the page locked after a modal closed.
    const schedule = () => { if (!queued) queued = setTimeout(sync, 0) }

    sync()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
    })

    return () => {
      observer.disconnect()
      if (queued) clearTimeout(queued)
      // Never leave the page unscrollable if this unmounts while a modal is up.
      delete body.dataset.modalScrollLocked
      body.style.overflow = ''
      body.style.paddingRight = ''
    }
  }, [])

  return null
}
