import {
  PHX_ACTIVE_ENTRY_REFS,
  PHX_LIVE_FILE_UPDATED,
  PHX_PREFLIGHTED_REFS
} from "./constants"

import {
  channelUploader,
  logError
} from "./utils"

import LiveUploader from "./live_uploader"
let toCanvas = function(imgEl){
          // We resize the image, such that it fits in the configured height x width, but
          // keep the aspect ratio. We could also easily crop, pad or squash the image, if desired
          const canvas = document.createElement("canvas")
          const ctx = canvas.getContext("2d")
          const widthScale = this.boundWidth / imgEl.width
          const heightScale = this.boundHeight / imgEl.height
          const scale = Math.min(widthScale, heightScale)
          canvas.width = Math.round(imgEl.width * scale)
          canvas.height = Math.round(imgEl.height * scale)
          ctx.drawImage(imgEl, 0, 0, imgEl.width, imgEl.height, 0, 0, canvas.width, canvas.height)
          return canvas
        }

let        canvasToBlob = function(canvas){
          const imageData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
          const buffer = this.imageDataToRGBBuffer(imageData)
          const meta = new ArrayBuffer(8)
          const view = new DataView(meta)
          view.setUint32(0, canvas.height, false)
          view.setUint32(4, canvas.width, false)
          return new Blob([meta, buffer], {type: "application/octet-stream"})
        }

let         imageDataToRGBBuffer =  function(imageData){
          const pixelCount = imageData.width * imageData.height
          const bytes = new Uint8ClampedArray(pixelCount * 3)
          for(let i = 0; i < pixelCount; i++) {
            bytes[i * 3] = imageData.data[i * 4]
            bytes[i * 3 + 1] = imageData.data[i * 4 + 1]
            bytes[i * 3 + 2] = imageData.data[i * 4 + 2]
          }
          return bytes.buffer
        }

export default class UploadEntry {
  static isActive(fileEl, file){
    let isNew = file._phxRef === undefined
    let activeRefs = fileEl.getAttribute(PHX_ACTIVE_ENTRY_REFS).split(",")
    let isActive = activeRefs.indexOf(LiveUploader.genFileRef(file)) >= 0
    return file.size > 0 && (isNew || isActive)
  }

  static isPreflighted(fileEl, file){
    let preflightedRefs = fileEl.getAttribute(PHX_PREFLIGHTED_REFS).split(",")
    let isPreflighted = preflightedRefs.indexOf(LiveUploader.genFileRef(file)) >= 0
    return isPreflighted && this.isActive(fileEl, file)
  }

  constructor(fileEl, file, view){
    this.ref = LiveUploader.genFileRef(file)
    this.fileEl = fileEl
    this.file = file
    this.view = view
    this.meta = null
    this._isCancelled = false
    this._isDone = false
    this._progress = 0
    this._lastProgressSent = -1
    this._onDone = function (){ }
    this._onElUpdated = this.onElUpdated.bind(this)
    this.fileEl.addEventListener(PHX_LIVE_FILE_UPDATED, this._onElUpdated)
  }

  metadata(){ return this.meta }

  progress(progress){
    this._progress = Math.floor(progress)
    if(this._progress > this._lastProgressSent){
      if(this._progress >= 100){
        this._progress = 100
        this._lastProgressSent = 100
        this._isDone = true
        this.view.pushFileProgress(this.fileEl, this.ref, 100, () => {
          LiveUploader.untrackFile(this.fileEl, this.file)
          this._onDone()
        })
      } else {
        this._lastProgressSent = this._progress
        this.view.pushFileProgress(this.fileEl, this.ref, this._progress)
      }
    }
  }

  cancel(){
    this._isCancelled = true
    this._isDone = true
    this._onDone()
  }

  isDone(){ return this._isDone }

  error(reason = "failed"){
    this.fileEl.removeEventListener(PHX_LIVE_FILE_UPDATED, this._onElUpdated)
    this.view.pushFileProgress(this.fileEl, this.ref, {error: reason})
    LiveUploader.clearFiles(this.fileEl)
  }

  //private

  onDone(callback){
    this._onDone = () => {
      this.fileEl.removeEventListener(PHX_LIVE_FILE_UPDATED, this._onElUpdated)
      callback()
    }
  }

  onElUpdated(){
    let activeRefs = this.fileEl.getAttribute(PHX_ACTIVE_ENTRY_REFS).split(",")
    if(activeRefs.indexOf(this.ref) === -1){ this.cancel() }
  }

  toPreflightPayload(){
    return {
      last_modified: this.file.lastModified,
      name: this.file.name,
      relative_path: this.file.webkitRelativePath,
      size: this.file.size,
      type: this.file.type,
      ref: this.ref
    }
  }

  uploader(uploaders){
    if(this.meta.uploader){
      let callback = uploaders[this.meta.uploader] || logError(`no uploader configured for ${this.meta.uploader}`)
      return {name: this.meta.uploader, callback: callback}
    } else {
      return {name: "channel", callback: channelUploader}
    }
  }

  zipPostFlight(resp){
    this.meta = resp.entries[this.ref]
    if(!this.meta){ logError(`no preflight upload response returned with ref ${this.ref}`, {input: this.fileEl, response: resp}) }
  }
}
