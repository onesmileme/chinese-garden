declare module "@tarojs/components" {
  import type { FC, ReactNode } from "react";

  type TaroElementProps = Record<string, unknown> & {
    children?: ReactNode;
  };

  export const View: FC<TaroElementProps>;
  export const Text: FC<TaroElementProps>;
  export const Button: FC<TaroElementProps>;
}
