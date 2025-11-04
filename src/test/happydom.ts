import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * Register Happy DOM once for the Bun test environment.
 * See https://bun.com/docs/guides/test/happy-dom
 */
if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register();
}
