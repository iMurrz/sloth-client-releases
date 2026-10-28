// Stop scheduling on failure, cancel in-flight work and wait for it to settle.
async function parallelJobs(items, limit, job, signal) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', cancel, {once:true});
  let cursor = 0, failure;
  const worker = async () => {
    while (!controller.signal.aborted && cursor < items.length) {
      const index = cursor++;
      try { await job(items[index], index, controller.signal); }
      catch (error) { if (!failure) failure = error; controller.abort(error); }
    }
  };
  try {
    await Promise.allSettled(Array.from({length:Math.min(limit,items.length)}, worker));
    signal?.throwIfAborted();
    if (failure) throw failure;
  } finally { signal?.removeEventListener('abort', cancel); }
}
module.exports = {parallelJobs};
