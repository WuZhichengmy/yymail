export default {
  async fetch(request, env) {
    // Keep serving the website while backend APIs are added incrementally.
    return env.ASSETS.fetch(request);
  },
};
