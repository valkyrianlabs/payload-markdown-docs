declare module 'next/cache' {
  export function unstable_cache<TArgs extends unknown[], TResult>(
    cb: (...args: TArgs) => Promise<TResult>,
    keyParts?: string[],
    options?: {
      revalidate?: false | number
      tags?: string[]
    },
  ): (...args: TArgs) => Promise<TResult>
}
