import { handleTravel } from './travel.mjs';

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/') || path.startsWith('/_AMapService/')) {
      return handleTravel(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
