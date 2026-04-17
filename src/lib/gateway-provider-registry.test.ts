import assert from "node:assert/strict";
import test from "node:test";

import {
  __gatewayProviderRegistryTestUtils,
  listGatewayModels,
} from "@/lib/gateway-provider-registry";

test("模型目录包含火山引擎图片模型 doubao-seedream-4-5-251128", () => {
  __gatewayProviderRegistryTestUtils.reset();

  const model = listGatewayModels().find((entry) => entry.id === "doubao-seedream-4-5-251128");

  assert.deepEqual(model, {
    id: "doubao-seedream-4-5-251128",
    modality: "image",
    capability: "generate",
    async: false,
    providers: ["volcengine"],
  });
});
