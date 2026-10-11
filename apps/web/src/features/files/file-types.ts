import type { IconName } from '@studio/ui';
export const fileTypeCatalog: Record<string, { color: string; icon: IconName; name: string }> = {
  fig: { color: '#8662C9', icon: 'pen-tool', name: 'Figma' }, pdf: { color: '#C4473A', icon: 'file-text', name: 'PDF' }, zip: { color: '#6B7280', icon: 'folder-archive', name: 'Archive file' }, img: { color: '#23918A', icon: 'image', name: 'Image' }, sheet: { color: '#3D8E5F', icon: 'file-spreadsheet', name: 'Spreadsheet' }, doc: { color: '#3B82C4', icon: 'file-text', name: 'Document' }, code: { color: '#C48A1E', icon: 'file-code', name: 'Code' }, other: { color: '#6B7280', icon: 'file', name: 'File' },
};
