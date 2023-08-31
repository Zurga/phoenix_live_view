import {
  PHX_VIEW_SELECTOR
} from "./constants"

import EntryUploader from "./entry_uploader"

export const logError = (msg, obj) => console?.error(msg, obj)

export const isCid = (cid) => {
  const type = typeof(cid)
  return type === "number" || (type === "string" && /^(0|[1-9]\d*)$/.test(cid))
}

export function detectDuplicateIds(){
  const ids = new Set()
  const elems = document.querySelectorAll("*[id]")
  for(let i = 0, len = elems.length; i < len; i++){
    if(ids.has(elems[i].id)){
      console.error(`Multiple IDs detected: ${elems[i].id}. Ensure unique element ids.`)
    } else {
      ids.add(elems[i].id)
    }
  }
}

export const debug = (view, kind, msg, obj) => {
  if(view.liveSocket.isDebugEnabled()){
    console.log(`${view.id} ${kind}: ${msg} - `, obj)
  }
}

// wraps value in closure or returns closure
export const closure = (val) => typeof val === "function" ? val : function (){ return val }

export const clone = (obj) => { return JSON.parse(JSON.stringify(obj)) }

export const closestPhxBinding = (el, binding, borderEl) => {
  do {
    if(el.matches(`[${binding}]`) && !el.disabled){ return el }
    el = el.parentElement || el.parentNode
  } while(el !== null && el.nodeType === 1 && !((borderEl && borderEl.isSameNode(el)) || el.matches(PHX_VIEW_SELECTOR)))
  return null
}

export const isObject = (obj) => {
  return obj !== null && typeof obj === "object" && !(obj instanceof Array)
}

export const isEqualObj = (obj1, obj2) => JSON.stringify(obj1) === JSON.stringify(obj2)

export const isEmpty = (obj) => {
  for(const x in obj){ return false }
  return true
}

export const maybe = (el, callback) => el && callback(el)

export const channelUploader = function (entries, onError, resp, liveSocket){
  maxConcurrency = resp.config.max_concurrency
  const entryUploaders = entries.map(entry => new EntryUploader(entry, resp.config.chunk_size, liveSocket))

  if (entries.length <= maxConcurrency) {
    entryUploaders.forEach(uploader => uploader.upload(() => null))
  } else {
    uploadInBatches(entryUploaders, maxConcurrency)
  }
}

const uploadInBatches = function(entryUploaders, maxConcurrency) {
  // Filter out the entries that have already started uploading or are done uploading or are cancelled
  const uploadersToProcess = entryUploaders.filter((u) => !(u.isDone() || u.hasStarted()) && !u.entry._isCancelled)

  if (uploadersToProcess.length === 0) return

  const inProgress = entryUploaders.filter(u => u.hasStarted() && !u.isDone()).length

  for (let i = 0; i < maxConcurrency - inProgress; i++) {
    const uploader = uploadersToProcess[i]
    if (uploader && !uploader.hasStarted() && !uploader.isDone()) {
        // Add a callback to schedule new uploads when the upload is finished.
        uploader.upload(() => uploadInBatches(entryUploaders, maxConcurrency))
    }
  }
}
