export async function gzip(text: string): Promise<Blob> {
  if (!('CompressionStream' in window)) return new Blob([text], { type: 'application/json' })
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).blob()
}
export async function gunzip(file: Blob & { name?: string }): Promise<string> {
  const gzipFile = file.name?.endsWith('.gz') || file.type.includes('gzip')
  if (!gzipFile) return file.text()
  if (!('DecompressionStream' in window)) throw new Error('This browser cannot open compressed backups.')
  return new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text()
}
