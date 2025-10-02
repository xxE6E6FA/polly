/// <reference types="vitest/globals" />

import type { Mock as VitestMock } from "vitest";

declare global {
  namespace vi {
    export type Mock<T = any, Y extends any[] = any> = VitestMock<Y, T>;
  }
}
