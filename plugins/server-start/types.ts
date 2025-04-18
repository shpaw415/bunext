export type ServerStart = Partial<{
  /**
   * executed on the main thread
   */
  main: () => Promise<any> | any;
  /**
   * executed on clusters in multi-threaded mode
   */
  cluster: () => Promise<any> | any;
  /**
   * executed on dev mode
   */
  dev: () => Promise<any> | any;
}>;
