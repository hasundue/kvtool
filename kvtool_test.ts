import { assertEquals } from "https://deno.land/std@0.136.0/testing/asserts.ts";
import { readConfig } from "./kvtool.ts";

Deno.test("readConfig", async () => {
  const config = await readConfig("./test/wrangler.toml");
  assertEquals(config.accountId, "00000000000000000000000000000000");
  assertEquals(config.apiToken, "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
});
