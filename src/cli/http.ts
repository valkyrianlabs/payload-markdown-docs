export type HttpPostJsonArgs = {
  body: string
  headers: Record<string, string>
  url: string
}

export type HttpPostJsonResponse = {
  body: unknown
  ok: boolean
  status: number
  text: string
}

export type HttpPostJson = (
  args: HttpPostJsonArgs,
) => Promise<HttpPostJsonResponse>

const parseResponseBody = (text: string): unknown => {
  if (text.trim() === '') {
    return undefined
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

export const postJson: HttpPostJson = async ({
  body,
  headers,
  url,
}: HttpPostJsonArgs): Promise<HttpPostJsonResponse> => {
  const response = await fetch(url, {
    body,
    headers,
    method: 'POST',
  })
  const text = await response.text()

  return {
    body: parseResponseBody(text),
    ok: response.ok,
    status: response.status,
    text,
  }
}
