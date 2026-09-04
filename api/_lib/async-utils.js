// async-utils.js — 小型有界并发工具，避免一次推荐把上游 API 并发打满。

async function settleMapLimit(items, limit, worker) {
  const list = Array.from(items || []);
  const out = new Array(list.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= list.length) return;
      try {
        out[index] = { status: "fulfilled", value: await worker(list[index], index) };
      } catch (reason) {
        out[index] = { status: "rejected", reason };
      }
    }
  }

  const width = Math.max(1, Math.min(Number(limit) || 1, list.length || 1));
  await Promise.all(Array.from({ length: width }, run));
  return out;
}

module.exports = { settleMapLimit };
