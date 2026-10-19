/* Minimal BM25 search over JSON chunks, in the browser. No API keys. */
(function (g) {
  const STOP = new Set("a an the is are was were be been do does did how what when where why which who your you my our i me we they them it its of in on at to for from with by about into over after before and or but if than then so as this that these those can could would should will just only also very more most any all each every".split(" "));
  function stem(t) {
    if (t.length <= 3) return t;
    if (t.endsWith("ies") && t.length > 4) return t.slice(0, -3) + "y";
    if (t.endsWith("ing") && t.length > 5) return t.slice(0, -3);
    if (t.endsWith("es") && t.length > 4 && /(s|sh|ch|x)es$/.test(t)) return t.slice(0, -2);
    if (t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
    return t;
  }
  function tokens(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter((t) => t && !STOP.has(t) && t.length > 1).map(stem);
  }
  function buildIndex(docs) {
    const N = docs.length, df = {}, lens = [], tfs = [];
    docs.forEach((d) => {
      const tk = tokens(d.title + " " + d.text), tf = {};
      tk.forEach((t) => (tf[t] = (tf[t] || 0) + 1));
      Object.keys(tf).forEach((t) => (df[t] = (df[t] || 0) + 1));
      lens.push(tk.length); tfs.push(tf);
    });
    const avg = lens.reduce((a, b) => a + b, 0) / Math.max(1, N);
    return { docs, df, lens, tfs, avg, N };
  }
  function score(ix, q, k1 = 1.4, b = 0.75) {
    const qt = [...new Set(tokens(q))];
    return ix.docs.map((d, i) => {
      let s = 0;
      qt.forEach((t) => {
        const f = ix.tfs[i][t]; if (!f) return;
        const idf = Math.log(1 + (ix.N - ix.df[t] + 0.5) / (ix.df[t] + 0.5));
        s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + (b * ix.lens[i]) / ix.avg));
      });
      return { id: d.id, score: s };
    }).filter((h) => h.score > 0).sort((a, b) => b.score - a.score);
  }
  g.NyyoBM25 = { buildIndex, score, tokens };
})(window);
