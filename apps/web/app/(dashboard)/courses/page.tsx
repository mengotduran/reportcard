'use client'
/**
 * /courses — the same screen as /subjects, under the name a university actually uses.
 *
 * A university teaches courses, so the sidebar sends it here and the address bar agrees
 * with the page it lands on. Both routes stay alive on purpose: /subjects is correct for
 * primary and secondary schools, and anything already bookmarked or linked keeps working.
 *
 * Deliberately a re-export rather than a copy: two files would drift, and the page already
 * says Course/Courses by itself (it branches on the school type, see its `tt` helper).
 */
export { default } from '../subjects/page'
