// Shared types for the brief wizard (page + step components + hook).

export type DesignMode = 'TEMPLATE' | 'GENERATE'
export type ImageIntent = 'embed' | 'reference'

export interface UploadedImage {
  id: string
  url: string
  filename: string
  intent: ImageIntent
}
