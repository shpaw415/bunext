import type { DynamicComponent } from "..";

export type ComponentType = {
  /**
   * @param pathName the path to the component
   * @param elementName the name of the component
   * @param props the props to pass to the component
   * @returns the component
   */
  DynamicComponent: typeof DynamicComponent;
};
