// Browser-only helper: convert any image File into a JPEG Blob via <canvas>,
// scaling down so the longest side is at most `maxDimension`. Only call from
// client component handlers (relies on `document` / DOM canvas APIs).
export async function convertToJpg(
  file: File,
  maxDimension = 2000,
): Promise<Blob> {
  const url = URL.createObjectURL(file)

  try {
    const image = await loadImage(url)

    const longest = Math.max(image.width, image.height)
    const scale = longest > maxDimension ? maxDimension / longest : 1
    const width = Math.round(image.width * scale)
    const height = Math.round(image.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Could not get canvas 2D context')
    }
    ctx.drawImage(image, 0, 0, width, height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to encode image as JPEG'))
          }
        },
        'image/jpeg',
        0.85,
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load image'))
    image.src = url
  })
}
