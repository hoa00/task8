export function sourceFileType(name: string): string {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (ext === 'fig' || ext === 'pdf') return ext;
  if (['zip', 'rar', '7z'].includes(ext)) return 'zip';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'].includes(ext)) return 'img';
  if (['xlsx', 'xls', 'csv', 'numbers'].includes(ext)) return 'sheet';
  if (['doc', 'docx', 'txt', 'md', 'pages', 'rtf'].includes(ext)) return 'doc';
  if (['js', 'ts', 'json', 'html', 'css', 'py'].includes(ext)) return 'code';
  return 'other';
}
export function displayFileSize(bytes: number): string { if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`; return `${(bytes / 1048576).toFixed(1)} MB`; }
