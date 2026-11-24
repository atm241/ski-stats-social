/**
 * Retries a flaky network operation (DNS blips, dropped range requests) with a growing pause.
 * The default rides out roughly five minutes of outage (5+10+…+40 s), which covers the DNS dropouts
 * seen on long build queues.
 */
export async function retry<T>(what: string, fn: () => Promise<T>, attempts = 9): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts) throw e;
      const wait = 5 * i;
      console.warn(`${what} failed (${e instanceof Error ? e.message : e}); retry ${i}/${attempts - 1} in ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
}
