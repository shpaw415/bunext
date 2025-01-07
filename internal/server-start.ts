// this is called on server start

import CacheManager from "./caching";

export default function Make() {
  CacheManager.clearSSR();
}
