type Env = {
  VITE_MAHORAGA_API_BASE?: string
  MAHORAGA_PUBLIC_API_BASE?: string
}

export async function onRequestGet(context: { env: Env }): Promise<Response> {
  const { env } = context
  const a =
    typeof env.VITE_MAHORAGA_API_BASE === 'string' ? env.VITE_MAHORAGA_API_BASE.trim() : ''
  const b =
    typeof env.MAHORAGA_PUBLIC_API_BASE === 'string' ? env.MAHORAGA_PUBLIC_API_BASE.trim() : ''
  const apiBase = a || b
  return Response.json(
    { apiBase },
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'private, max-age=60',
      },
    },
  )
}

