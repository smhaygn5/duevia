type ProviderRequest = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

export async function providerRequestWithTimeout<T>(
  provider: Pick<EthereumProvider, "request">,
  request: ProviderRequest,
  timeoutMs = 2_500,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("The wallet extension did not respond in time.")),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([
      provider.request<T>(request),
      timeout,
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
